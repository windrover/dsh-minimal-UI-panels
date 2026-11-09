#!/usr/bin/env node
/**
 * Write-time de-duplication across the paths that used to disagree.
 *
 * Coverage:
 *   1. memory_write twice with identical content → second returns
 *      status:'existing' and the store keeps one record;
 *   2. a near-duplicate write is stored but carries a `warning` naming the
 *      similar record (explicit writes are never silently dropped);
 *   3. the 7-day auto-flush path now de-duplicates too (it used to call
 *      store.put directly and bypass every check).
 *
 * Runs with no DSH services; the LLM is a stub, settings return defaults.
 */
import { appendFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import assert from 'node:assert/strict'

const root = mkdtempSync(join(tmpdir(), 'ltm-dedup-'))
const home = join(root, 'home')
mkdirSync(home, { recursive: true })
process.env.DSH_HOME = home

const { apply } = await import('../lib/host/ltm.js')

let passed = 0
const ok = (label, cond) => { assert.ok(cond, label); passed++; console.log('  ✓ ' + label) }
const noop = () => {}

/** Mount the plugin; returns the captured tools and event listeners. */
function mount(config, { reply = '[]' } = {}) {
  const tools = new Map()
  const listeners = new Map()
  const llm = {
    async *stream() {
      yield { type: 'text-delta', text: reply }
    },
  }
  const ctx = {
    on: (event, handler) => { listeners.set(event, handler); return noop },
    effect: (fn) => { try { return fn() } catch { return undefined } },
    tools: { register: (def) => { tools.set(def.name, def); return noop } },
    commands: { register: noop },
    systemPrompt: { section: noop, add: noop, context: noop },
    workspaceRegistry: undefined,
    agents: { currentInitiator: () => undefined },
    settings: { register: () => ({ get: () => ({}), update: async () => {} }) },
    logger: { warn: noop, info: noop, debug: noop, error: noop },
    inject: noop,
    get: (name) => (name === 'llm' ? llm : undefined),
  }
  apply(ctx, config)
  return { tools, listeners, ctx }
}

const call = (tools, name, args, session) => {
  const tool = tools.get(name)
  assert.ok(tool, `tool ${name} must be registered`)
  return tool.execute(args, { agent: { session } })
}

try {
  // ── 1 + 2: direct writes ────────────────────────────────────────────────
  const dir1 = mkdtempSync(join(root, 'w1-'))
  const session1 = { id: 's1', header: { cwd: dir1 } }
  const m1 = mount({
    workspaceFile: join(dir1, '.dsh/memory.jsonl'),
    workspaceRoot: dir1,
    semanticDedupThreshold: 0.5,
  })

  const first = await call(m1.tools, 'memory_write', { content: 'Deploys go through the staging gate', scope: 'workspace' }, session1)
  ok('first write is stored', first.status === 'stored')
  const second = await call(m1.tools, 'memory_write', { content: 'Deploys go through the staging gate', scope: 'workspace' }, session1)
  ok('identical write reports status=existing', second.status === 'existing')
  ok('existing write reuses the original id', second.id === first.id)
  let listed = await call(m1.tools, 'memory_list', { scope: 'workspace', limit: 10 }, session1)
  ok('identical content is stored once', listed.results.filter((r) => r.content === 'Deploys go through the staging gate').length === 1)

  // Near-duplicate: different fact, high token overlap.
  const near = await call(m1.tools, 'memory_write', { content: 'Deploys go through the staging gate at noon', scope: 'workspace' }, session1)
  ok('near-duplicate is still stored', near.status === 'stored')
  ok('near-duplicate carries a warning', typeof near.warning === 'string' && near.warning.includes('memory_correct'))
  listed = await call(m1.tools, 'memory_list', { scope: 'workspace', limit: 10 }, session1)
  ok('near-duplicate adds a second record', listed.results.length === 2)

  // ── 3: auto-flush path must de-duplicate ────────────────────────────────
  const dir2 = mkdtempSync(join(root, 'w2-'))
  const session2 = {
    id: 's2',
    header: { cwd: dir2 },
    snapshotEvents: () => [
      { type: 'user/message', seq: 0, data: { role: 'user', source: { kind: 'user' }, content: [{ type: 'text', text: '继续' }] } },
    ],
  }
  const m2 = mount({
    workspaceFile: join(dir2, '.dsh/memory.jsonl'),
    workspaceRoot: dir2,
    requireApprovalForWrite: true,
    autoSummarize: true,
    autoApproveAfterMs: 1,
    summarizeIntervalMs: 0,
    summarizeMinMessages: 1,
    semanticDedupThreshold: 0.5,
  })

  const p1 = await call(m2.tools, 'memory_write', { content: 'The retry policy allows 429', scope: 'workspace' }, session2)
  const p2 = await call(m2.tools, 'memory_write', { content: 'The retry policy allows 429', scope: 'workspace' }, session2)
  ok('approval mode queues the first write', p1.status === 'pending')
  ok('a duplicate pending write is not queued twice', p2.status === 'existing' && p2.id === p1.id)
  const pendingFile = join(dir2, '.dsh/memory-pending.jsonl')
  const pendingLines = readFileSync(pendingFile, 'utf8').trim().split('\n').filter(Boolean)
  ok('pending queue holds one item', pendingLines.length === 1)

  // Simulate a queue that already contains a duplicate (e.g. two sessions raced):
  // the auto-flush path must still leave one live record.
  appendFileSync(pendingFile, JSON.stringify({
    id: 'p_manual', scope: 'workspace', content: 'The retry policy allows 429',
    tags: [], tier: 'index', createdAt: Date.now() - 1000, sessionId: 's2',
  }) + '\n')
  await new Promise((resolve) => setTimeout(resolve, 5))
  const status = m2.listeners.get('agent/status')
  assert.ok(typeof status === 'function', 'agent/status must be registered')
  let task
  status({
    status: 'idle',
    agent: {
      id: 'a2',
      session: session2,
      options: { provider: 'stub', model: 'stub' },
      runMaintenance: (fn) => { task = fn(new AbortController().signal); return task },
    },
  })
  await task

  const afterFlush = await call(m2.tools, 'memory_list', { scope: 'workspace', limit: 10 }, session2)
  ok('auto-flush stores the queued record once', afterFlush.results.filter((r) => r.content === 'The retry policy allows 429').length === 1)
  ok('auto-flush drained the queue', !existsSync(pendingFile) || readFileSync(pendingFile, 'utf8').trim() === '')

  console.log(`\n${passed} 项通过 · write dedup`)
} finally {
  rmSync(root, { recursive: true, force: true })
}
