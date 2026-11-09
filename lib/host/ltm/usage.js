/*
 * dsh-minimal-ui-panels — host/ltm 的本地用量记录。
 *
 * 目的只有一个：让「记忆到底有没有用」可回答。此前只有 memory_diagnose 的
 * 即时快照，看不到召回命中率、注入体积、写入去重情况，也看不到 autoSummarize
 * 上次到底跑没跑——P0 那种「静默不工作」正需要这类证据。
 *
 * 记录写到 $DSH_HOME/dsh-memory/usage.jsonl，一行一个事件：
 *   recall   { scopes, hits, topScore, ms }
 *   write    { scope, status: stored|existing|pending }
 *   inject   { chars, items }
 *   summarize{ ok, facts, error? }
 *
 * 永远是 best-effort：磁盘写失败、文件损坏、旧格式行都只影响统计，绝不影响
 * 召回或写入本身。文件超过 2 MB 轮转为 usage.jsonl.1。
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync, renameSync, statSync } from 'node:fs'
import { dirname } from 'node:path'
import { dshHomePath } from '@deepseek-ai/dsh-home-paths'

const MAX_BYTES = 2 * 1024 * 1024
const DAY_MS = 24 * 60 * 60 * 1000

export function usageFilePath() {
  return dshHomePath('dsh-memory', 'usage.jsonl')
}

/** Append one event. Never throws. */
export function recordUsage(event) {
  try {
    const file = usageFilePath()
    mkdirSync(dirname(file), { recursive: true })
    try {
      if (statSync(file).size > MAX_BYTES) renameSync(file, `${file}.1`)
    } catch { /* first write or rotation race: append will create it */ }
    appendFileSync(file, `${JSON.stringify({ ts: Date.now(), ...event })}\n`, 'utf8')
  } catch { /* telemetry must never break memory */ }
}

/**
 * Aggregate the log over the last `days`.
 *
 * @param opts.days - lookback window (default 7).
 * @param opts.now - injectable clock for tests.
 * @returns counters plus the last summarize outcome.
 */
export function summarizeUsage({ days = 7, now = Date.now() } = {}) {
  const since = now - Math.max(1, days) * DAY_MS
  const stats = {
    since,
    days,
    total: 0,
    recall: { count: 0, withHits: 0, totalHits: 0, avgTopScore: 0, avgMs: 0 },
    write: { stored: 0, existing: 0, pending: 0 },
    inject: { count: 0, totalChars: 0, avgChars: 0 },
    summarize: { count: 0, facts: 0, lastAt: 0, lastOk: undefined, lastError: undefined },
  }
  const file = usageFilePath()
  if (!existsSync(file)) return stats
  let text
  try {
    text = readFileSync(file, 'utf8')
  } catch {
    return stats
  }
  let scoreSum = 0
  let msSum = 0
  for (const line of text.split('\n')) {
    const trimmed = line.trim()
    if (trimmed.length === 0) continue
    let entry
    try {
      entry = JSON.parse(trimmed)
    } catch {
      continue // a torn/hand-edited line never poisons the stats
    }
    if (typeof entry?.ts !== 'number' || entry.ts < since) continue
    stats.total += 1
    switch (entry.event) {
      case 'recall':
        stats.recall.count += 1
        stats.recall.totalHits += Number(entry.hits ?? 0)
        if ((entry.hits ?? 0) > 0) stats.recall.withHits += 1
        scoreSum += Number(entry.topScore ?? 0)
        msSum += Number(entry.ms ?? 0)
        break
      case 'write':
        if (entry.status === 'stored' || entry.status === 'existing' || entry.status === 'pending') {
          stats.write[entry.status] += 1
        }
        break
      case 'inject':
        stats.inject.count += 1
        stats.inject.totalChars += Number(entry.chars ?? 0)
        break
      case 'summarize':
        stats.summarize.count += 1
        stats.summarize.facts += Number(entry.facts ?? 0)
        if ((entry.ts ?? 0) >= stats.summarize.lastAt) {
          stats.summarize.lastAt = entry.ts
          stats.summarize.lastOk = entry.ok === true
          stats.summarize.lastError = typeof entry.error === 'string' ? entry.error : undefined
        }
        break
      default:
        break
    }
  }
  if (stats.recall.count > 0) {
    stats.recall.avgTopScore = Number((scoreSum / stats.recall.count).toFixed(2))
    stats.recall.avgMs = Math.round(msSum / stats.recall.count)
  }
  if (stats.inject.count > 0) {
    stats.inject.avgChars = Math.round(stats.inject.totalChars / stats.inject.count)
  }
  return stats
}

/** Human-readable summary for /memory stats and memory_diagnose. */
export function formatUsageSummary(stats, { label = 'last 7 days' } = {}) {
  if (stats === undefined || stats.total === 0) return `Usage (${label}): no events recorded yet.`
  const lines = [`Usage (${label}, ${stats.total} events):`]
  if (stats.recall.count > 0) {
    const hitRate = Math.round((stats.recall.withHits / stats.recall.count) * 100)
    lines.push(
      `- recall: ${stats.recall.count} call(s), ${stats.recall.withHits} with hits (${hitRate}%), ` +
      `avg top score ${stats.recall.avgTopScore}, avg ${stats.recall.avgMs}ms`
    )
  }
  const writes = stats.write.stored + stats.write.existing + stats.write.pending
  if (writes > 0) {
    lines.push(`- write: ${stats.write.stored} stored / ${stats.write.existing} existing / ${stats.write.pending} pending`)
  }
  if (stats.summarize.count > 0) {
    const when = stats.summarize.lastAt > 0 ? new Date(stats.summarize.lastAt).toISOString() : 'unknown'
    lines.push(
      `- summarize: ${stats.summarize.count} run(s), ${stats.summarize.facts} fact(s); ` +
      `last ${when} ${stats.summarize.lastOk === true ? 'ok' : stats.summarize.lastOk === false ? 'FAILED' : ''}` +
      (stats.summarize.lastError === undefined ? '' : ` — ${stats.summarize.lastError}`)
    )
  }
  if (stats.inject.count > 0) {
    lines.push(`- inject: ${stats.inject.count} assembly(s), avg ${stats.inject.avgChars} chars`)
  }
  return lines.join('\n')
}
