// dsh-long-term-memory — layered deterministic long-term memory for DSH.
//
// A static Host plugin that composes existing DSH seams (no core changes):
//   - four model-facing tools: memory_write / memory_recall / memory_list /
//     memory_forget
//   - one per-assembly dynamic-context contribution that injects a bounded
//     "recent memory" digest into each request
//   - an optional write-approval gate via `tools/pre-execute` returning
//     `{ kind: 'ask' }`, which the tool registry resolves through the approval
//     seam (fail-closed when no approval service is mounted)
//   - deterministic CJK-aware BM25 recall (no embeddings, no extra model calls)
//
// Storage is plain JSONL. `global` scope lives under $DSH_HOME/dsh-memory;
// `workspace` scope lives in the session's working directory at
// `.dsh/memory.jsonl`, so it is human-editable and can be committed with the
// project. The plugin never mutates a DSH core package.

import { dirname, isAbsolute, resolve, sep } from 'node:path'
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import z from '@deepseek-ai/schemastery'
import { dshHomePath } from '@deepseek-ai/dsh-home-paths'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { MemoryStore, DEFAULT_CHAR_LIMIT, exportBundle, parseExportBundle } from './store.js'
import { scanThreats } from './threats.js'
import { askLlm } from './llm.js'
import { newUserText, parseFacts, compressRules, buildInjectionBlock, filterByTags, similarity, QUERY_EXPAND_PROMPT, RERANK_PROMPT, parseStringArray, parseIndexArray } from './automation.js'

export const name = 'long-term-memory'
export const inject = ['tools', 'systemPrompt', 'commands', 'settings', 'agents', 'workspaceRegistry']
/** Default number of results returned when the caller omits `limit`. */
const DEFAULT_RECALL_LIMIT = 5
/** Hard cap on a single tool's recall/list result count. */
const MAX_RESULTS = 25
/** Bounds the per-assembly injected digest so it never dominates a request. */
const DEFAULT_MAX_INJECTED_CHARS = 2400
/** How many recent memories each scope may contribute to the injected digest. */
const DEFAULT_TIMELINE_INJECTED_SPLIT = 4
/** Prompt-section order; tool guidance lives in the 100–199 band. */
const TOOL_GUIDANCE_ORDER = 118
/** Dynamic-context order; after other runtime-context rows (100–119). */
const CONTEXT_ORDER = 130

/** Scope precedence for injection and "all" scans: user profile first. */
const SCOPE_PRIORITY = ['user', 'global', 'workspace']
const SCOPES = new Set(SCOPE_PRIORITY)

/** How the plugin injects memory each assembly. */
const INJECT_MODES = new Set(['recent', 'full', 'off'])

/** Coerce legacy boolean config (`injectContext: true/false`) into a mode. */
function normalizeInjectMode(value) {
  if (value === undefined || value === true) return 'recent'
  if (value === false) return 'off'
  if (INJECT_MODES.has(value)) return value
  throw new Error(`invalid injectContext mode "${value}" (expected "recent", "full", or "off")`)
}

function assertScope(scope) {
  if (scope === undefined) return undefined
  if (!SCOPES.has(scope)) {
    throw new Error(`invalid memory scope "${scope}" (expected "user", "global", or "workspace")`)
  }
  return scope
}

/**
 * Resolve the workspace root for a session. `ctx.session.header.cwd` is the
 * immutable workspace-write boundary; the configured root is the fallback for
 * agentless calls or sessions without a cwd.
 *
 * The session's `header.cwd` is authoritative for an in-session call. But the
 * memory panel is a Web UI that also reaches these routes over plain HTTP,
 * where there is no agent initiator and `session` is `undefined` — so `cwd` is
 * empty. The old fallback was `process.cwd()`, which is the directory the dsh
 * web process was launched from (e.g. the user's home), NOT the registered
 * workspace. That made the workspace scope read a file that does not exist and
 * report an empty list. When there is no session, resolve from the workspace
 * registry instead: the registered workspace whose path is the longest prefix
 * of `process.cwd()` (the process runs inside one), else the first registered
 * workspace. `config.workspaceRoot` and `process.cwd()` remain only as a last
 * resort when the registry is unavailable.
 */
function resolveWorkspaceRoot(session, config, ctx) {
  const cwd = session?.header?.cwd
  if (typeof cwd === 'string' && cwd.length > 0) return resolve(cwd)
  const reg = ctx?.workspaceRegistry
  if (reg !== undefined) {
    try {
      const canon = resolve(process.cwd())
      let best
      for (const ws of reg.list()) {
        const path = resolve(ws.path)
        // Prefer the registered workspace whose root contains the process cwd;
        // among several, the deepest (longest) match wins.
        if (canon === path || canon.startsWith(path + sep)) {
          if (best === undefined || path.length > best.length) best = path
        }
      }
      if (best !== undefined) return best
      const first = reg.list()[0]
      if (first !== undefined) return resolve(first.path)
    } catch {
      /* a misbehaving registry must not break memory resolution */
    }
  }
  return resolve(config.workspaceRoot ?? process.cwd())
}

/**
 * Absolute backing-file path for one scope. `user` and `global` are shared
 * files under the harness home (user profile first-class, global for
 * cross-project facts); `workspace` is one file per workspace root.
 */
function storePathFor(scope, workspaceRoot, config) {
  if (scope === 'user') return config.userFile ?? dshHomePath('dsh-memory', 'user.jsonl')
  if (scope === 'global') return config.globalFile ?? dshHomePath('dsh-memory', 'global.jsonl')
  if (scope === 'workspace') {
    const base = config.workspaceFile ?? `.dsh/memory.jsonl`
    return isAbsolute(base) ? base : resolve(workspaceRoot, base)
  }
  throw new Error(`unsupported memory scope ${scope}`)
}

// ── Self-hosted settings persistence ─────────────────────────────────────────
// This profile does NOT mount the DSH settings service, so the plugin cannot rely
// on ctx.settings to persist the panel's toggles. Instead we own a small JSON
// file under $DSH_HOME/dsh-memory/settings.json and treat it as the source of
// truth for any key the user has changed. Falls back to the static cfg (from the
// cordis patch) when the file is missing/corrupt — graceful, never fatal.
const SETTINGS_KEYS = [
  'autoSummarize', 'compressWithLLM', 'injectContext', 'injectTags',
  'requireApprovalForWrite', 'autoApproveAfterMs', 'charLimit',
  'semanticRecall', 'semanticRerank', 'semanticVectorRecall',
  'semanticDedupThreshold', 'autoConsolidate', 'consolidateIntervalMs',
  'consolidateMaxEntries',
]
function settingsFilePath() {
  return dshHomePath('dsh-memory', 'settings.json')
}
function loadSettingsFile() {
  try {
    if (!existsSync(settingsFilePath())) return {}
    const raw = readFileSync(settingsFilePath(), 'utf8')
    const parsed = JSON.parse(raw)
    if (parsed && typeof parsed === 'object') {
      const out = {}
      for (const k of SETTINGS_KEYS) if (parsed[k] !== undefined) out[k] = parsed[k]
      return out
    }
  } catch { /* corrupt/missing → start from defaults */ }
  return {}
}
function saveSettingsFile(patch) {
  const current = loadSettingsFile()
  const next = { ...current, ...patch }
  const file = settingsFilePath()
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, JSON.stringify(next, null, 2))
  return next
}

/**
 * Plugin config. All optional.
 */
export function defineConfig() {
  return {
    /** Whether memory_write / memory_forget must first be approved. Default off. */
    requireApprovalForWrite: false,
    /**
     * When `requireApprovalForWrite` is on, autoSummarize-distilled facts are
     * held in a per-workspace "pending" queue instead of being committed
     * directly. `autoApproveAfterMs` (default 7 days) auto-flushes pending items
     * that have waited too long, so the queue never grows unbounded if the user
     * ignores it. Set to 0 to disable auto-flush (manual approve/reject only).
     */
    autoApproveAfterMs: 7 * 24 * 60 * 60 * 1000,
    /**
     * How memory is injected into each request: 'recent' (default; a bounded
     * digest of the newest entries per scope), 'full' (all entries, capped by
     * maxInjectedChars, snapshot-style), or 'off'. Legacy booleans are
     * accepted: true → 'recent', false → 'off'.
     */
    injectContext: 'recent',
    /**
     * In 'recent' mode, only inject entries carrying at least one of these
     * tags (e.g. ["decision", "constraint"]). Empty (default) = inject every
     * recent entry. 'full' mode ignores this filter (snapshot semantics).
     */
    injectTags: [],
    /** Whether to refuse memory_write content that matches a threat pattern. Default on. */
    scanThreatsOnWrite: true,
    /**
     * Automatically distill durable facts from each finished conversation
     * turn (agent/status idle → runMaintenance → LLM extraction). Default off:
     * each run is an auxiliary model call, so it is opt-in.
     */
    autoSummarize: false,
    /** Minimum elapsed time between auto-summarize runs per agent (ms). */
    summarizeIntervalMs: 30_000,
    /** Only summarize a turn that produced at least this many new user messages. */
    summarizeMinMessages: 1,
    /**
     * Compress with the LLM when a write would exceed the char budget; when
     * off, deterministic rule-based compression (merge similar + drop cold
     * entries) is used instead. Default off (rule-based).
     */
    compressWithLLM: false,
    /**
     * Semantic recall: before BM25 search, have the LLM expand the query into
     * a few paraphrase / synonym / keyword variants, then BM25-search each and
     * merge the candidates. This catches synonym and paraphrase matches that
     * lexical BM25 alone misses. Each call is an auxiliary model call, so it is
     * opt-in (default off). Recall degrades gracefully to plain BM25 when the
     * LLM is unavailable.
     */
    semanticRecall: false,
    /**
     * Semantic rerank: after gathering BM25 candidates, have the LLM score
     * their relevance (0–3) to the query and return the top results in
     * relevance order. Improves precision on noisy stores. Each call is an
     * auxiliary model call, so it is opt-in (default off). Degrades to
     * BM25-score order when the LLM is unavailable.
     */
    semanticRerank: false,
    /**
     * Semantic de-duplication on write: when a new fact is "semantically
     * similar enough" (Jaccard token overlap ≥ this threshold) to an existing
     * record in the same scope, skip writing it instead of creating a near
     * duplicate. 0 disables the check (only exact-content dedup remains).
     * Default 0 (off) — exact dedup only, to stay conservative by default.
     */
    semanticDedupThreshold: 0,
    /**
     * Local vector recall: when on, memory_recall also runs a dependency-free,
     * fully-offline hash-vector (cosine) search and RRF-fuses its hits with the
     * BM25 hits, catching synonym / paraphrase / reordering matches that lexical
     * BM25 alone misses — with no model call and no external service. Each scope
     * is embedded once and the vector is persisted on the record, so reads stay
     * cheap. Opt-in (default off) so the zero-cost BM25 baseline is unchanged.
     */
    semanticVectorRecall: false,
    /**
     * Auto-consolidation: periodically merge near-duplicate / overlapping
     * memories into fewer, more concise entries so the store does not grow
     * monotonically dirty. Triggered in runMaintenance when the store has not
     * been consolidated for at least `consolidateIntervalMs` OR the live
     * record count exceeds `consolidateMaxEntries`. Each run is an auxiliary
     * LLM call (only when compressWithLLM is also on, else it is a no-op),
     * so it is opt-in. Default off.
     */
    autoConsolidate: false,
    /** Minimum elapsed time between auto-consolidation runs (ms). */
    consolidateIntervalMs: 6 * 60 * 60 * 1000,
    /** Trigger auto-consolidation once a scope has more than this many live records. */
    consolidateMaxEntries: 60,
    /** Absolute file for the user-profile scope (default $DSH_HOME/dsh-memory/user.jsonl). */
    userFile: undefined,
    /** Absolute file for the global scope (default $DSH_HOME/dsh-memory/global.jsonl). */
    globalFile: undefined,
    /** Workspace-backed file, absolute or relative to each workspace root. */
    workspaceFile: undefined,
    /** Workspace root fallback for sessions without a cwd (default process.cwd()). */
    workspaceRoot: undefined,
    /** Cap on the injected per-assembly digest (characters). */
    maxInjectedChars: DEFAULT_MAX_INJECTED_CHARS,
    /** Enforce `limit` values ≤ MAX_RESULTS. */
    maxResults: MAX_RESULTS,
    /** Per-store character budget; a write exceeding it is refused (after compression attempts). */
    charLimit: DEFAULT_CHAR_LIMIT,
  }
}

/** Bound a caller-specified result limit into [1, maxResults]. */
function clampLimit(limit, maxResults) {
  if (!Number.isInteger(limit) || limit < 1) return DEFAULT_RECALL_LIMIT
  return Math.min(limit, maxResults)
}

/**
 * Describe one memory record compactly for the model: id, scope, tags, and the
 * content (which is left as-is, not quoted).
 */
function describeRecord(record, score) {
  if (record === null || typeof record !== 'object') return '- (invalid record)'
  const tags = Array.isArray(record.tags) && record.tags.length > 0 ? ` [${record.tags.join(', ')}]` : ''
  const scoreText = typeof score === 'number' && score > 0 ? ` (score ${score.toFixed(2)})` : ''
  const stale = record.superseded === true ? ' [SUPERSEDED]' : ''
  return `- ${record.id} [${record.scope}]${tags}${stale}: ${record.content}${scoreText}`
}

/** A stable, bounded render of a set of ranked records. */
function renderRecords(records, heading) {
  if (records.length === 0) return `${heading}: none.`
  // Accept both wrapped `{ record, score }` (memory_list) and flat recall items
  // `{ id, scope, content, tags, score }` (memory_recall).
  const rows = records.map((r) => {
    if (r === null || typeof r !== 'object') return '- (invalid record)'
    if ('record' in r) return describeRecord(r.record, r.score)
    return describeRecord(r, r.score)
  })
  return `${heading}:\n${rows.join('\n')}`
}

/** Human-readable heading for a scope in the injected digest. */
function scopeLabel(scope) {
  switch (scope) {
    case 'user': return 'User profile memory'
    case 'global': return 'Global memory'
    case 'workspace': return 'Workspace memory'
    default: return `${scope} memory`
  }
}

/**
 * Build the per-assembly recent-memory digest for one scope, bounded by a
 * character budget. Recency is `updatedAt`; no retrieval is performed, so this
 * is deterministic and cheap.
 */
async function recentDigest(store, maxChars, split) {
  const all = await store.list()
  const recent = all.slice(0, split)
  if (recent.length === 0) return ''
  const lines = recent.map((r) => describeRecord(r))
  // Greedily drop the oldest lines until under budget, always keeping ≥1.
  let budget = String(lines.length).length + 2
  const kept = []
  for (const line of lines) {
    if (kept.length > 0 && budget + line.length > maxChars) break
    kept.push(line)
    budget += line.length + 1
  }
  return kept.join('\n')
}

/**
 * Synchronous sibling of {@link recentDigest} for the per-assembly context
 * contribution. DSH's prompt assembler evaluates `text` functions
 * synchronously (no await — an async function would land a Promise in the
 * assembly and crash interpolation with "text.indexOf is not a function"),
 * so this reads the store's already-loaded in-memory records instead of the
 * async `list()`. Callers must warm the store first (fire `store.list()`
 * once) and tolerate an empty digest for the very first assembly in a
 * process.
 *
 * `mode` selects how much is injected per scope:
 *   - 'recent' — the newest `split` entries (bounded, cheap);
 *   - 'full'   — every entry, still capped by `maxChars` (Hermes-style
 *                frozen-snapshot feel; falls back to newest-first under the
 *                budget).
  * Entries matching a threat pattern are replaced by a `[BLOCKED: …]`
  * placeholder so a poisoned-on-disk entry cannot reach the system prompt,
  * while the live store keeps the original for the user to inspect and
  * remove (mirrors Hermes's snapshot sanitization).
  *
  * `injectTags`, when non-empty, restricts 'recent' mode to entries carrying
  * at least one of those tags (roadmap: 标签过滤注入). 'full' mode ignores
  * it (snapshot semantics).
  */
function recentDigestSync(store, maxChars, split, mode = 'recent', injectTags) {
  const records = store.records
  if (records === null || records.size === 0) return ''
  const base = [...records.values()].filter((r) => r.superseded !== true) // corrected facts never re-inject
  const tagged = mode === 'full' ? base : filterByTags(base, injectTags)
  const sorted = tagged.sort((a, b) => b.updatedAt - a.updatedAt)
  const recent = mode === 'full' ? sorted : sorted.slice(0, split)
  const lines = recent.map((r) => {
    const threats = scanThreats(r.content)
    if (threats.length > 0) {
      return describeRecord({ ...r, content: `[BLOCKED: entry matches threat pattern(s): ${threats.join(', ')}. Use memory_list/memory_forget to inspect and remove the original.]` })
    }
    return describeRecord(r)
  })
  // Greedily drop the oldest lines until under budget, always keeping ≥1.
  let budget = String(lines.length).length + 2
  const kept = []
  for (const line of lines) {
    if (kept.length > 0 && budget + line.length > maxChars) break
    kept.push(line)
    budget += line.length + 1
  }
  return kept.join('\n')
}

export function apply(ctx, config = {}) {
  const initializedConfig = defineConfig()
  const cfg = { ...initializedConfig, ...config }
  // Merge persisted settings from our own file (works even when ctx.settings is
  // not mounted). The cordis patch (config) is the base; the file overrides it.
  Object.assign(cfg, loadSettingsFile())
  // Never let a caller exceed the hard result cap.
  const maxResults = Math.min(cfg.maxResults, MAX_RESULTS)

  // Cache one store instance per backing-file path so reads reuse the
  // in-memory index across turns instead of re-reading the file each time.
  const stores = new Map()

  // ── 待确认队列（pending）：autoSummarize 蒸馏出的事实先入队，审批后才落库 ──
  // 每个 workspace 一份 JSONL（与 memory.jsonl 同目录，命名 .dsh/memory-pending.jsonl）。
  // 面板与路由都通过 storeFor 的同一 workspaceRoot 取得路径，保证前端/后端一致。
  const pendingStores = new Map() // file → { items: PendingItem[] }  (内存缓存，按文件粒度加载)
  function pendingPathFor(session, owner) {
    const { workspaceRoot } = storeFor('workspace', session, owner)
    return resolve(workspaceRoot, '.dsh', 'memory-pending.jsonl')
  }
  function loadPending(file) {
    let cache = pendingStores.get(file)
    if (cache) return cache
    let items = []
    try {
      if (existsSync(file)) {
        const text = readFileSync(file, 'utf8')
        items = text.split('\n').map((l) => l.trim()).filter(Boolean).map((l) => {
          try { return JSON.parse(l) } catch { return null }
        }).filter(Boolean)
      }
    } catch { /* 读取失败视为空队列 */ }
    cache = { items, file }
    pendingStores.set(file, cache)
    return cache
  }
  function savePending(cache) {
    const dir = dirname(cache.file)
    mkdirSync(dir, { recursive: true })
    const text = cache.items.map((it) => JSON.stringify(it)).join('\n') + (cache.items.length ? '\n' : '')
    writeFileSync(cache.file, text, 'utf8')
  }
  /** 把一条自动蒸馏事实放入待确认队列。返回新建的 pending id。 */
  function pushPending(session, owner, fact) {
    const file = pendingPathFor(session, owner)
    const cache = loadPending(file)
    const id = `p_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
    const item = {
      id,
      scope: fact.scope,
      content: fact.content,
      tags: Array.isArray(fact.tags) ? fact.tags : [],
      createdAt: Date.now(),
      origin: fact.source?.origin || 'auto_summarize',
      sessionId: fact.source?.sessionId || null,
    }
    cache.items.push(item)
    savePending(cache)
    return id
  }
  /**
   * 把一条 pending 项落库（批准）。返回 { ok, record, scope } 或 { ok:false, error }。
   * 落库前仍走相同的威胁扫描 / 精确去重 / 语义去重，避免"绕过"已有权限。
   */
  async function approvePending(session, owner, id) {
    const file = pendingPathFor(session, owner)
    const cache = loadPending(file)
    const idx = cache.items.findIndex((it) => it.id === id)
    if (idx < 0) return { ok: false, error: 'pending item not found' }
    const item = cache.items[idx]
    if (cfg.scanThreatsOnWrite) {
      const threats = scanThreats(item.content)
      if (threats.length > 0) { cache.items.splice(idx, 1); savePending(cache); return { ok: false, error: `threat: ${threats.join(', ')}` } }
    }
    const { store } = storeFor(item.scope, session, owner)
    const existing = await store.list()
    if (existing.some((r) => r.content === item.content)) { cache.items.splice(idx, 1); savePending(cache); return { ok: true, skipped: true, scope: item.scope } }
    const dedupThreshold = eff(null, 'semanticDedupThreshold', cfg.semanticDedupThreshold)
    if (dedupThreshold > 0 && existing.some((r) => r.superseded !== true && similarity(r, item) >= dedupThreshold)) {
      cache.items.splice(idx, 1); savePending(cache); return { ok: true, skipped: true, scope: item.scope }
    }
    const outcome = await store.put({ scope: item.scope, content: item.content, tags: item.tags, source: { sessionId: item.sessionId, origin: 'pending_approve' } })
    if (outcome.ok) { cache.items.splice(idx, 1); savePending(cache); return { ok: true, record: outcome.record, scope: item.scope } }
    return { ok: false, error: outcome.error || outcome.reason }
  }
  /** 拒绝（删除）一条 pending 项。 */
  function rejectPending(session, owner, id) {
    const file = pendingPathFor(session, owner)
    const cache = loadPending(file)
    const before = cache.items.length
    cache.items = cache.items.filter((it) => it.id !== id)
    if (cache.items.length !== before) { savePending(cache); return { ok: true } }
    return { ok: false, error: 'pending item not found' }
  }
  /** 超时自动放行：把等待超过 autoApproveAfterMs 的 pending 项直接落库。返回处理的条数。 */
  async function autoFlushPending(session, owner) {
    const ms = eff(null, 'autoApproveAfterMs', cfg.autoApproveAfterMs)
    if (!ms || ms <= 0) return 0
    if (!eff(null, 'requireApprovalForWrite', cfg.requireApprovalForWrite)) return 0
    const now = Date.now()
    const file = pendingPathFor(session, owner)
    const cache = loadPending(file)
    let flushed = 0
    const keep = []
    for (const it of cache.items) {
      if (now - (it.createdAt || 0) >= ms) {
        const { store } = storeFor(it.scope, session, owner)
        try {
          const outcome = await store.put({ scope: it.scope, content: it.content, tags: it.tags, source: { sessionId: it.sessionId, origin: 'pending_auto' } })
          if (outcome.ok) flushed += 1
          else keep.push(it) // 落库失败（如超限）保留待下次
        } catch { keep.push(it) }
      } else keep.push(it)
    }
    if (flushed > 0) { cache.items = keep; savePending(cache) }
    return flushed
  }

  /**
   * Resolve (and cache) the store for a scope. `workspace` needs the session to
   * know which workspace; `user` and `global` are single-root and shared.
   */
  function storeFor(scope, session, owner) {
    const workspaceRoot = resolveWorkspaceRoot(session, cfg, owner)
    const file = storePathFor(scope, workspaceRoot, cfg)
    let store = stores.get(file)
    if (store === undefined) {
      store = new MemoryStore(file, { charLimit: cfg.charLimit })
      stores.set(file, store)
    }
    return { store, workspaceRoot, file }
  }

  // ── settings namespace（热重载开关，settings.yaml 可覆盖）──────────────
  // 注册 schema 后：settings.yaml 里 `long-term-memory:` 一节可覆盖默认值，
  // 外部编辑热发布；/memory settings 命令与未来 Web 界面走同一 scope。
  const settingsSchema = z.object({
    autoSummarize: z.boolean().default(cfg.autoSummarize),
    summarizeIntervalMs: z.number().min(0).default(cfg.summarizeIntervalMs),
    summarizeMinMessages: z.number().min(0).default(cfg.summarizeMinMessages),
    compressWithLLM: z.boolean().default(cfg.compressWithLLM),
    injectContext: z.union([z.const('recent'), z.const('full'), z.const('off')]).default(cfg.injectContext),
    injectTags: z.array(z.string()).default(cfg.injectTags),
    requireApprovalForWrite: z.boolean().default(cfg.requireApprovalForWrite),
    autoApproveAfterMs: z.number().min(0).default(cfg.autoApproveAfterMs),
    charLimit: z.number().min(1).default(cfg.charLimit),
    semanticRecall: z.boolean().default(cfg.semanticRecall),
    semanticRerank: z.boolean().default(cfg.semanticRerank),
    semanticVectorRecall: z.boolean().default(cfg.semanticVectorRecall),
    semanticDedupThreshold: z.number().min(0).max(1).default(cfg.semanticDedupThreshold),
    autoConsolidate: z.boolean().default(cfg.autoConsolidate),
    consolidateIntervalMs: z.number().min(0).default(cfg.consolidateIntervalMs),
    consolidateMaxEntries: z.number().min(1).default(cfg.consolidateMaxEntries),
  })
  let memorySettings
  try {
    memorySettings = ctx.settings.register('long-term-memory', settingsSchema)
  } catch {
    memorySettings = undefined // settings 服务未挂载时降级为纯配置
  }
  /** 读取当前生效的自动化开关（settings 优先，回退 config）。 */
  function eff(scope, key, fallback) {
    if (memorySettings !== undefined) {
      try {
        const v = memorySettings.get()
        if (v && v[key] !== undefined) return v[key]
      } catch { /* schema 校验失败时用 fallback */ }
    }
    return fallback
  }

  // ── 自动总结：回合结束蒸馏 ──────────────────────────────────────────────
  // agent/status → idle 表示一轮结束；在 runMaintenance 空闲期提取本轮新增
  // 用户文本，调 LLM 蒸馏成事实写入记忆。开关默认关（每次都是辅助模型调用）。
  const lastSummarized = new Map() // agent id → { seq, at }
  const summarizePrompt =
    'You are the memory-distillation step of a long-term memory system. ' +
    'From the conversation excerpt below, extract the durable, cross-session facts worth remembering: ' +
    'user preferences, corrections, personal details, project constraints, decisions, stable environment facts, ' +
    'URLs and IDs. Skip trivia, task progress, and re-discoverable details. ' +
    'Reply with ONLY a JSON array, e.g. [{"scope":"user","content":"...","tags":["preference"]}], ' +
    'where scope is one of "user" (who the user is), "global" (true across all projects), or "workspace" (project-specific). ' +
    'Return [] when nothing is worth remembering.'
  ctx.on('agent/status', ({ agent, status }) => {
    if (status !== 'idle') return
    if (!eff(null, 'autoSummarize', cfg.autoSummarize)) return
    // runMaintenance 是空闲期维护任务，不阻塞对话；失败仅记录。
    agent.runMaintenance(async (signal) => {
      const minMessages = eff(null, 'summarizeMinMessages', cfg.summarizeMinMessages)
      const intervalMs = eff(null, 'summarizeIntervalMs', cfg.summarizeIntervalMs)
      const last = lastSummarized.get(agent.id)
      const sinceSeq = last?.seq ?? -1
      const now = Date.now()
      if (last !== undefined && now - last.at < intervalMs) return // 防抖
      const text = newUserText(agent.session.events, sinceSeq)
      if (text.length === 0) return
      const msgCount = agent.session.events.filter((e) => e.type === 'user/message' && e.seq > sinceSeq).length
      if (msgCount < minMessages) return
      try {
        const reply = await askLlm(ctx, agent, { system: summarizePrompt, userText: text, signal })
        const facts = parseFacts(reply)
        const dedupThreshold = eff(null, 'semanticDedupThreshold', cfg.semanticDedupThreshold)
        // 写入审批开启时，自动蒸馏的事实先进"待确认"队列，人工批准才落库。
        const gatePending = eff(null, 'requireApprovalForWrite', cfg.requireApprovalForWrite)
        for (const fact of facts) {
          if (scanThreats(fact.content).length > 0) continue // 威胁内容跳过
          const { store } = storeFor(fact.scope, agent.session, ctx)
          const existing = await store.list()
          // 精确去重（内容完全相同）始终生效。
          if (existing.some((r) => r.content === fact.content)) continue
          // 语义去重（可选）：与既有（未作废）记录 Jaccard 相似度 ≥ 阈值则跳过，
          // 避免 autoSummarize 反复写出近似重复条目。阈值 0 = 关闭。
          if (dedupThreshold > 0) {
            const dup = existing.some((r) => r.superseded !== true && similarity(r, fact) >= dedupThreshold)
            if (dup) continue
          }
          if (gatePending) {
            // 入待确认队列（落库前的最后一道人工关）。仍计 hit、仍参与整合判断。
            pushPending(agent.session, ctx, { ...fact, source: { sessionId: agent.session.id, origin: 'auto_summarize' } })
            continue
          }
          const outcome = await store.put({ ...fact, source: { sessionId: agent.session.id, origin: 'auto_summarize' } })
          if (!outcome.ok && outcome.reason === 'limit') {
            // 超限：规则压缩（为新事实预留字符）后重试一次
            const { kept, dropped } = compressRules(existing, cfg.charLimit - fact.content.length)
            const keptUsage = MemoryStore.usageOf(kept)
            if (keptUsage < cfg.charLimit - fact.content.length && kept.length < existing.length) {
              for (const d of dropped) await store.delete(d.id)
              await store.put({ ...fact, source: { sessionId: agent.session.id, origin: 'auto_summarize' } })
            }
          }
        }
        // 超时自动放行（autoApproveAfterMs）：把久未处理的待确认项直接落库。
        if (gatePending) await autoFlushPending(agent.session, ctx)
        // 主动整合（可选）：把近似重复/重叠条目合并成更少更凝练的 digest，
        // 避免库只增不减。仅在 autoConsolidate 开启、compressWithLLM 也开启、
        // 且达到触发条件（距上次整合过久 或 记录数超阈值）时运行。
        await maybeConsolidate(agent, signal)
      } catch {
        // 总结失败不影响会话；下次 idle 会再试（seq 未推进则跳过重复文本）
      } finally {
        // 记录已处理到的 seq，避免重复蒸馏同一段
        const events = agent.session.events
        const lastSeq = events.length > 0 ? events[events.length - 1].seq : sinceSeq
        lastSummarized.set(agent.id, { seq: lastSeq, at: Date.now() })
      }
    }).catch(() => {})
  })

  // ── 主动整合（autoConsolidate）：定期把近似重复/重叠条目合并成更少更凝练的 digest ──
  // 触发条件（任一）：距上次整合 ≥ consolidateIntervalMs，或 live 记录数 > consolidateMaxEntries。
  // 仅在 autoConsolidate + compressWithLLM 同时开启时运行（复用 tryCompress 的 LLM 压缩逻辑，
  // 但改为"主动调度触发"而非"仅在写入超限时"）。保守策略：LLM 返回的精简条目若已有某条
  // 现存记录"完全囊括"其内容，则删旧留新；绝不盲目删除 LLM 未覆盖到的条目，避免误删。
  const lastConsolidated = new Map() // scope → 上次整合时间戳
  async function maybeConsolidate(agent, signal) {
    if (!eff(null, 'autoConsolidate', cfg.autoConsolidate)) return
    if (!eff(null, 'compressWithLLM', cfg.compressWithLLM)) return // 必须有 LLM 才能精炼
    const intervalMs = eff(null, 'consolidateIntervalMs', cfg.consolidateIntervalMs)
    const maxEntries = eff(null, 'consolidateMaxEntries', cfg.consolidateMaxEntries)
    for (const scope of SCOPE_PRIORITY) {
      const now = Date.now()
      const last = lastConsolidated.get(scope)
      const { store } = storeFor(scope, agent.session, ctx)
      const live = (await store.list()).filter((r) => r.superseded !== true)
      const due = last === undefined || now - last >= intervalMs
      const overLimit = live.length > maxEntries
      if (!due && !overLimit) continue
      try {
        const reply = await askLlm(ctx, agent, {
          system:
            'You are the consolidation step of a long-term memory system. ' +
            'Merge overlapping / redundant memory entries into fewer, more concise entries, preserving every ' +
            'durable fact (user preferences, constraints, decisions, URLs, IDs). Drop nothing important. ' +
            'Reply with ONLY a JSON array of [{"content":"...","tags":["..."]}] — the consolidated, de-duplicated store.',
          userText: `Current ${scope} memory (${live.length} entries):\n` +
            live.map((r) => `- ${r.content}${r.tags.length ? ` [${r.tags.join(', ')}]` : ''}`).join('\n'),
          signal,
        })
        const facts = parseFacts(reply)
        if (facts.length === 0 || facts.length >= live.length) continue // 没精简就不动
        const kept = facts.filter((f) => scanThreats(f.content).length === 0)
        // 仅当某条现存记录被某条新条目"完全囊括"（语义相似度 ≥ 0.6）时才删旧留新。
        for (const old of live) {
          const covered = kept.some((f) => similarity(old, f) >= 0.6)
          if (covered) await store.delete(old.id)
        }
        for (const f of kept) {
          await store.put({ ...f, source: { sessionId: agent.session.id, origin: 'auto_consolidate' } })
        }
        lastConsolidated.set(scope, now)
      } catch {
        // 整合失败不影响会话；下次 idle 再试（时间戳未推进）
      }
    }
  }

  // ── 写入超限自动压缩（memory_write 内部复用）────────────────────────────
  /**
   * 尝试把 `store` 压缩到 charLimit 以内，为新写入腾空间。
   * compressWithLLM 开：仅当能用 LLM 精炼（有 agent）时调用；否则规则压缩。
   * @returns {Promise<boolean>} 是否腾出空间（压缩后 usage < limit）。
   */
  async function tryCompress(store, session, agent, reserveChars = 0) {
    const current = await store.list()
    const usage = MemoryStore.usageOf(current)
    const target = cfg.charLimit - reserveChars
    if (usage < target) return true
    const useLLM = eff(null, 'compressWithLLM', cfg.compressWithLLM) && agent !== undefined
    if (useLLM) {
      try {
        const reply = await askLlm(ctx, agent, {
          system:
            'You are the compression step of a long-term memory system. ' +
            'The memory store is over its character budget. Merge overlapping entries and drop stale ones, ' +
            'preserving the most important durable facts. Reply with ONLY a JSON array of ' +
            '[{"scope":"user|global|workspace","content":"...","tags":["..."]}] — the complete compressed store.',
          userText: `Current store (${usage}/${cfg.charLimit} chars):\n` +
            current.map((r) => `- [${r.scope}] ${r.content}${r.tags.length ? ` [${r.tags.join(', ')}]` : ''}`).join('\n'),
          signal: undefined,
        })
        const facts = parseFacts(reply)
        if (facts.length > 0 && facts.length < current.length) {
          const kept = facts.filter((f) => scanThreats(f.content).length === 0)
          for (const r of current) await store.delete(r.id)
          for (const f of kept) {
            const out = await store.put({ ...f, source: { sessionId: session?.id, origin: 'auto_compress' } })
            if (!out.ok) break // 预算仍超则停止
          }
          return MemoryStore.usageOf(await store.list()) < target
        }
      } catch {
        // LLM 压缩失败回退规则压缩
      }
    }
    const target2 = cfg.charLimit - (reserveChars ?? 0)
    const { kept, dropped } = compressRules(current, target2)
    const keptUsage = MemoryStore.usageOf(kept)
    if (keptUsage < target2) {
      // 只有真正腾出空间才删除——避免"删除已落盘但写入仍失败"的破坏性副作用
      for (const d of dropped) await store.delete(d.id)
      return true
    }
    return false
  }

  // ── system guidance ───────────────────────────────────────────────────────
  ctx.systemPrompt.section({
    name: 'tool:long-term-memory',
    order: TOOL_GUIDANCE_ORDER,
    text:
      'Long-term memory is available. Persist durable, cross-session facts with memory_write ' +
      '(e.g. user preferences, project constraints, decisions, URLs, IDs) rather than relying on ' +
      'the conversation that will be compacted. Fetch them with memory_recall when a relevant ' +
      'task begins or a previously stated constraint matters. Use memory_forget when a fact is ' +
      'no longer true, or memory_correct to record a correction that supersedes the stale ' +
      'records automatically. Several relevant memories are already injected below.',
  })

  // ── per-assembly dynamic context ──────────────────────────────────────────
  // Read LIVE settings (settings.yaml hot-reloads): injectContext and
  // injectTags apply on the next assembly, no restart needed.
  if (eff(null, 'injectContext', cfg.injectContext) !== 'off') {
    // Warm the shared stores at apply time so the very first assembly in a
    // process already renders the digest (workspace stores depend on the
    // session's cwd and are warmed on first assembly).
    for (const scope of SCOPE_PRIORITY) {
      if (scope !== 'workspace') void storeFor(scope, undefined, ctx).store.list().catch(() => {})
    }
    ctx.systemPrompt.context({
      name: 'long-term-memory:inject',
      order: CONTEXT_ORDER,
      // Must be SYNCHRONOUS: DSH's assembler evaluates `text` functions with a
      // plain call, never awaiting them, and interpolation then runs
      // `text.indexOf(...)` on the result. An async function returns a Promise
      // and crashes every turn with "text.indexOf is not a function". Stores
      // keep their records in memory after the first load, so a sync render is
      // possible once warmed; until then the digest is simply empty.
      text: (context) => {
        const session = context.agent?.session
        const mode = normalizeInjectMode(eff(null, 'injectContext', cfg.injectContext))
        const injectTags = eff(null, 'injectTags', cfg.injectTags)
        const parts = []
        for (const scope of SCOPE_PRIORITY) {
          const store = storeFor(scope, session, ctx).store
          if (store.records === null) void store.list().catch(() => {})
          const digest = recentDigestSync(store, cfg.maxInjectedChars, DEFAULT_TIMELINE_INJECTED_SPLIT, mode, injectTags)
          if (digest) parts.push(`${scopeLabel(scope)}:\n${digest}`)
        }
        if (parts.length === 0) return ''
        return buildInjectionBlock(parts.join('\n\n'))
      },
    })
  }

  // ── write-approval gate (opt-in) ──────────────────────────────────────────
  if (cfg.requireApprovalForWrite) {
    ctx.on('tools/pre-execute', (exec, next) => {
      if (exec.name !== 'memory_write' && exec.name !== 'memory_forget') return next()
      return {
        kind: 'ask',
        reason: exec.name === 'memory_write'
          ? 'Store a new long-term memory'
          : 'Delete a long-term memory',
      }
    })
  }

  // ── tools ─────────────────────────────────────────────────────────────────

  // memory_write — store one durable memory record.
  ctx.tools.register(defineTool({
    name: 'memory_write',
    description:
      'Persist one durable memory record (a fact, decision, preference, constraint, URL, or ID) that should ' +
      'survive context compaction and persist across sessions. ' +
      'Use scope "user" for who the user is (name, role, preferences, style); "workspace" (default) for ' +
      'project-specific facts that belong with this working directory; "global" for facts true across all projects. ' +
      'Returns the stored record id and the resolved scope, which later memory_forget targets. ' +
      'Writes are capped by a per-store character budget: when the budget is full the tool reports usage and ' +
      'current entries so you can forget or shorten older entries first.',
    parameters: {
      content: {
        type: 'string',
        required: true,
        description: 'The durable fact to remember, written as a single concise statement.',
      },
      scope: {
        type: 'string',
        enum: ['user', 'global', 'workspace'],
        description: 'Where the memory lives. Defaults to "workspace" when the session has a working directory, else "global". Use "user" for personal profile facts.',
      },
      tags: {
        type: 'array',
        items: { type: 'string' },
        description: 'Optional short tags (e.g. "preference", "decision", "constraint") used for recall.',
      },
    },
    output: {
      schema: {
        type: 'object',
        properties: {
          id: { type: 'string', required: true, description: 'Stored record id for later memory_forget.' },
          scope: { type: 'string', required: true, enum: ['user', 'global', 'workspace'] },
          content: { type: 'string', required: true },
          createdAt: { type: 'number', required: true },
        },
        additionalProperties: false,
      },
      render: (_args, value) => [{
        type: 'text',
        text: `Stored a ${value.scope} memory (${value.id}): ${value.content}`,
      }],
    },
    async execute(args, exec) {
      const session = exec.agent?.session
      const content = String(args.content ?? '').trim()
      if (content.length === 0) {
        throw new Error('memory_write: content must be a non-empty statement')
      }
      if (cfg.scanThreatsOnWrite) {
        const threats = scanThreats(content)
        if (threats.length > 0) {
          throw new Error(`memory_write: content rejected — matches threat pattern(s): ${threats.join(', ')}`)
        }
      }
      const scope = assertScope(args.scope) ?? (session?.header?.cwd ? 'workspace' : 'global')
      const { store } = storeFor(scope, session, ctx)
      const source = session === undefined ? undefined : {
        sessionId: session.id,
        ...(exec.agent !== undefined ? { origin: 'memory_write' } : {}),
      }
      const outcome = await store.put({
        scope,
        content,
        tags: Array.isArray(args.tags) ? args.tags.filter((t) => typeof t === 'string' && t.length > 0) : [],
        source,
      })
      if (!outcome.ok && outcome.reason === 'limit') {
        // 超限：先尝试自动压缩腾空间（为新内容预留字符），再重试一次；仍失败才报错。
        const freed = await tryCompress(store, session, exec.agent, content.length)
        if (freed) {
          const retry = await store.put({
            scope,
            content,
            tags: Array.isArray(args.tags) ? args.tags.filter((t) => typeof t === 'string' && t.length > 0) : [],
            source,
          })
          if (retry.ok) {
            return {
              id: retry.record.id,
              scope: retry.record.scope,
              content: retry.record.content,
              createdAt: retry.record.updatedAt,
            }
          }
          throw new Error(`memory_write: ${retry.error}`)
        }
        throw new Error(`memory_write: ${outcome.error}${outcome.currentEntries?.length ? `\nCurrent entries:\n${outcome.currentEntries.join('\n')}` : ''}`)
      }
      if (!outcome.ok) {
        throw new Error(`memory_write: ${outcome.error}`)
      }
      return {
        id: outcome.record.id,
        scope: outcome.record.scope,
        content: outcome.record.content,
        createdAt: outcome.record.updatedAt,
      }
    },
  }))

  // memory_correct — record a correction and supersede the stale records it matches.
  ctx.tools.register(defineTool({
    name: 'memory_correct',
    description:
      'Record that a previously stored memory is wrong or outdated: writes the corrected fact as a new ' +
      'memory and marks the existing records it matches as superseded. Superseded records are excluded ' +
      'from memory_recall and the injected digest (they stay visible in memory_list with a [SUPERSEDED] ' +
      'marker for cleanup with memory_forget). Use when you verify a memory no longer holds: state what ' +
      'it claimed, what is actually true now, and your evidence.',
    parameters: {
      claim: {
        type: 'string',
        required: true,
        description: 'What the stale memory claimed — matched against stored records to find what this correction supersedes.',
      },
      truth: {
        type: 'string',
        required: true,
        description: 'What is actually true now; stored as the new memory record.',
      },
      evidence: {
        type: 'string',
        description: 'Optional evidence for the correction (source, verification result, observed counterexample).',
      },
      scope: {
        type: 'string',
        enum: ['user', 'global', 'workspace'],
        description: 'Scope to correct in. Defaults like memory_write (workspace when the session has a working directory, else global).',
      },
    },
    output: {
      schema: {
        type: 'object',
        properties: {
          id: { type: 'string', required: true, description: 'The new correction record id.' },
          scope: { type: 'string', required: true, enum: ['user', 'global', 'workspace'] },
          content: { type: 'string', required: true },
          superseded: { type: 'array', items: { type: 'string' }, required: true, description: 'Ids of the stale records marked superseded.' },
        },
        additionalProperties: false,
      },
      render: (_args, value) => [{
        type: 'text',
        text: `Corrected a ${value.scope} memory (${value.id}): ${value.content}` +
          (value.superseded.length > 0
            ? `\nMarked superseded: ${value.superseded.join(', ')}`
            : '\n(no existing records matched the claim)'),
      }],
    },
    async execute(args, exec) {
      const session = exec.agent?.session
      const claim = String(args.claim ?? '').trim()
      const truth = String(args.truth ?? '').trim()
      if (claim.length === 0) {
        throw new Error('memory_correct: claim must describe what the stale memory said')
      }
      if (truth.length === 0) {
        throw new Error('memory_correct: truth must state what is actually true now')
      }
      if (cfg.scanThreatsOnWrite) {
        const threats = scanThreats(truth)
        if (threats.length > 0) {
          throw new Error(`memory_correct: content rejected — matches threat pattern(s): ${threats.join(', ')}`)
        }
      }
      const scope = assertScope(args.scope) ?? (session?.header?.cwd ? 'workspace' : 'global')
      const { store } = storeFor(scope, session, ctx)
      const source = session === undefined ? undefined : {
        sessionId: session.id,
        ...(exec.agent !== undefined ? { origin: 'memory_correct' } : {}),
      }
      const content = args.evidence ? `${truth} (evidence: ${String(args.evidence).trim()})` : truth
      // Find the stale records this correction supersedes: top claim matches,
      // excluding a record identical to the new truth (nothing to correct).
      const hits = await store.search(claim, { limit: 5 })
      const candidates = hits.filter((h) => h.record.content !== truth).map((h) => h.record.id)
      const finish = async (record) => {
        const { marked } = await store.supersede(candidates, record.id)
        return { id: record.id, scope: record.scope, content: record.content, superseded: marked }
      }
      // Write the correction first so supersede() can point at its id.
      const outcome = await store.put({ scope, content, tags: ['correction'], source })
      if (!outcome.ok && outcome.reason === 'limit') {
        const freed = await tryCompress(store, session, exec.agent, content.length)
        if (freed) {
          const retry = await store.put({ scope, content, tags: ['correction'], source })
          if (retry.ok) return finish(retry.record)
          throw new Error(`memory_correct: ${retry.error}`)
        }
        throw new Error(`memory_correct: ${outcome.error}${outcome.currentEntries?.length ? `\nCurrent entries:\n${outcome.currentEntries.join('\n')}` : ''}`)
      }
      if (!outcome.ok) {
        throw new Error(`memory_correct: ${outcome.error}`)
      }
      return finish(outcome.record)
    },
  }))

  /**
   * Semantic recall helper (Stage A of the memory optimization).
   *
   * This is a thin, deterministic-fallback orchestration over BM25:
   *   1. optionally expand the query into paraphrase/keyword variants via the LLM;
   *   2. BM25-search each variant (and the original) per scope, merging candidates
   *      into a per-scope de-duplicated set;
   *   3. optionally re-rank the merged candidates with the LLM (0–3 relevance).
   *
   * Everything degrades to plain BM25 when the LLM is unavailable or the
   * corresponding switch is off, so recall never breaks. `maxCandidates` bounds
   * the per-scope candidate pool before rerank; `limit` bounds the final return.
   */
  async function semanticRecall({ session, agent, scopes, query, limit, maxCandidates = 12 }) {
    const useRecall = eff(null, 'semanticRecall', cfg.semanticRecall)
    const useRerank = eff(null, 'semanticRerank', cfg.semanticRerank)

    // 1. Query expansion (optional). On any failure fall back to the original.
    let queries = [query]
    if (useRecall) {
      try {
        const expanded = parseStringArray(await askLlm(ctx, agent, {
          system: QUERY_EXPAND_PROMPT,
          userText: query,
          signal: undefined,
        }))
        if (expanded.length > 0) queries = Array.from(new Set([query, ...expanded])).slice(0, 6)
      } catch {
        /* LLM unavailable — keep the original query only */
      }
    }

    // 2. BM25 search each scope against each query variant, merge candidates.
    const byScope = new Map() // scope -> Map(id -> { record, bestScore })
    for (const scope of scopes) {
      const { store } = storeFor(scope, session, ctx)
      const pool = byScope.get(scope) ?? new Map()
      for (const q of queries) {
        const hits = await store.search(q, { limit: maxCandidates })
        for (const hit of hits) {
          const prev = pool.get(hit.record.id)
          if (prev === undefined || hit.score > prev.score) {
            pool.set(hit.record.id, { record: hit.record, score: hit.score })
          }
        }
      }
      if (pool.size > 0) byScope.set(scope, pool)
    }

    // Flatten, attaching scope, and assign global BM25 ranks for RRF fusion.
    const flat = []
    for (const [scope, pool] of byScope) {
      for (const { record, score } of pool.values()) {
        flat.push({ id: record.id, scope, content: record.content, tags: record.tags ?? [], score })
      }
    }
    flat.sort((a, b) => b.score - a.score)
    flat.forEach((c, i) => { c.rank = i })
    let candidates = flat

    // 2b. Local vector recall (Stage D): cosine over the persisted hash-vector,
    //     RRF-fused with the BM25 candidates. Offline, no LLM. Only runs when
    //     the switch is on; lazy-embedded records keep their vector thereafter.
    const useVector = eff(null, 'semanticVectorRecall', cfg.semanticVectorRecall)
    if (useVector) {
      const K = 60 // RRF constant.
      const seen = new Map() // id -> { record, scope, rrf }
      for (const c of candidates) {
        seen.set(c.id, { record: c, scope: c.scope, rrf: 1 / (K + c.rank) })
      }
      for (const scope of scopes) {
        const { store } = storeFor(scope, session, ctx)
        const hits = await store.vectorSearch(query, { limit: maxCandidates })
        hits.forEach((h, i) => {
          const prev = seen.get(h.record.id)
          const rrf = 1 / (K + i)
          if (prev) prev.rrf += rrf
          else seen.set(h.record.id, { record: h.record, scope, rrf })
        })
      }
      // Re-rank by fused RRF; the returned `score` becomes the fused value so the
      // downstream LLM rerank (if enabled) still has something to score against.
      candidates = [...seen.values()]
        .sort((a, b) => b.rrf - a.rrf)
        .map((e) => ({ id: e.record.id, scope: e.scope, content: e.record.content, tags: e.record.tags ?? [], score: Number(e.rrf.toFixed(6)) }))
    }

    if (candidates.length === 0) return []

    // 3. Rerank (optional): ask the LLM to score each candidate 0–3.
    if (useRerank) {
      try {
        const numbered = candidates
          .map((c, i) => `${i + 1}. [${c.scope}] ${c.content}${c.tags.length ? ` [${c.tags.join(', ')}]` : ''}`)
          .join('\n')
        const scores = parseIndexArray(await askLlm(ctx, agent, {
          system: RERANK_PROMPT,
          userText: `Query: ${query}\n\nCandidates:\n${numbered}`,
          signal: undefined,
        }))
        if (scores.length === candidates.length) {
          candidates = candidates
            .map((c, i) => ({ ...c, score: scores[i] }))
            .sort((a, b) => b.score - a.score)
          return candidates.slice(0, limit)
        }
        // Mismatched length → fall through to BM25 ordering below.
      } catch {
        /* LLM unavailable — keep BM25 ordering */
      }
    }

    // Deterministic fallback: order by BM25 score, then hits, then recency.
    candidates.sort((a, b) => b.score - a.score)
    return candidates.slice(0, limit)
  }

  // memory_recall — deterministic BM25 retrieval across user + global + workspace,
  // optionally upgraded with semantic query-expansion and LLM re-ranking (Stage A).
  ctx.tools.register(defineTool({
    name: 'memory_recall',
    description:
      'Retrieve stored long-term memory by relevance. Base retrieval is CJK-aware BM25 (no embeddings, no extra model calls); ' +
      'when semanticRecall / semanticRerank are enabled in settings it is upgraded with an LLM query-expansion and re-ranking pass that ' +
      'catches paraphrase and synonym matches BM25 alone misses. ' +
      'Search "user" (who the user is), "global" (all projects), and/or "workspace" (this working directory) by default. ' +
      'Superseded records (facts corrected with memory_correct) are excluded. ' +
      'Returns up to `limit` records with their ids, scopes, and relevance scores, so the model can confirm a fact or ' +
      'target one with memory_forget. Use before a task that depends on a previously stated constraint.',
    parameters: {
      query: {
        type: 'string',
        required: true,
        description: 'The keyword or phrase to match; CJK text is matched by character bigrams.',
      },
      scope: {
        type: 'string',
        enum: ['user', 'global', 'workspace', 'all'],
        description: 'Scope to search. Defaults to "all" (user, global, and workspace).',
      },
      limit: {
        type: 'number',
        description: 'Max results (default 5; capped ' + MAX_RESULTS + ').',
      },
    },
    output: {
      schema: {
        type: 'object',
        properties: {
          query: { type: 'string', required: true },
          results: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                id: { type: 'string', required: true },
                scope: { type: 'string', required: true, enum: ['user', 'global', 'workspace'] },
                content: { type: 'string', required: true },
                tags: { type: 'array', items: { type: 'string' } },
                score: { type: 'number', required: true },
              },
              additionalProperties: false,
            },
            required: true,
          },
        },
        additionalProperties: false,
      },
      render: (_args, value) => [{
        type: 'text',
        text: renderRecords(value.results, `Recalled memory for "${value.query}"`),
      }],
    },
    async execute(args, exec) {
      const session = exec.agent?.session
      const scope = args.scope === 'all' || args.scope === undefined ? 'all' : assertScope(args.scope)
      const limit = clampLimit(args.limit, maxResults)
      const scopes = scope === 'all' ? SCOPE_PRIORITY : [scope]
      const ranked = await semanticRecall({
        session,
        agent: exec.agent,
        scopes,
        query: String(args.query ?? ''),
        limit,
      })
      // Best-effort hit counter on the returned records (failures ignored).
      for (const r of ranked) {
        try {
          const { store } = storeFor(r.scope, session, ctx)
          await store.touch(r.id)
        } catch { /* touch is best-effort */ }
      }
      return {
        query: String(args.query ?? ''),
        results: ranked.map((r) => ({
          id: r.id,
          scope: r.scope,
          content: r.content,
          tags: r.tags,
          score: r.score,
        })),
      }
    },
  }))

  // memory_list — recent records for one scope, newest first.
  ctx.tools.register(defineTool({
    name: 'memory_list',
    description:
      'List the most recently stored memory records (newest first) for one scope, without retrieval scoring. ' +
      'Use it to survey what long-term memory already exists after a compact, or to find an id for memory_forget.',
    parameters: {
      scope: {
        type: 'string',
        enum: ['user', 'global', 'workspace', 'all'],
        description: 'Scope to list. Defaults to "all".',
      },
      limit: {
        type: 'number',
        description: 'Max records (default 5; capped ' + MAX_RESULTS + ').',
      },
    },
    output: {
      schema: {
        type: 'object',
        properties: {
          results: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                id: { type: 'string', required: true },
                scope: { type: 'string', required: true, enum: ['user', 'global', 'workspace'] },
                content: { type: 'string', required: true },
                tags: { type: 'array', items: { type: 'string' } },
                updatedAt: { type: 'number', required: true },
              },
              additionalProperties: false,
            },
            required: true,
          },
        },
        additionalProperties: false,
      },
      render: (_args, value) => [{
        type: 'text',
        text: renderRecords(value.results.map((r) => ({ record: r })), 'Recent memory'),
      }],
    },
    async execute(args, exec) {
      const session = exec.agent?.session
      const scope = args.scope === 'all' || args.scope === undefined ? 'all' : assertScope(args.scope)
      const limit = clampLimit(args.limit, maxResults)
      const scopes = scope === 'all' ? SCOPE_PRIORITY : [scope]
      const results = []
      for (const s of scopes) {
        const { store } = storeFor(s, session, ctx)
        const records = await store.list()
        for (const record of records.slice(0, limit)) {
          results.push({
            id: record.id,
            scope: record.scope,
            content: record.content,
            tags: Array.isArray(record.tags) ? record.tags : [],
            updatedAt: record.updatedAt,
          })
        }
      }
      results.sort((a, b) => b.updatedAt - a.updatedAt)
      return { results: results.slice(0, limit) }
    },
  }))

  // memory_forget — delete one record by id.
  ctx.tools.register(defineTool({
    name: 'memory_forget',
    description:
      'Delete one stored memory record by id (returned by memory_write, memory_recall, or memory_list). ' +
      'Use when a previously remembered fact is no longer true or was stored in error.',
    parameters: {
      id: { type: 'string', required: true, description: 'The memory record id to delete.' },
      scope: {
        type: 'string',
        enum: ['user', 'global', 'workspace'],
        description: 'The scope the record lives in. When omitted, all scopes are checked and only the first match is deleted.',
      },
    },
    output: {
      schema: {
        type: 'object',
        properties: {
          deleted: { type: 'boolean', required: true },
          id: { type: 'string', required: true },
          scope: { type: 'string', required: true, enum: ['user', 'global', 'workspace'] },
        },
        additionalProperties: false,
      },
      render: (_args, value) => [{
        type: 'text',
        text: value.deleted
          ? `Forgot ${value.scope} memory ${value.id}.`
          : `No ${value.scope} memory ${value.id} existed to forget.`,
      }],
    },
    async execute(args, exec) {
      const session = exec.agent?.session
      const scope = assertScope(args.scope)
      const scopes = scope === undefined ? SCOPE_PRIORITY : [scope]
      for (const s of scopes) {
        const { store } = storeFor(s, session, ctx)
        const outcome = await store.delete(args.id)
        if (outcome.ok && outcome.existed) return { deleted: true, id: args.id, scope: s }
      }
      return { deleted: false, id: args.id, scope: scopes[0] }
    },
  }))

  // memory_export — produce a portable bundle of one or all scopes.
  ctx.tools.register(defineTool({
    name: 'memory_export',
    description:
      'Export long-term memory as a portable bundle (v1 JSON, or human-readable Markdown). ' +
      'Only content, scope, and tags travel — provenance and hit counters are intentionally dropped. ' +
      'Use it for backup, migration to another machine, or sharing a project memory. ' +
      'The returned bundle can be re-imported with memory_import.',
    parameters: {
      scope: {
        type: 'string',
        enum: ['user', 'global', 'workspace', 'all'],
        description: 'Scope to export. Defaults to "all".',
      },
      format: {
        type: 'string',
        enum: ['json', 'markdown'],
        description: 'Export format. Defaults to "json" (round-trip importable); "markdown" is human-readable only.',
      },
    },
    output: {
      schema: {
        type: 'object',
        properties: {
          scope: { type: 'string', required: true },
          format: { type: 'string', required: true, enum: ['json', 'markdown'] },
          count: { type: 'number', required: true },
          bundle: { type: 'string', required: true, description: 'The serialized export bundle.' },
        },
        additionalProperties: false,
      },
      render: (_args, value) => [{
        type: 'text',
        text: `Exported ${value.count} memory record(s) (${value.scope}, ${value.format}):\n${value.bundle}`,
      }],
    },
    async execute(args, exec) {
      const session = exec.agent?.session
      const scope = args.scope === 'all' || args.scope === undefined ? 'all' : assertScope(args.scope)
      const format = args.format === 'markdown' ? 'markdown' : 'json'
      const scopes = scope === 'all' ? SCOPE_PRIORITY : [scope]
      const records = []
      for (const s of scopes) {
        const { store } = storeFor(s, session, ctx)
        records.push(...await store.list())
      }
      return {
        scope,
        format,
        count: records.length,
        bundle: exportBundle(records, format),
      }
    },
  }))

  // memory_import — restore records from a v1 JSON export bundle.
  ctx.tools.register(defineTool({
    name: 'memory_import',
    description:
      'Import records from a v1 JSON export bundle (produced by memory_export). ' +
      'Each record keeps its scope unless a scope is forced. Duplicate content already present in the ' +
      'target scope is skipped. Use it to restore a backup or migrate memory from another machine.',
    parameters: {
      bundle: {
        type: 'string',
        required: true,
        description: 'The v1 JSON export bundle text to import.',
      },
      scope: {
        type: 'string',
        enum: ['user', 'global', 'workspace'],
        description: 'Force all imported records into this scope (default: keep each record\'s own scope).',
      },
    },
    output: {
      schema: {
        type: 'object',
        properties: {
          imported: { type: 'number', required: true },
          skippedDuplicates: { type: 'number', required: true },
          perScope: {
            type: 'object',
            additionalProperties: true,
            description: 'Imported count per scope.',
          },
        },
        additionalProperties: false,
      },
      render: (_args, value) => [{
        type: 'text',
        text: `Imported ${value.imported} memory record(s) (${value.skippedDuplicates} duplicates skipped): ` +
          Object.entries(value.perScope).map(([s, n]) => `${s}=${n}`).join(', '),
      }],
    },
    async execute(args, exec) {
      const session = exec.agent?.session
      const forcedScope = assertScope(args.scope)
      const parsed = parseExportBundle(args.bundle)
      let imported = 0
      let skippedDuplicates = 0
      const perScope = {}
      for (const record of parsed) {
        const scope = forcedScope ?? record.scope
        const { store } = storeFor(scope, session, ctx)
        // Skip if an identical content already exists in the target scope.
        const existing = await store.list()
        const dup = existing.some((r) => r.content === record.content)
        if (dup) {
          skippedDuplicates += 1
          continue
        }
        const outcome = await store.put({ ...record, scope })
        if (outcome.ok) {
          imported += 1
          perScope[scope] = (perScope[scope] ?? 0) + 1
        } else if (outcome.reason === 'limit') {
          // Budget-exceeded records are skipped like duplicates.
          skippedDuplicates += 1
        } else {
          throw new Error(`memory_import: ${outcome.error}`)
        }
      }
      return { imported, skippedDuplicates, perScope }
    },
  }))

  // memory_batch — atomically apply multiple mutations to one scope.
  ctx.tools.register(defineTool({
    name: 'memory_batch',
    description:
      'Apply a batch of memory mutations to ONE scope atomically — all operations succeed or none are persisted, ' +
      'under a single file lock and a single write. The character budget is checked against the FINAL state, ' +
      'so a single call can remove or shorten stale entries AND add new ones even when a lone add would overflow. ' +
      'Operations run in order: add inserts (duplicates skipped), replace updates by id or unique content substring, ' +
      'remove deletes by id or unique content substring. Ambiguous or missing targets are counted in the result, not errors.',
    parameters: {
      scope: {
        type: 'string',
        enum: ['user', 'global', 'workspace'],
        required: true,
        description: 'The scope all operations apply to. Batch is single-scope by design (one atomic write).',
      },
      operations: {
        type: 'array',
        required: true,
        items: {
          type: 'object',
          properties: {
            action: { type: 'string', required: true, enum: ['add', 'replace', 'remove'] },
            content: { type: 'string', description: 'New content for add/replace.' },
            id: { type: 'string', description: 'Exact record id for replace/remove (takes precedence over oldText).' },
            oldText: { type: 'string', description: 'Unique content substring for replace/remove when no id is given.' },
            tags: { type: 'array', items: { type: 'string' }, description: 'Tags for add, or the replacement tags for replace.' },
          },
          additionalProperties: false,
        },
        description: 'The operations to apply, in order.',
      },
    },
    output: {
      schema: {
        type: 'object',
        properties: {
          scope: { type: 'string', required: true },
          ok: { type: 'boolean', required: true },
          added: { type: 'number', required: true },
          replaced: { type: 'number', required: true },
          removed: { type: 'number', required: true },
          skippedDuplicate: { type: 'number', required: true },
          skippedMissing: { type: 'number', required: true },
          skippedAmbiguous: { type: 'number', required: true },
          usage: { type: 'number', required: true },
          limit: { type: 'number', required: true },
        },
        additionalProperties: false,
      },
      render: (_args, value) => [{
        type: 'text',
        text: value.ok
          ? `Batch applied (${value.scope}): +${value.added} added, ~${value.replaced} replaced, -${value.removed} removed; ` +
            `skipped ${value.skippedDuplicate} duplicate, ${value.skippedMissing} missing, ${value.skippedAmbiguous} ambiguous. Usage ${value.usage}/${value.limit}.`
          : `Batch rejected (${value.scope}): memory would exceed ${value.limit} chars (usage ${value.usage}). ` +
            `Remove or shorten more entries and retry.`,
      }],
    },
    async execute(args, exec) {
      const session = exec.agent?.session
      const scope = assertScope(args.scope)
      const ops = Array.isArray(args.operations) ? args.operations : []
      for (const op of ops) {
        if (!['add', 'replace', 'remove'].includes(op.action)) {
          throw new Error(`memory_batch: unknown action "${op.action}"`)
        }
        if (op.action === 'add' && !(typeof op.content === 'string' && op.content.trim().length > 0)) {
          throw new Error('memory_batch: add requires non-empty content')
        }
        if ((op.action === 'replace' || op.action === 'remove') &&
            !(typeof op.id === 'string' && op.id.length > 0) &&
            !(typeof op.oldText === 'string' && op.oldText.trim().length > 0)) {
          throw new Error(`memory_batch: ${op.action} requires id or oldText`)
        }
        if (cfg.scanThreatsOnWrite && (op.action === 'add' || op.action === 'replace') && typeof op.content === 'string') {
          const threats = scanThreats(op.content)
          if (threats.length > 0) {
            throw new Error(`memory_batch: content rejected — matches threat pattern(s): ${threats.join(', ')}`)
          }
        }
      }
      const { store } = storeFor(scope, session, ctx)
      const outcome = await store.applyBatch(ops.map((op) => ({ ...op, scope })))
      if (!outcome.ok) {
        throw new Error(`memory_batch: ${outcome.error}`)
      }
      return {
        scope,
        ok: true,
        added: outcome.tally.added,
        replaced: outcome.tally.replaced,
        removed: outcome.tally.removed,
        skippedDuplicate: outcome.tally.skippedDuplicate,
        skippedMissing: outcome.tally.skippedMissing,
        skippedAmbiguous: outcome.tally.skippedAmbiguous,
        usage: outcome.usage,
        limit: outcome.limit,
      }
    },
  }))

  // memory_diagnose — inspect the memory system's live state (observability).
  ctx.tools.register(defineTool({
    name: 'memory_diagnose',
    description:
      'Report safe diagnostics for the long-term memory plugin: the settings actually in effect ' +
      '(injectContext / injectTags / autoSummarize / compressWithLLM / charLimit), whether the ' +
      'per-assembly injection is active, and per-scope store stats (live vs total records, char ' +
      'usage vs limit, superseded count, backing file). Never returns secrets. Use when memory ' +
      'seems to be missing or misbehaving (e.g. injection not appearing, writes failing).',
    parameters: {},
    output: {
      schema: {
        type: 'object',
        properties: {
          report: { type: 'string', required: true, description: 'Multi-line diagnostics report.' },
        },
        additionalProperties: false,
      },
      render: (_args, value) => [{ type: 'text', text: value.report }],
    },
    async execute(args, exec) {
      const session = exec.agent?.session
      const lines = []
      const mode = normalizeInjectMode(eff(null, 'injectContext', cfg.injectContext))
      lines.push('long-term-memory diagnose')
      lines.push(`- injectContext: ${mode}${mode === 'off' ? ' (injection DISABLED — nothing is injected per assembly)' : ''}`)
      lines.push(`- injectTags: ${JSON.stringify(eff(null, 'injectTags', cfg.injectTags) ?? [])}${mode !== 'recent' ? ' (recent-only filter)' : ''}`)
      lines.push(`- maxInjectedChars: ${cfg.maxInjectedChars}`)
      lines.push(`- autoSummarize: ${eff(null, 'autoSummarize', cfg.autoSummarize)}`)
      lines.push(`- compressWithLLM: ${eff(null, 'compressWithLLM', cfg.compressWithLLM)}`)
      lines.push(`- semanticRecall: ${eff(null, 'semanticRecall', cfg.semanticRecall)}`)
      lines.push(`- semanticRerank: ${eff(null, 'semanticRerank', cfg.semanticRerank)}`)
      lines.push(`- semanticVectorRecall: ${eff(null, 'semanticVectorRecall', cfg.semanticVectorRecall)}`)
      lines.push(`- semanticDedupThreshold: ${eff(null, 'semanticDedupThreshold', cfg.semanticDedupThreshold)}`)
      lines.push(`- autoConsolidate: ${eff(null, 'autoConsolidate', cfg.autoConsolidate)}`)
      lines.push(`- requireApprovalForWrite: ${eff(null, 'requireApprovalForWrite', cfg.requireApprovalForWrite)}`)
      lines.push(`- autoApproveAfterMs: ${eff(null, 'autoApproveAfterMs', cfg.autoApproveAfterMs)}`)
      lines.push(`- charLimit: ${eff(null, 'charLimit', cfg.charLimit)}`)
      try {
        const { items } = loadPending(pendingPathFor(session, ctx))
        lines.push(`- pending queue: ${items.length} item(s) awaiting approval${items.length > 0 ? ' (auto-approve after ' + eff(null, 'autoApproveAfterMs', cfg.autoApproveAfterMs) + 'ms)' : ''}`)
      } catch { /* pending 不可用时忽略 */ }
      for (const scope of SCOPE_PRIORITY) {
        try {
          const { store, file } = storeFor(scope, session, ctx)
          if (store.records === null) await store.list().catch(() => {})
          const records = [...store.records.values()]
          const live = records.filter((r) => r.superseded !== true)
          lines.push(`- ${scope}: ${live.length} live / ${records.length} total (${records.length - live.length} superseded), ${MemoryStore.usageOf(records)}/${store.charLimit} chars, file: ${file}`)
        } catch (error) {
          lines.push(`- ${scope}: unavailable (${String(error?.message ?? error)})`)
        }
      }
      return { report: lines.join('\n') }
    },
  }))

  // ── /memory user command ───────────────────────────────────────────────────
  // Human-facing surface (no model involved): browse, search, inspect, forget,
  // and export memories directly. Usage:
  //   /memory                 — help
  //   /memory list [scope]    — recent records, newest first
  //   /memory search <query>  — BM25 recall
  //   /memory get <id>        — one record
  //   /memory forget <id>     — delete one record
  //   /memory export [format] — portable bundle (json | markdown)
  ctx.commands.register({
    name: 'memory',
    description: 'Browse, search, inspect, forget, or export long-term memory (user-facing, no model call).',
    input: { hint: 'list | search <query> | get <id> | forget <id> | export [json|markdown]' },
    async handler(invocation) {
      const session = invocation.agent?.session
      const raw = invocation.rawInput.trim()
      const [sub, ...rest] = raw.split(/\s+/)
      try {
        if (sub === '' || sub === 'help' || sub === '-h' || sub === '--help') {
          return { kind: 'success', text: memoryHelp() }
        }
        if (sub === 'list') {
          const scopeArg = rest[0]
          const scope = scopeArg === undefined || scopeArg === 'all' ? 'all' : assertScope(scopeArg)
          const scopes = scope === 'all' ? SCOPE_PRIORITY : [scope]
          const lines = []
          for (const s of scopes) {
            const { store } = storeFor(s, session, ctx)
            const records = await store.list()
            if (records.length === 0) continue
            lines.push(`## ${scopeLabel(s)} (${records.length})`)
            for (const r of records.slice(0, maxResults)) {
              const tags = r.tags.length > 0 ? ` [${r.tags.join(', ')}]` : ''
              const stale = r.superseded === true ? ' [SUPERSEDED]' : ''
              lines.push(`- \`${r.id}\`${tags}${stale}: ${r.content}`)
            }
          }
          return { kind: 'success', text: lines.length > 0 ? lines.join('\n') : 'No memories stored yet.' }
        }
        if (sub === 'search') {
          const query = rest.join(' ')
          if (query.length === 0) return { kind: 'error', text: 'usage: /memory search <query>' }
          const scopes = SCOPE_PRIORITY
          const results = []
          for (const s of scopes) {
            const { store } = storeFor(s, session, ctx)
            const hits = await store.search(query, { limit: maxResults })
            for (const hit of hits) results.push({ ...hit, scope: s })
          }
          results.sort((a, b) => b.score - a.score)
          if (results.length === 0) return { kind: 'success', text: `No memories matched "${query}".` }
          const lines = results.slice(0, maxResults).map((h) => {
            const tags = h.record.tags.length > 0 ? ` [${h.record.tags.join(', ')}]` : ''
            return `- \`${h.record.id}\` [${h.scope}]${tags} (score ${h.score.toFixed(2)}): ${h.record.content}`
          })
          return { kind: 'success', text: `Matched ${results.length} for "${query}":\n${lines.join('\n')}` }
        }
        if (sub === 'get') {
          const id = rest[0]
          if (!id) return { kind: 'error', text: 'usage: /memory get <id>' }
          for (const s of SCOPE_PRIORITY) {
            const { store } = storeFor(s, session, ctx)
            const record = await store.get(id)
            if (record !== undefined) {
              const tags = record.tags.length > 0 ? ` [${record.tags.join(', ')}]` : ''
              const source = record.source ? ` (from session ${record.source.sessionId})` : ''
              return { kind: 'success', text: `\`${record.id}\` [${record.scope}]${tags}${source}\n${record.content}` }
            }
          }
          return { kind: 'error', text: `No memory with id ${id}.` }
        }
        if (sub === 'forget') {
          const id = rest[0]
          if (!id) return { kind: 'error', text: 'usage: /memory forget <id>' }
          for (const s of SCOPE_PRIORITY) {
            const { store } = storeFor(s, session, ctx)
            const outcome = await store.delete(id)
            if (outcome.ok && outcome.existed) {
              return { kind: 'success', text: `Forgot ${s} memory ${id}.` }
            }
          }
          return { kind: 'error', text: `No memory with id ${id}.` }
        }
        if (sub === 'export') {
          const format = rest[0] === 'markdown' ? 'markdown' : 'json'
          const records = []
          for (const s of SCOPE_PRIORITY) {
            const { store } = storeFor(s, session, ctx)
            records.push(...await store.list())
          }
          return { kind: 'success', text: exportBundle(records, format) }
        }
        return { kind: 'error', text: `Unknown /memory subcommand "${sub}".\n\n${memoryHelp()}` }
      } catch (error) {
        return { kind: 'error', text: `memory command failed: ${error.message}` }
      }
    },
  })

  // ── 宿主 API（供未来 Web 记忆管理界面调用）─────────────────────────────
  // webServer 只在 web profile 存在；其它 profile 无界面需求，惰性跳过。
  // 路由：GET /api/memory/list?scope=   GET /api/memory/search?q=&scope=
  //        GET /api/memory/get?id=     DELETE /api/memory/delete?id=
  //        POST /api/memory/import     GET /api/memory/settings
  const webServer = ctx.get('webServer')
  if (webServer !== undefined) {
    const sendJson = (res, status, value) => {
      const body = JSON.stringify(value)
      res.writeHead(status, {
        'content-type': 'application/json; charset=utf-8',
        'cache-control': 'no-store',
        'content-length': Buffer.byteLength(body),
      })
      res.end(body)
    }
    const readJsonBody = async (req) => {
      let body = ''
      for await (const chunk of req) {
        body += chunk
        if (body.length > 1_048_576) throw new Error('request body too large')
      }
      return body === '' ? {} : JSON.parse(body)
    }
    const routes = {
      '/api/memory/list': async (req, res) => {
        const scope = new URL(req.url, 'http://localhost').searchParams.get('scope') ?? 'all'
        const session = ctx.agents?.currentInitiator?.()?.session
        const scopes = scope === 'all' ? SCOPE_PRIORITY : [assertScope(scope)]
        const results = []
        for (const s of scopes) {
          const { store } = storeFor(s, session, ctx)
          results.push(...(await store.list()).map((r) => ({ ...r, scope: s })))
        }
        results.sort((a, b) => b.updatedAt - a.updatedAt)
        sendJson(res, 200, { results })
      },
      '/api/memory/search': async (req, res) => {
        const params = new URL(req.url, 'http://localhost').searchParams
        const query = params.get('q') ?? ''
        const scope = params.get('scope') ?? 'all'
        const session = ctx.agents?.currentInitiator?.()?.session
        const scopes = scope === 'all' ? SCOPE_PRIORITY : [assertScope(scope)]
        const results = []
        for (const s of scopes) {
          const { store } = storeFor(s, session, ctx)
          const hits = await store.search(query, { limit: maxResults })
          results.push(...hits.map((h) => ({ ...h.record, scope: s, score: h.score })))
        }
        results.sort((a, b) => b.score - a.score)
        sendJson(res, 200, { query, results })
      },
      '/api/memory/get': async (req, res) => {
        const id = new URL(req.url, 'http://localhost').searchParams.get('id') ?? ''
        for (const s of SCOPE_PRIORITY) {
          const { store } = storeFor(s, undefined, ctx)
          const record = await store.get(id)
          if (record !== undefined) return sendJson(res, 200, { record: { ...record, scope: s } })
        }
        sendJson(res, 404, { error: 'not found' })
      },
      '/api/memory/delete': async (req, res) => {
        const id = new URL(req.url, 'http://localhost').searchParams.get('id') ?? ''
        for (const s of SCOPE_PRIORITY) {
          const { store } = storeFor(s, undefined, ctx)
          const outcome = await store.delete(id)
          if (outcome.ok && outcome.existed) return sendJson(res, 200, { deleted: true, scope: s })
        }
        sendJson(res, 404, { error: 'not found' })
      },
      '/api/memory/settings': async (req, res) => {
        if (req.method === 'POST') {
          let payload
          try {
            payload = await readJsonBody(req)
          } catch (error) {
            return sendJson(res, 400, { error: `bad request: ${String(error?.message ?? error)}` })
          }
          const patch = {}
          for (const key of SETTINGS_KEYS) {
            if (payload[key] !== undefined) patch[key] = payload[key]
          }
          if (Object.keys(patch).length === 0) return sendJson(res, 400, { error: 'no supported settings fields' })
          try {
            // Persist to our own settings file (works without the ctx.settings service).
            const saved = saveSettingsFile(patch)
            Object.assign(cfg, saved)
            // Best-effort: also push into ctx.settings if it happens to be mounted.
            if (memorySettings !== undefined) {
              try { await memorySettings.update(patch) } catch { /* non-fatal */ }
            }
          } catch (error) {
            return sendJson(res, 422, { error: `invalid settings: ${String(error?.message ?? error)}` })
          }
        }
        sendJson(res, 200, {
          autoSummarize: eff(null, 'autoSummarize', cfg.autoSummarize),
          compressWithLLM: eff(null, 'compressWithLLM', cfg.compressWithLLM),
          injectContext: eff(null, 'injectContext', cfg.injectContext),
          injectTags: eff(null, 'injectTags', cfg.injectTags),
          requireApprovalForWrite: eff(null, 'requireApprovalForWrite', cfg.requireApprovalForWrite),
          autoApproveAfterMs: eff(null, 'autoApproveAfterMs', cfg.autoApproveAfterMs),
          charLimit: eff(null, 'charLimit', cfg.charLimit),
          semanticRecall: eff(null, 'semanticRecall', cfg.semanticRecall),
          semanticRerank: eff(null, 'semanticRerank', cfg.semanticRerank),
          semanticVectorRecall: eff(null, 'semanticVectorRecall', cfg.semanticVectorRecall),
          semanticDedupThreshold: eff(null, 'semanticDedupThreshold', cfg.semanticDedupThreshold),
          autoConsolidate: eff(null, 'autoConsolidate', cfg.autoConsolidate),
          consolidateIntervalMs: eff(null, 'consolidateIntervalMs', cfg.consolidateIntervalMs),
          consolidateMaxEntries: eff(null, 'consolidateMaxEntries', cfg.consolidateMaxEntries),
        })
      },
      '/api/memory/put': async (req, res) => {
        if (req.method !== 'POST') return sendJson(res, 405, { error: 'method not allowed' })
        let payload
        try {
          payload = await readJsonBody(req)
        } catch (error) {
          return sendJson(res, 400, { error: `bad request: ${String(error?.message ?? error)}` })
        }
        const scope = assertScope(payload.scope) ?? 'global'
        const content = typeof payload.content === 'string' ? payload.content.trim() : ''
        if (content.length === 0) return sendJson(res, 400, { error: 'content is required' })
        if (cfg.scanThreatsOnWrite) {
          const threats = scanThreats(content)
          if (threats.length > 0) return sendJson(res, 422, { error: `content matches threat pattern(s): ${threats.join(', ')}` })
        }
        const { store } = storeFor(scope, undefined, ctx)
        const record = {
          scope,
          content,
          tags: Array.isArray(payload.tags) ? payload.tags.filter((t) => typeof t === 'string' && t.length > 0) : [],
        }
        if (typeof payload.id === 'string' && payload.id.length > 0) record.id = payload.id // 编辑：按 id 更新
        const outcome = await store.put(record)
        if (outcome.ok) return sendJson(res, 200, { ok: true, record: outcome.record })
        if (outcome.reason === 'limit') {
          const freed = await tryCompress(store, undefined, undefined, content.length)
          if (freed) {
            const retry = await store.put(record)
            if (retry.ok) return sendJson(res, 200, { ok: true, record: retry.record })
            return sendJson(res, 409, { error: retry.error })
          }
        }
        sendJson(res, 409, { error: outcome.error })
      },
      '/api/memory/import': async (req, res) => {
        if (req.method !== 'POST') return sendJson(res, 405, { error: 'method not allowed' })
        let payload
        try {
          payload = await readJsonBody(req)
        } catch (error) {
          return sendJson(res, 400, { error: `bad request: ${String(error?.message ?? error)}` })
        }
        try {
          const forcedScope = payload.scope ? assertScope(payload.scope) : undefined
          const parsed = parseExportBundle(payload.bundle ?? '')
          let imported = 0
          let skipped = 0
          const perScope = {}
          for (const record of parsed) {
            const scope = forcedScope ?? record.scope
            const { store } = storeFor(scope, undefined, ctx)
            const existing = await store.list()
            if (existing.some((r) => r.content === record.content)) { skipped += 1; continue }
            const outcome = await store.put({ ...record, scope })
            if (outcome.ok) { imported += 1; perScope[scope] = (perScope[scope] ?? 0) + 1 }
            else if (outcome.reason !== 'limit') { skipped += 1 }
          }
          sendJson(res, 200, { imported, skipped, perScope })
        } catch (error) {
          sendJson(res, 400, { error: String(error?.message ?? error) })
        }
      },
      '/api/memory/pending': async (req, res) => {
        const session = ctx.agents?.currentInitiator?.()?.session
        if (req.method === 'POST') {
          let payload
          try {
            payload = await readJsonBody(req)
          } catch (error) {
            return sendJson(res, 400, { error: `bad request: ${String(error?.message ?? error)}` })
          }
          const id = typeof payload.id === 'string' ? payload.id : ''
          const action = payload.action === 'reject' ? 'reject' : 'approve'
          if (id.length === 0) return sendJson(res, 400, { error: 'id is required' })
          const result = action === 'reject'
            ? rejectPending(session, ctx, id)
            : await approvePending(session, ctx, id)
          if (!result.ok) return sendJson(res, result.error === 'pending item not found' ? 404 : 422, { error: result.error })
          // 批准后立即停止自动 flush 的脏读：回写成功即可。
          return sendJson(res, 200, { ok: true, result })
        }
        // GET：列出待确认队列（含自动放行倒计时剩余毫秒，便于 UI 展示）。
        const file = pendingPathFor(session, ctx)
        const cache = loadPending(file)
        const ms = eff(null, 'autoApproveAfterMs', cfg.autoApproveAfterMs)
        const now = Date.now()
        const items = cache.items.map((it) => ({
          ...it,
          autoApproveInMs: ms > 0 ? Math.max(0, ms - (now - (it.createdAt || 0))) : null,
        }))
        sendJson(res, 200, { items, autoApproveAfterMs: ms })
      },
    }
    for (const [path, handler] of Object.entries(routes)) {
      ctx.effect(() => webServer.register({
        kind: 'exact',
        path,
        handler: async (req, res) => {
          try {
            await handler(req, res)
          } catch (error) {
            sendJson(res, Number(error?.status) > 0 ? error.status : 500, { error: String(error?.message ?? error) })
          }
        },
      }), `long-term-memory: ${path}`)
    }
  }
}
function memoryHelp() {
  return [
    'Usage:',
    '  /memory list [user|global|workspace|all]   — recent records, newest first',
    '  /memory search <query>                     — BM25 recall across all scopes',
    '  /memory get <id>                           — inspect one record',
    '  /memory forget <id>                        — delete one record',
    '  /memory export [json|markdown]             — portable bundle',
  ].join('\n')
}
