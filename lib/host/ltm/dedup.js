/*
 * dsh-minimal-ui-panels — host/ltm 的写入去重判定（单一入口）。
 *
 * 去重过去散在五条写入路径里，语义还各不相同：
 *   - memory_write 直写：不查重
 *   - 待确认手动批准：精确 + 语义去重（静默跳过）
 *   - 待确认自动放行：完全不查重（缺口）
 *   - import / batch：精确去重
 *   - autoSummarize：精确 + 语义去重
 *
 * 这里只做「判定」，不做「处置」：命中精确重复还是相似重复，返回给调用方，
 * 由各路径决定是“返回已有 id”“跳过”还是“照写但提示”。这样每条路径的语义
 * 仍然显式，但“什么算重复”只有一份实现。
 */
import { similarity } from '../automation.js'

/**
 * Normalize a configured threshold. Anything absent, non-numeric, or ≤ 0 means
 * "exact match only"; values above 1 clamp to 1.
 */
export function dedupThresholdFrom(value) {
  const n = Number(value)
  if (!Number.isFinite(n) || n <= 0) return 0
  return Math.min(n, 1)
}

/**
 * Classify a candidate write against a store's live records.
 *
 * `exact` wins over `similar`: if the same content already exists there is
 * nothing to compare semantically.
 *
 * @param store - MemoryStore (must expose `list()`).
 * @param record - candidate `{ content }` (other fields ignored).
 * @param opts.threshold - 0 disables the similar check (exact only).
 * @param opts.excludeId - ignore this id (used when re-writing an existing record).
 * @returns `{ exact }`, `{ similar: { record, score } }`, or `{}`.
 */
export async function classifyWrite(store, record, { threshold = 0, excludeId } = {}) {
  const content = typeof record?.content === 'string' ? record.content : ''
  if (content.length === 0) return {}
  const existing = (await store.list()).filter(
    (candidate) => candidate.superseded !== true && candidate.id !== record.id && candidate.id !== excludeId
  )
  const exact = existing.find((candidate) => candidate.content === content)
  if (exact !== undefined) return { exact }

  const limit = dedupThresholdFrom(threshold)
  if (limit === 0) return {}
  let closest
  for (const candidate of existing) {
    const score = similarity(candidate, record)
    if (score >= limit && (closest === undefined || score > closest.score)) {
      closest = { record: candidate, score }
    }
  }
  return closest === undefined ? {} : { similar: closest }
}

/**
 * One-line note for a near-duplicate write, or undefined when there is none.
 * Kept beside {@link classifyWrite} so every caller words it the same way.
 */
export function similarWriteNote(similar) {
  if (similar === undefined) return undefined
  return (
    `Very similar to existing memory ${similar.record.id} ` +
    `(similarity ${similar.score.toFixed(2)}); if this corrects it, use memory_correct.`
  )
}
