/*
 * dsh-minimal-ui-panels — host/ltm 注入给模型的两段提示。
 *
 *   - system guidance：一段静态说明（什么时候该写记忆、什么时候该回忆）
 *   - per-assembly dynamic context：每次组装请求时渲染的「最近记忆」摘要
 *
 * 第二段必须是**同步**的：DSH 的组装器用普通调用求值 text 函数，不会 await，
 * 随后对它做字符串插值。返回 Promise 会让每一轮都抛 "text.indexOf is not a function"。
 * store 首次加载后记录都在内存里，所以预热之后同步渲染是可行的。
 */
import { CONTEXT_ORDER, DEFAULT_TIMELINE_INJECTED_SPLIT, SCOPE_PRIORITY, TOOL_GUIDANCE_ORDER, normalizeInjectMode, scopeLabel } from './shared.js'
import { recentDigestSync } from './render.js'
import { buildInjectionBlock } from '../automation.js'

export function registerSystemPromptSections(deps) {
  const { ctx, eff, cfg, storeFor } = deps
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
}
