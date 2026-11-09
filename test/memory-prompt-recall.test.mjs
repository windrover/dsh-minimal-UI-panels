#!/usr/bin/env node
/**
 * Opt-in per-prompt recall (`promptRecall`).
 *
 * The default injection is a digest of the most recent memories, which has no
 * idea what the current prompt is about. This experiment appends the top local
 * BM25 hits for the prompt as a `form: 'recall'` user message. It must:
 *   - be inert unless the switch is on;
 *   - not duplicate a block the history already carries (fork/restart safe);
 *   - stay silent when nothing matches;
 *   - never throw into the pre-step waterfall.
 */
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import assert from 'node:assert/strict'

const root = mkdtempSync(join(tmpdir(), 'ltm-prompt-recall-'))
const home = join(root, 'home')
mkdirSync(home, { recursive: true })
process.env.DSH_HOME = home

const { apply } = await import('../lib/host/ltm.js')

let passed = 0
const ok = (label, cond) => { assert.ok(cond, label); passed++; console.log('  ✓ ' + label) }
const noop = () => {}

function mount({ promptRecall, workspaceFile }) {
  const tools = new Map()
  const listeners = new Map()
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
    get: () => undefined,
  }
  apply(ctx, { workspaceFile, workspaceRoot: join(root, 'ws'), promptRecall })
  return { tools, listeners }
}

const userMessage = (text, id = 'm1') => ({
  id,
  role: 'user',
  source: { kind: 'user' },
  content: [{ type: 'text', text }],
})
const nextEnter = (messages) => async () => ({ kind: 'enter', messages })

try {
  const dir = mkdtempSync(join(root, 'ws-'))
  const file = join(dir, '.dsh/memory.jsonl')
  const mounted = mount({ promptRecall: true, workspaceFile: file })
  const session = { id: 's1', header: { cwd: dir }, snapshotEvents: () => sessionEvents }
  const sessionEvents = []
  const exec = { agent: { session } }
  await mounted.tools.get('memory_write').execute(
    { content: 'The staging gate blocks deploys until approval', scope: 'workspace' },
    exec
  )

  const preStep = mounted.listeners.get('agent/pre-step')
  ok('pre-step listener registered', typeof preStep === 'function')

  const payload = { agent: { session }, signal: new AbortController().signal }
  const first = await preStep(payload, nextEnter([userMessage('why did the staging gate block my deploy?')]))
  ok('decision stays enter', first.kind === 'enter')
  ok('recall block appended', first.messages.length === 2)
  const injected = first.messages[1]
  ok('injected message is user role', injected.role === 'user')
  ok('injected message carries form=recall', injected.source.kind === 'plugin:long-term-memory' && injected.source.form === 'recall')
  const text = injected.content[0].text
  ok('block quotes the relevant memory', text.includes('staging gate') && text.includes('Recall from long-term memory'))

  // The real host persists the message; simulate that before the next step.
  sessionEvents.push({ type: 'user/message', seq: 0, data: injected })
  const again = await preStep(payload, nextEnter([userMessage('and the staging gate now?', 'm2')]))
  ok('identical block is not appended twice', again.messages.length === 1)

  // No lexical match → no block.
  const unmatched = await preStep(payload, nextEnter([userMessage('what is the weather today?', 'm3')]))
  ok('no match appends nothing', unmatched.messages.length === 1)

  // Off by default: a fresh mount without the switch is inert.
  const offDir = mkdtempSync(join(root, 'ws-off-'))
  const off = mount({ promptRecall: false, workspaceFile: join(offDir, '.dsh/memory.jsonl') })
  await off.tools.get('memory_write').execute(
    { content: 'The staging gate blocks deploys until approval', scope: 'workspace' },
    { agent: { session: { id: 's2', header: { cwd: offDir } } } }
  )
  const offSession = { id: 's2', header: { cwd: offDir }, snapshotEvents: () => [] }
  const offDecision = await off.listeners.get('agent/pre-step')(
    { agent: { session: offSession }, signal: new AbortController().signal },
    nextEnter([userMessage('staging gate?')])
  )
  ok('switch off leaves the decision untouched', offDecision.messages.length === 1)

  // A throwing listener degrades to the untouched decision.
  const broken = await mounted.listeners.get('agent/pre-step')(
    { agent: { session: { id: 's3', header: { cwd: dir }, snapshotEvents: () => { throw new Error('boom') } } }, signal: new AbortController().signal },
    nextEnter([userMessage('staging gate?')])
  )
  ok('accessor failure does not throw into the waterfall', broken.kind === 'enter')

  console.log(`\n${passed} 项通过 · prompt recall`)
} finally {
  rmSync(root, { recursive: true, force: true })
}
