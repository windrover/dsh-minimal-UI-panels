#!/usr/bin/env node
/**
 * Tool-level tests for the nine long-term-memory tools.
 *
 * The other memory tests drive subsystems (pending queue, settings, recall
 * internals); none of them calls a tool's execute() directly. That left the
 * tool layer — argument handling, scope resolution, dedup, forget — untested,
 * which is exactly the code that was hardest to reach while it lived inside a
 * 1532-line apply().
 *
 * Runs with no real DSH services: tools.register captures the definitions, the
 * workspace comes from the session's header.cwd, and DSH_HOME points at a temp
 * directory so the user/global stores are isolated.
 */
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import assert from 'node:assert/strict'

const root = mkdtempSync(join(tmpdir(), 'ltm-tools-'))
const workspace = join(root, 'workspace')
const home = join(root, 'home')
mkdirSync(workspace, { recursive: true })
mkdirSync(home, { recursive: true })
process.env.DSH_HOME = home

const mod = await import('../lib/host/ltm.js')

const tools = new Map()
const noop = () => {}
const ctx = {
  on: noop,
  effect: (fn) => { try { return fn() } catch { return undefined } },
  tools: { register: (def) => { tools.set(def.name, def); return () => {} } },
  commands: { register: noop },
  systemPrompt: { section: noop, add: noop, context: noop },
  workspaceRegistry: undefined,
  agents: { currentInitiator: () => ({ session: { id: 's1', header: { cwd: workspace } } }) },
  settings: { register: () => ({ get: () => ({}), update: async () => {} }) },
  logger: { warn: noop, info: noop, debug: noop, error: noop },
  inject: noop,
  get: () => undefined,
}

mod.apply(ctx, {})

const exec = { agent: { session: { id: 's1', header: { cwd: workspace } } } }
const call = (name, args) => {
  const tool = tools.get(name)
  assert.ok(tool, `tool ${name} must be registered`)
  return tool.execute(args, exec)
}

let passed = 0
const ok = (label, cond) => { assert.ok(cond, label); passed++; console.log('  ✓ ' + label) }

try {
  // 1. All nine tools are registered.
  const expected = ['memory_write', 'memory_correct', 'memory_recall', 'memory_list',
    'memory_forget', 'memory_export', 'memory_import', 'memory_batch', 'memory_diagnose']
  for (const name of expected) ok(`${name} registered`, tools.has(name))

  // 2. Write → the record comes back with an id and the resolved scope.
  const content = '工具层测试：这一条应当出现在 workspace 记忆里'
  const written = await call('memory_write', { content, scope: 'workspace', tags: ['test'] })
  ok('write returns an id', typeof written.id === 'string' && written.id.length > 0)
  ok('write resolves scope=workspace', written.scope === 'workspace')
  ok('write echoes the content', written.content === content)

  // 3. List sees it.
  const listed = await call('memory_list', { scope: 'workspace', limit: 5 })
  const listContents = JSON.stringify(listed)
  ok('list contains the written record', listContents.includes(content))

  // 4. Recall (BM25 path, no LLM) finds it.
  const recalled = await call('memory_recall', { query: '工具层测试', scope: 'workspace', limit: 5 })
  ok('recall finds the record', JSON.stringify(recalled).includes(written.id))

  // 5. Forgetting it removes it from the list.
  const forgot = await call('memory_forget', { id: written.id })
  ok('forget reports deleted', forgot.deleted === true)
  const after = await call('memory_list', { scope: 'workspace', limit: 5 })
  ok('forget removed it from the list', !JSON.stringify(after).includes(content))

  // 6. A blank write is rejected rather than storing an empty record.
  let blankFailed = false
  try { await call('memory_write', { content: '   ', scope: 'workspace' }) } catch { blankFailed = true }
  const blankOutcome = blankFailed ? true : false
  ok('blank content is rejected', blankOutcome)

  // 7. memory_diagnose reports per-scope usage without touching the network.
  const diagnose = JSON.stringify(await call('memory_diagnose', {}))
  ok('diagnose reports the workspace scope', diagnose.includes('workspace'))

  console.log(`\n${passed} 项通过 · tool layer`)
} finally {
  rmSync(root, { recursive: true, force: true })
}
