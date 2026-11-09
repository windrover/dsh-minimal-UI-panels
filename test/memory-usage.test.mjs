#!/usr/bin/env node
/**
 * Usage telemetry: events are recorded, aggregated over a window, surfaced by
 * /memory stats and memory_diagnose, and corrupt/old lines never break stats.
 */
import { appendFileSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import assert from 'node:assert/strict'

const root = mkdtempSync(join(tmpdir(), 'ltm-usage-'))
const home = join(root, 'home')
mkdirSync(home, { recursive: true })
process.env.DSH_HOME = home

const { apply } = await import('../lib/host/ltm.js')
const { recordUsage, summarizeUsage, usageFilePath } = await import('../lib/host/ltm/usage.js')

let passed = 0
const ok = (label, cond) => { assert.ok(cond, label); passed++; console.log('  ✓ ' + label) }
const noop = () => {}

try {
  // 1. Aggregation over a window.
  const now = Date.now()
  recordUsage({ event: 'recall', hits: 2, topScore: 2, ms: 4 })
  recordUsage({ event: 'recall', hits: 0, topScore: 0, ms: 2 })
  recordUsage({ event: 'write', scope: 'workspace', status: 'stored' })
  recordUsage({ event: 'write', scope: 'workspace', status: 'existing' })
  recordUsage({ event: 'write', scope: 'workspace', status: 'pending' })
  recordUsage({ event: 'inject', chars: 1200, items: 5 })
  recordUsage({ event: 'summarize', ok: true, facts: 3 })
  const stats = summarizeUsage({ days: 7, now })
  ok('counts recall calls', stats.recall.count === 2)
  ok('counts recall hits', stats.recall.withHits === 1 && stats.recall.totalHits === 2)
  ok('averages top score', stats.recall.avgTopScore === 1)
  ok('counts write statuses', stats.write.stored === 1 && stats.write.existing === 1 && stats.write.pending === 1)
  ok('averages injected chars', stats.inject.avgChars === 1200)
  ok('records last summarize outcome', stats.summarize.count === 1 && stats.summarize.lastOk === true && stats.summarize.facts === 3)

  // 2. Window and corruption tolerance.
  appendFileSync(usageFilePath(), 'not-json\n', 'utf8')
  appendFileSync(usageFilePath(), JSON.stringify({ ts: now - 30 * 86400_000, event: 'recall', hits: 99 }) + '\n', 'utf8')
  const recent = summarizeUsage({ days: 7, now })
  ok('old events are outside the window', recent.recall.count === 2)
  ok('a malformed line does not poison stats', recent.total === 7)

  // 3. The tools record events; /memory stats and diagnose surface them.
  const tools = new Map()
  const commands = new Map()
  const ctx = {
    on: noop,
    effect: (fn) => { try { return fn() } catch { return undefined } },
    tools: { register: (def) => { tools.set(def.name, def); return noop } },
    commands: { register: (def) => { commands.set(def.name, def); return noop } },
    systemPrompt: { section: noop, add: noop, context: noop },
    workspaceRegistry: undefined,
    agents: { currentInitiator: () => undefined },
    settings: { register: () => ({ get: () => ({}), update: async () => {} }) },
    logger: { warn: noop, info: noop, debug: noop, error: noop },
    inject: noop,
    get: () => undefined,
  }
  const dir = mkdtempSync(join(root, 'ws-'))
  apply(ctx, { workspaceFile: join(dir, '.dsh/memory.jsonl'), workspaceRoot: dir })
  const session = { id: 's1', header: { cwd: dir } }
  const exec = { agent: { session } }
  await tools.get('memory_write').execute({ content: 'Usage telemetry records recalls', scope: 'workspace' }, exec)
  await tools.get('memory_recall').execute({ query: 'telemetry', scope: 'workspace' }, exec)

  const diagnose = await tools.get('memory_diagnose').execute({}, exec)
  ok('diagnose prints a usage section', diagnose.report.includes('Usage (last 7 days'))
  ok('diagnose reports the recall', diagnose.report.includes('recall:') && diagnose.report.includes('call(s)'))

  const statsText = await commands.get('memory').handler({ agent: { session }, rawInput: 'stats' })
  ok('/memory stats succeeds', statsText.kind === 'success')
  ok('/memory stats shows writes', statsText.text.includes('write:') && statsText.text.includes('stored'))
  ok('/memory stats shows per-scope archive paths', statsText.text.includes('memory-archive.jsonl'))

  console.log(`\n${passed} 项通过 · usage stats`)
} finally {
  rmSync(root, { recursive: true, force: true })
}
