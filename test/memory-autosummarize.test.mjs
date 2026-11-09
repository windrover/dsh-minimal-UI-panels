#!/usr/bin/env node
/**
 * autoSummarize across DSH session-log shapes.
 *
 * Regression for the silent failure on DSH 0.2.1: `session.events` no longer
 * exists (only `snapshotEvents()`), and the event payload for `user/message`
 * is the message itself rather than `data.message`. Both mistakes made
 * `newUserText` return '' forever, and the empty log was swallowed as "nothing
 * to distill". These cases pin the accessor, the payload shape, and the
 * "human prompt only" filter (our own injected runtime-context snapshots must
 * never be distilled back into memory).
 *
 * Runs with no DSH services: the LLM is a stub generator, settings return
 * defaults, and DSH_HOME points at a temp directory.
 */
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import assert from 'node:assert/strict'

const root = mkdtempSync(join(tmpdir(), 'ltm-autosummarize-'))
const home = join(root, 'home')
mkdirSync(home, { recursive: true })
process.env.DSH_HOME = home

const { apply } = await import('../lib/host/ltm.js')
const { newUserText, userMessagesSince } = await import('../lib/host/automation.js')
const { readSessionEvents } = await import('../lib/host/ltm/shared.js')

let passed = 0
const ok = (label, cond) => { assert.ok(cond, label); passed++; console.log('  ✓ ' + label) }

/** Mount the plugin with a stub LLM and capture the agent/status listener. */
function mount(reply, config = { autoSummarize: true }) {
  const listeners = new Map()
  const seen = []
  const llm = {
    async *stream(request) {
      seen.push(request)
      yield { type: 'text-delta', text: reply }
    },
  }
  const noop = () => {}
  const ctx = {
    on: (event, handler) => { listeners.set(event, handler); return noop },
    effect: (fn) => { try { return fn() } catch { return undefined } },
    tools: { register: () => noop },
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
  return { listeners, seen }
}

/** Run one idle turn against a fake agent and await its maintenance task. */
async function runIdle(session) {
  const mounted = mount(JSON.stringify([{ scope: 'workspace', content: '蒸馏出的事实', tags: ['test'] }]))
  const handler = mounted.listeners.get('agent/status')
  assert.ok(typeof handler === 'function', 'agent/status listener must be registered')
  let task
  const agent = {
    id: 'a1',
    session,
    options: { provider: 'stub', model: 'stub' },
    runMaintenance: (fn) => { task = fn(new AbortController().signal); return task },
  }
  handler({ agent, status: 'idle' })
  assert.ok(task !== undefined, 'idle must schedule a maintenance task')
  await task
  return mounted
}

try {
  // 1. Pure helpers: both payload shapes and the human-only filter.
  const modern = { type: 'user/message', seq: 1, data: { role: 'user', source: { kind: 'user' }, content: [{ type: 'text', text: '现代格式' }] } }
  const injected = { type: 'user/message', seq: 2, data: { role: 'user', source: { kind: 'runtime-context', form: 'snapshot' }, content: [{ type: 'text', text: 'Current runtime context. …' }] } }
  const legacy = { type: 'user/message', seq: 3, data: { message: { role: 'user', content: [{ type: 'text', text: '旧格式' }] } } }
  ok('modern payload yields text', newUserText([modern], -1) === '现代格式')
  ok('legacy payload still yields text', newUserText([legacy], -1) === '旧格式')
  ok('injected runtime-context is not distilled', newUserText([injected], -1) === '')
  ok('only human messages are counted', userMessagesSince([modern, injected, legacy], -1).length === 2)

  // 2. readSessionEvents prefers snapshotEvents() and falls back to events.
  const both = { snapshotEvents: () => ['snap'], events: ['legacy'] }
  ok('snapshotEvents wins when present', readSessionEvents(both)[0] === 'snap')
  ok('legacy events fallback works', readSessionEvents({ events: ['legacy'] })[0] === 'legacy')
  ok('missing session degrades to empty', readSessionEvents(undefined).length === 0)

  // 3. End-to-end: a 0.2.x session (snapshotEvents, no events) distills a fact.
  const ws1 = mkdtempSync(join(root, 'ws1-'))
  const mounted = await runIdle({
    id: 's1',
    header: { cwd: ws1 },
    snapshotEvents: () => [modern, injected],
  })
  const file1 = join(ws1, '.dsh', 'memory.jsonl')
  ok('autoSummarize wrote a record on snapshotEvents-only session', existsSync(file1) && readFileSync(file1, 'utf8').includes('蒸馏出的事实'))
  const sent = mounted.seen.map((r) => r.messages?.[0]?.content?.[0]?.text ?? '').join('\n')
  ok('LLM saw the human prompt', sent.includes('现代格式'))
  ok('LLM did not see the injected snapshot', !sent.includes('Current runtime context'))

  // 4. End-to-end: legacy `events` (no snapshotEvents) keeps working.
  const ws2 = mkdtempSync(join(root, 'ws2-'))
  await runIdle({ id: 's2', header: { cwd: ws2 }, events: [legacy] })
  const file2 = join(ws2, '.dsh', 'memory.jsonl')
  ok('legacy events session still distills', existsSync(file2) && readFileSync(file2, 'utf8').includes('蒸馏出的事实'))

  // 5. A session with neither API must not throw.
  const ws3 = mkdtempSync(join(root, 'ws3-'))
  await runIdle({ id: 's3', header: { cwd: ws3 } })
  ok('no event API degrades without throwing', !existsSync(join(ws3, '.dsh', 'memory.jsonl')))

  console.log(`\n${passed} 项通过 · autoSummarize event shapes`)
} finally {
  rmSync(root, { recursive: true, force: true })
}
