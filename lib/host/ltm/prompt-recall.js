/*
 * dsh-minimal-ui-panels — host/ltm 的「每轮相关召回」（promptRecall，默认关）。
 *
 * 默认注入是「最近写入的 N 条」摘要，不知道当前这一轮在问什么。这个可选步骤
 * 在 agent/pre-step 里用当前用户输入跑一次本地 BM25，把命中的记录作为
 * `form: 'recall'` 的 user message 追加进去——DSH 对该 form 的定义正是
 * 「从另一个会话日志里取出的材料」，语义对得上，而且不调模型、不走网络。
 *
 * 三个约束：
 *   - 只在本步有新的人类输入时执行（注入的 runtime-context 不算）；
 *   - 相同块不重复追加：读会话历史里最后一条本插件的注入块比对，
 *     fork/重启后内存状态丢失也不会堆叠（Hindsight 的 lastInjectedText 同思路）；
 *   - 任何异常都返回原 decision —— 记忆永远不能卡住一步。
 */
import { randomUUID } from 'node:crypto'
import { SCOPE_PRIORITY, readSessionEvents } from './shared.js'

/** Source kind stamped on promptRecall blocks, so dedupe and summarise can find them. */
export const PROMPT_RECALL_KIND = 'plugin:long-term-memory'

/** The human text in this step's claimed batch (injected context is not a prompt). */
export function humanPromptOf(messages) {
  const parts = []
  for (const message of messages ?? []) {
    if (message?.role !== 'user') continue
    if (message?.source?.kind !== 'user') continue
    for (const block of message.content ?? []) {
      if (block?.type === 'text' && typeof block.text === 'string') parts.push(block.text)
    }
  }
  return parts.join('\n').trim()
}

/** The last promptRecall block this session's history already carries, if any. */
export function lastPromptRecall(session) {
  const events = readSessionEvents(session)
  for (let i = events.length - 1; i >= 0; i--) {
    const event = events[i]
    if (event?.type !== 'user/message') continue
    const data = event.data ?? {}
    const message = data.message ?? data
    if (message?.source?.kind !== PROMPT_RECALL_KIND) continue
    return (message.content ?? []).map((block) => block.text ?? '').join('\n')
  }
  return undefined
}

/** One bounded block of recalled records, or '' when nothing fits. */
export function formatPromptRecall(items, maxChars) {
  const header = 'Recall from long-term memory for this prompt (past records — verify before acting):'
  if (items.length === 0) return ''
  const lines = [header]
  let used = header.length
  for (const item of items) {
    const record = item.record
    const tags = (record.tags ?? []).length > 0 ? ` #${record.tags.slice(0, 3).join(' #')}` : ''
    const line = `- [${item.scope}] ${record.content}${tags}`
    if (used + line.length + 1 > maxChars) break
    lines.push(line)
    used += line.length + 1
  }
  return lines.length > 1 ? lines.join('\n') : ''
}

/**
 * Register the opt-in per-prompt recall listener.
 *
 * Kept out of `registerMemoryTools` because it needs the lifecycle seam, not a
 * tool definition; every failure path returns the untouched decision.
 */
export function registerPromptRecall({ ctx, cfg, eff, storeFor }) {
  ctx.on('agent/pre-step', async (payload, next) => {
    const decision = await next()
    if (decision?.kind !== 'enter') return decision
    if (!eff(null, 'promptRecall', cfg.promptRecall)) return decision
    if (payload.signal?.aborted) return decision
    const session = payload.agent?.session
    if (session === undefined) return decision
    const prompt = humanPromptOf(decision.messages)
    if (prompt.length < 2) return decision
    try {
      const limit = Math.max(1, Math.min(10, eff(null, 'promptRecallLimit', cfg.promptRecallLimit)))
      const query = prompt.slice(0, 400)
      const hits = []
      for (const scope of SCOPE_PRIORITY) {
        const { store } = storeFor(scope, session, ctx)
        for (const hit of await store.search(query, { limit })) hits.push({ ...hit, scope })
      }
      hits.sort((a, b) => b.score - a.score)
      const block = formatPromptRecall(hits.slice(0, limit), eff(null, 'promptRecallMaxChars', cfg.promptRecallMaxChars))
      if (block === '' || block === lastPromptRecall(session)) return decision
      return {
        kind: 'enter',
        messages: [
          ...decision.messages,
          {
            id: randomUUID(),
            role: 'user',
            content: [{ type: 'text', text: block }],
            source: { kind: PROMPT_RECALL_KIND, form: 'recall' },
          },
        ],
      }
    } catch {
      return decision
    }
  }, { prepend: true })
}
