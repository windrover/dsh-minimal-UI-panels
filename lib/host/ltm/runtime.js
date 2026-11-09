/*
 * dsh-minimal-ui-panels — host/ltm 的状态层。
 *
 * ltm.js 的 apply() 原本是个 1532 行的函数，里面以闭包形式持有几样带状态的东西：
 *   - stores / pendingStores 两个按文件路径缓存的 Map（跨回合复用内存索引）
 *   - storeFor()：把 (scope, session, owner) 解析成 store + workspaceRoot + file
 *   - 待确认队列（autoSummarize 蒸馏出的事实先入队，审批后才落库）
 *   - settings schema 与 eff()（settings 服务优先，回退 config）
 *
 * 这些必须在整个 apply 生命周期内共享，所以做成一个显式的 runtime 对象，
 * 由 apply 创建一次；其余被拆出去的模块只接收它，不再各自持有状态。
 */
import { dirname, isAbsolute, resolve, sep } from 'node:path'
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import z from '@deepseek-ai/schemastery'
import { dshHomePath } from '@deepseek-ai/dsh-home-paths'
import { MemoryStore } from '../store.js'
import { scanThreats } from '../threats.js'
import { classifyWrite, dedupThresholdFrom } from './dedup.js'
import { archiveRecords } from './archive.js'

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

export const SETTINGS_KEYS = [
  'autoSummarize', 'compressWithLLM', 'injectContext', 'injectTags', 'residentMaxChars',
  'requireApprovalForWrite', 'autoApproveAfterMs', 'charLimit',
  'semanticRecall', 'semanticRerank', 'semanticVectorRecall',
  'semanticDedupThreshold', 'autoConsolidate', 'consolidateIntervalMs',
  'consolidateMaxEntries',
]

function settingsFilePath() {
  return dshHomePath('dsh-memory', 'settings.json')
}

export function loadSettingsFile() {
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

export function saveSettingsFile(patch) {
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

/**
 * Create the stateful core shared by every ltm subsystem.
 * @param ctx - plugin context (workspaceRegistry / settings may be absent).
 * @param cfg - merged configuration (defaults <- cordis patch <- settings file).
 */
export function createRuntime(ctx, cfg) {
  // Cache one store instance per backing-file path so reads reuse the
  // in-memory index across turns instead of re-reading the file each time.
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
  /**
   * 把一条待写入事实放入待确认队列（模型 memory_write 或自动蒸馏）。
   * 返回新建的 pending id。`tier` 一并保存，批准落库时原样带回，
   * 否则 resident/archive 的记忆会在排队后被降级成 index。
   */
  function pushPending(session, owner, fact) {
  const file = pendingPathFor(session, owner)
  const cache = loadPending(file)
  const id = `p_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
  const item = {
    id,
    scope: fact.scope,
    content: fact.content,
    tags: Array.isArray(fact.tags) ? fact.tags : [],
    tier: fact.tier === 'resident' || fact.tier === 'archive' ? fact.tier : 'index',
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
  // 超限时先把 superseded 记录归档腾出预算；否则一条 328 字的待确认项会把
  // 一个 19993/20000 的库卡死，批准永远失败。
  await freeSpaceByArchivingSuperseded(store, item.content.length)
  // 与直写/自动放行共用同一套判定，避免三条路径三种语义。
  const threshold = dedupThresholdFrom(eff(null, 'semanticDedupThreshold', cfg.semanticDedupThreshold))
  const duplicate = await classifyWrite(store, item, { threshold })
  if (duplicate.exact !== undefined || duplicate.similar !== undefined) {
    cache.items.splice(idx, 1); savePending(cache)
    return { ok: true, skipped: true, reason: duplicate.exact !== undefined ? 'exact' : 'similar', scope: item.scope }
  }
  const outcome = await store.put({ scope: item.scope, content: item.content, tags: item.tags, tier: item.tier, source: { sessionId: item.sessionId, origin: 'pending_approve' } })
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
  const threshold = dedupThresholdFrom(eff(null, 'semanticDedupThreshold', cfg.semanticDedupThreshold))
  for (const it of cache.items) {
    if (now - (it.createdAt || 0) >= ms) {
      const { store } = storeFor(it.scope, session, owner)
      try {
        await freeSpaceByArchivingSuperseded(store, it.content.length)
        // 自动放行过去直接 put，绕过了批准路径的去重；现在统一判定，
        // 重复项按“已处理”丢弃（不进 keep，也就不会无限重试）。
        const duplicate = await classifyWrite(store, it, { threshold })
        if (duplicate.exact !== undefined || duplicate.similar !== undefined) continue
        const outcome = await store.put({ scope: it.scope, content: it.content, tags: it.tags, tier: it.tier, source: { sessionId: it.sessionId, origin: 'pending_auto' } })
        if (outcome.ok) flushed += 1
        else keep.push(it) // 落库失败（如超限）保留待下次
      } catch { keep.push(it) }
    } else keep.push(it)
  }
  if (flushed > 0) { cache.items = keep; savePending(cache) }
  return flushed
  }

  /**
   * Free budget by archiving superseded records.
   *
   * A corrected record is already invisible to recall and injection, but it
   * still occupies `charLimit` — so a heavily-corrected scope can sit at the
   * cap with only a fraction of its budget live, and every put (including
   * approving a pending write) fails. Superseded records are the safest thing
   * to evict first: archive them, then drop them from the live store.
   *
   * @returns whether `reserveChars` now fits (true when already under).
   */
  async function freeSpaceByArchivingSuperseded(store, reserveChars = 0) {
    const records = await store.list()
    if (MemoryStore.usageOf(records) + reserveChars <= store.charLimit) return true
    const superseded = records.filter((record) => record.superseded === true)
    if (superseded.length === 0) return false
    try {
      await archiveRecords(store, superseded, 'superseded_cleanup')
    } catch {
      return false // never delete what we could not archive
    }
    for (const record of superseded) await store.delete(record.id)
    return MemoryStore.usageOf(await store.list()) + reserveChars <= store.charLimit
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
  residentMaxChars: z.number().min(0).default(cfg.residentMaxChars),
  requireApprovalForWrite: z.boolean().default(cfg.requireApprovalForWrite),
  autoApproveAfterMs: z.number().min(0).default(cfg.autoApproveAfterMs),
  charLimit: z.number().min(1).default(cfg.charLimit),
  semanticRecall: z.boolean().default(cfg.semanticRecall),
  semanticRerank: z.boolean().default(cfg.semanticRerank),
  semanticVectorRecall: z.boolean().default(cfg.semanticVectorRecall),
  promptRecall: z.boolean().default(cfg.promptRecall),
  promptRecallLimit: z.number().min(1).max(10).default(cfg.promptRecallLimit),
  promptRecallMaxChars: z.number().min(100).default(cfg.promptRecallMaxChars),
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


  return {
    memorySettings,
    storeFor,
    pendingPathFor,
    loadPending,
    savePending,
    pushPending,
    approvePending,
    rejectPending,
    autoFlushPending,
    eff,
  }
}
