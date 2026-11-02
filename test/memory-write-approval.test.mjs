#!/usr/bin/env node
/**
 * Regression test for the write-approval path (the "approval card pops twice" fix).
 *
 * What this pins down:
 *   - with requireApprovalForWrite ON, `memory_write` does NOT commit and does
 *     NOT go through the Host approval popup: it returns `status: 'pending'`
 *     and queues the record in the panel's pending list (one confirmation
 *     surface instead of a card the client could render twice);
 *   - the `tools/pre-execute` gate still asks for `memory_forget` only, and
 *     passes `memory_write` straight through;
 *   - approving the queued item commits it with its original scope AND tier
 *     (a queued resident record must not silently become index).
 *
 * Runs with no real DSH services: tools.register / webServer.register capture
 * the definitions and routes, ctx.on captures the gate listener.
 */
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import assert from 'node:assert/strict'

const root = mkdtempSync(join(tmpdir(), 'ltm-write-approval-'))
const workspace = join(root, 'workspace')
const home = join(root, 'home')
mkdirSync(workspace, { recursive: true })
mkdirSync(home, { recursive: true })
process.env.DSH_HOME = home

const mod = await import('../lib/host/ltm.js')

const tools = new Map()
const routes = {}
const listeners = {}
const noop = () => {}
const ctx = {
  on: (event, fn) => { listeners[event] = fn; return () => {} },
  effect: (fn) => { try { return fn() } catch { return undefined } },
  tools: { register: (def) => { tools.set(def.name, def); return () => {} } },
  commands: { register: noop },
  systemPrompt: { section: noop, add: noop, context: noop },
  workspaceRegistry: undefined,
  agents: { currentInitiator: () => ({ session }) },
  settings: { register: () => ({ get: () => ({}), update: async () => {} }) },
  logger: { warn: noop, info: noop, debug: noop, error: noop },
  inject: noop,
  get: (key) => (key === 'webServer'
    ? { register: ({ path, handler }) => { routes[path] = handler } }
    : undefined),
}

const session = { id: 's1', header: { cwd: workspace }, events: [] }
const agent = { id: 'a1', session }
const exec = { agent }

mod.apply(ctx, {
  requireApprovalForWrite: true,
  autoSummarize: false,
  autoApproveAfterMs: 0, // manual approve/reject only
})

function makeRes() {
  let status = 0
  let body = ''
  return {
    writeHead: (s) => { status = s },
    end: (b) => { body = b },
    get status() { return status },
    get json() { return JSON.parse(body) },
  }
}
const get = async (path, query = '') => {
  const res = makeRes()
  await routes[path]({ method: 'GET', url: path + query }, res)
  return res
}
const post = async (path, payload) => {
  const res = makeRes()
  const req = {
    method: 'POST',
    url: path,
    [Symbol.asyncIterator]: async function* () { yield JSON.stringify(payload) },
  }
  await routes[path](req, res)
  return res
}
const call = (name, args, callExec = exec) => {
  const tool = tools.get(name)
  assert.ok(tool, `tool ${name} must be registered`)
  return tool.execute(args, callExec)
}

let passed = 0
const ok = (label, cond) => { assert.ok(cond, label); passed++; console.log('  ✓ ' + label) }

try {
  // 1. The gate exists and only covers destructive deletes.
  const gate = listeners['tools/pre-execute']
  ok('pre-execute gate registered', typeof gate === 'function')

  let writeContinued = false
  const writeGate = gate({ name: 'memory_write', arguments: {}, agent }, () => {
    writeContinued = true
    return { kind: 'allow' }
  })
  ok('gate passes memory_write through (no approval popup)', writeContinued && writeGate?.kind === 'allow')

  const forgetGate = gate({ name: 'memory_forget', arguments: { id: 'x' }, agent }, () => ({ kind: 'allow' }))
  ok('gate still asks for memory_forget', forgetGate?.kind === 'ask' && /delete/i.test(forgetGate.reason ?? ''))

  // 2. A write under approval is queued, not stored.
  const content = '写入审批测试：这条应当先进待确认队列'
  const queued = await call('memory_write', { content, scope: 'workspace', tags: ['approval'], tier: 'resident' })
  ok('write returns status=pending', queued.status === 'pending')
  ok('write returns the pending id', typeof queued.id === 'string' && queued.id.startsWith('p_'))
  ok('write echoes tier=resident', queued.tier === 'resident')

  const listBefore = await get('/api/memory/list', '?scope=workspace')
  ok('store stays empty before approval', listBefore.json.results.length === 0)

  const pendingBefore = await get('/api/memory/pending')
  ok('pending queue holds the write', pendingBefore.json.items.length === 1)
  const item = pendingBefore.json.items[0]
  ok('pending item keeps the content', item.content === content)
  ok('pending item keeps the tier', item.tier === 'resident')
  ok('pending item records its origin', item.origin === 'memory_write')

  // 3. Approving commits it with the original scope and tier.
  const approve = await post('/api/memory/pending', { id: item.id, action: 'approve' })
  ok('approve succeeds', approve.status === 200 && approve.json.ok === true)

  const listAfter = await get('/api/memory/list', '?scope=workspace')
  ok('approved write is committed', listAfter.json.results.length === 1)
  ok('committed record keeps tier=resident', listAfter.json.results[0].tier === 'resident')

  const pendingAfter = await get('/api/memory/pending')
  ok('pending queue is empty after approve', pendingAfter.json.items.length === 0)

  // 4. Rejecting removes the item without committing.
  const queuedAgain = await call('memory_write', { content: '写入审批测试：这条会被拒绝', scope: 'workspace' })
  const pendingReject = await get('/api/memory/pending')
  ok('second write queued', pendingReject.json.items.length === 1 && pendingReject.json.items[0].id === queuedAgain.id)
  const reject = await post('/api/memory/pending', { id: queuedAgain.id, action: 'reject' })
  ok('reject succeeds', reject.status === 200 && reject.json.ok === true)
  const listAfterReject = await get('/api/memory/list', '?scope=workspace')
  ok('rejected write never commits', listAfterReject.json.results.length === 1)
  const pendingAfterReject = await get('/api/memory/pending')
  ok('rejected write leaves the queue', pendingAfterReject.json.items.length === 0)

  // 5. Agentless calls cannot be approved by anyone → write straight through.
  const direct = await call('memory_write', { content: '无会话时直接写入', scope: 'global' }, { agent: undefined })
  ok('agentless write stores directly', direct.status === 'stored')

  console.log(`\nAll ${passed} memory-write-approval checks passed.`)
} finally {
  rmSync(root, { recursive: true, force: true })
}
