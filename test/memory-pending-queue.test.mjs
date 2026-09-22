#!/usr/bin/env node
/**
 * Regression tests for the Stage C pending queue (host side):
 *   - when requireApprovalForWrite is ON, autoSummarize-distilled facts are held
 *     in /api/memory/pending instead of being committed directly;
 *   - GET /api/memory/pending lists them; POST {id, action:'approve'} commits
 *     (with dedup) into the store; action:'reject' removes it.
 *
 * Runs with NO real DSH / LLM — the LLM is a stub whose `stream` yields a JSON
 * array of facts; the webServer is a mock that captures route handlers so we can
 * call /api/memory/pending directly. agent/status(idle) is fired manually to
 * trigger autoSummarize.
 */
import { mkdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import assert from 'node:assert/strict'

const mod = await import('../lib/host/ltm.js')

const routes = {}
const listeners = {}
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
const noop = () => {}

const dir = join(tmpdir(), 'ltm-pending-' + Date.now())
mkdirSync(dir, { recursive: true })

// Stub LLM: stream yields a JSON array of one fact derived from the user text,
// so each distinct conversation produces a distinct (non-duplicate) fact.
const stubLlm = {
  stream: async function* ({ messages }) {
    const userText = messages?.[0]?.content?.[0]?.text ?? ''
    const content = `蒸馏自「${userText}」的事实`
    const text = JSON.stringify([{ scope: 'global', content, tags: ['preference'] }])
    for (const ch of text) yield { type: 'text-delta', text: ch }
  },
}

const ctx = {
  on: (evt, fn) => { listeners[evt] = fn },
  effect: (fn) => { try { return fn() } catch { return undefined } },
  tools: { register: noop },
  commands: { register: noop },
  systemPrompt: { section: noop, add: noop, context: noop },
  workspaceRegistry: undefined,
  agents: { currentInitiator: () => ({ session: { id: 's1', header: { cwd: dir } } }) },
  settings: { register: () => ({ get: () => ({}), update: async () => {} }) },
  logger: { warn: noop, info: noop, debug: noop, error: noop },
  inject: noop,
  get: (k) => (k === 'webServer' ? {
    register: ({ path, handler }) => { routes[path] = handler },
  } : k === 'llm' ? stubLlm : undefined),
  set: noop,
}

mod.apply(ctx, {
  userFile: join(dir, 'user.jsonl'),
  globalFile: join(dir, 'global.jsonl'),
  workspaceFile: join(dir, '.dsh/memory.jsonl'),
  workspaceRoot: dir,
  requireApprovalForWrite: true,
  autoSummarize: true,
  autoApproveAfterMs: 0, // 关闭自动放行，纯手动验证
  summarizeIntervalMs: 0,
  summarizeMinMessages: 0,
})

const session = { id: 's1', header: { cwd: dir }, events: [
  { type: 'user/message', seq: 1, data: { message: { content: [{ type: 'text', text: '我喜欢用中文' }] } } },
] }
let maintPromise = null
const agent = {
  id: 'a1',
  session,
  options: { provider: 'stub', model: 'stub' },
  // 真实 DSH 的 runMaintenance 会在空闲维护里 await 回调完成；这里捕获 promise
  // 以便测试中等待自动蒸馏（入队）真正落盘。
  runMaintenance: async (fn) => { maintPromise = fn(new AbortController().signal); return maintPromise },
}
const flushMaint = async () => { if (maintPromise) await maintPromise }

// 1. 触发 autoSummarize：fire agent/status idle。
assert.ok(typeof listeners['agent/status'] === 'function', 'agent/status listener registered')
await listeners['agent/status']({ agent, status: 'idle' })
await flushMaint() // 等待空闲维护（自动蒸馏入队）完成

// 2. GET pending：应含 1 条"用户偏好用纯中文沟通"，且尚未落库。
const resPending = makeRes()
await routes['/api/memory/pending']({ method: 'GET', url: '/api/memory/pending' }, resPending)
assert.equal(resPending.status, 200)
assert.equal(resPending.json.items.length, 1, 'one pending item after summarize')
assert.ok(resPending.json.items[0].content.includes('我喜欢用中文'), 'pending holds the distilled fact')
assert.equal(resPending.json.items[0].scope, 'global')
console.log('ok  autoSummarize under approval gate → fact held in pending (1 item), not committed')

// 3. 尚未落库：list global 应为空。
const resList = makeRes()
await routes['/api/memory/list']({ method: 'GET', url: '/api/memory/list?scope=global' }, resList)
assert.equal(resList.json.results.length, 0, 'nothing committed yet')
console.log('ok  committed store still empty before approval')

// 4. 批准该 pending 项 → 落库。
const id = resPending.json.items[0].id
const resApprove = makeRes()
const approveReq = { method: 'POST', url: '/api/memory/pending', [Symbol.asyncIterator]: async function* () { yield JSON.stringify({ id, action: 'approve' }) } }
await routes['/api/memory/pending'](approveReq, resApprove)
assert.equal(resApprove.status, 200, 'approve ok')
assert.equal(resApprove.json.ok, true)

// 5. 现在已落库，pending 清空。
const resList2 = makeRes()
await routes['/api/memory/list']({ method: 'GET', url: '/api/memory/list?scope=global' }, resList2)
assert.equal(resList2.json.results.length, 1, 'committed after approve')
const resPending2 = makeRes()
await routes['/api/memory/pending']({ method: 'GET', url: '/api/memory/pending' }, resPending2)
assert.equal(resPending2.json.items.length, 0, 'pending cleared after approve')
console.log('ok  POST approve commits the fact and clears the queue')

// 6. reject 路径：先再造一条 pending，再拒绝它应被移除且不落库。
await listeners['agent/status']({ agent, status: 'idle' }) // 同文本会被精确去重跳过，故改内容
await flushMaint()
// 改 session 内容以蒸馏出不同事实
agent.session.events.push({ type: 'user/message', seq: 2, data: { message: { content: [{ type: 'text', text: '我住在北京' }] } } })
await listeners['agent/status']({ agent, status: 'idle' })
await flushMaint()
const resP3 = makeRes()
await routes['/api/memory/pending']({ method: 'GET', url: '/api/memory/pending' }, resP3)
assert.ok(resP3.json.items.length >= 1, 'a new pending item exists')
const rejectId = resP3.json.items[resP3.json.items.length - 1].id
const resReject = makeRes()
const rejectReq = { method: 'POST', url: '/api/memory/pending', [Symbol.asyncIterator]: async function* () { yield JSON.stringify({ id: rejectId, action: 'reject' }) } }
await routes['/api/memory/pending'](rejectReq, resReject)
assert.equal(resReject.status, 200, 'reject ok')
const resP4 = makeRes()
await routes['/api/memory/pending']({ method: 'GET', url: '/api/memory/pending' }, resP4)
assert.ok(!resP4.json.items.some((it) => it.id === rejectId), 'rejected item removed')
const resList3 = makeRes()
await routes['/api/memory/list']({ method: 'GET', url: '/api/memory/list?scope=global' }, resList3)
assert.equal(resList3.json.results.length, 1, 'rejected item did NOT commit')
console.log('ok  POST reject removes the item and does not commit')

console.log('All memory-pending-queue tests passed.')
rmSync(dir, { recursive: true, force: true })
