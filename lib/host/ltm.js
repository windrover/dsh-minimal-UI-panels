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
import { createRuntime, SETTINGS_KEYS, loadSettingsFile, saveSettingsFile } from './ltm/runtime.js'
import { registerHostApi } from './ltm/api.js'
import { registerMemoryCommand } from './ltm/command.js'
import { registerSystemPromptSections } from './ltm/context.js'
import { registerMemoryTools } from './ltm/tools.js'
import { CONTEXT_ORDER, DEFAULT_MAX_INJECTED_CHARS, DEFAULT_RECALL_LIMIT, DEFAULT_TIMELINE_INJECTED_SPLIT, INJECT_MODES, MAX_RESULTS, SCOPES, SCOPE_PRIORITY, TOOL_GUIDANCE_ORDER, assertScope, clampLimit, describeRecord, normalizeInjectMode, renderRecords, scopeLabel } from './ltm/shared.js'

export const name = 'long-term-memory'
export const inject = ['tools', 'systemPrompt', 'commands', 'settings', 'agents', 'workspaceRegistry']
/** Default number of results returned when the caller omits `limit`. */
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
    /**
     * Soft cap for the resident tier. Resident records are filled first and are
     * never evicted for recency; this cap only guards against someone marking
     * dozens of records resident. It is filled in scope order (user, global,
     * workspace), so a cap that is too small drops the tail — size it above the
     * real resident total.
     */
    residentMaxChars: 2000,
    /** Enforce `limit` values ≤ MAX_RESULTS. */
    maxResults: MAX_RESULTS,
    /** Per-store character budget; a write exceeding it is refused (after compression attempts). */
    charLimit: DEFAULT_CHAR_LIMIT,
  }
}


export function apply(ctx, config = {}) {
  const initializedConfig = defineConfig()
  const cfg = { ...initializedConfig, ...config }
  // Merge persisted settings from our own file (works even when ctx.settings is
  // not mounted). The cordis patch (config) is the base; the file overrides it.
  Object.assign(cfg, loadSettingsFile())
  // Never let a caller exceed the hard result cap.
  const maxResults = Math.min(cfg.maxResults, MAX_RESULTS)

  // 状态层：store 缓存、待确认队列、settings/eff 都在 runtime 里创建一次。
  const runtime = createRuntime(ctx, cfg)
  const { storeFor, pendingPathFor, loadPending, savePending, pushPending,
    approvePending, rejectPending, autoFlushPending, eff, memorySettings } = runtime

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

  // ── 注入给模型的两段提示（静态 guidance + 每次组装的动态摘要）─────────
  registerSystemPromptSections({ ctx, eff, cfg, storeFor })
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

  // ── tools（九个模型工具）──────────────────────────────────────────────
  registerMemoryTools({ ctx, cfg, maxResults, storeFor, eff, tryCompress, pendingPathFor, loadPending })

  // ── /memory 用户命令（人用的浏览/检索/遗忘/导出）──────────────────────
  registerMemoryCommand({ ctx, storeFor, maxResults })

  // ── 宿主 API（浏览器记忆面板走这些路由）──────────────────────────────
  registerHostApi({
    ctx, storeFor, eff, cfg, maxResults, memorySettings,
    pendingPathFor, loadPending, approvePending, rejectPending, tryCompress,
  })
}
