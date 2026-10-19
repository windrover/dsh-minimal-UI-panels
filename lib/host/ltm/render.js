/*
 * dsh-minimal-ui-panels — host/ltm 的记录渲染。
 *
 * 只做「把 store 里的记录变成一段有预算上限的文本」，不持状态、不碰 IO。
 * 与 shared.js 的区别：它需要威胁扫描与标签过滤，所以那两个依赖是显式 import；
 * shared.js 则刻意保持零本地依赖。
 */
import { describeRecord } from './shared.js'
import { scanThreats } from '../threats.js'
import { filterByTags } from '../automation.js'

/**
 * Render one scope's digest for the per-assembly context contribution. DSH's prompt assembler evaluates `text` functions
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
export function recentDigestSync(store, maxChars, split, mode = 'recent', injectTags) {
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
