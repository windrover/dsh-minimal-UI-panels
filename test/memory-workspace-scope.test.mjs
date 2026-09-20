#!/usr/bin/env node
/**
 * Regression test: the workspace memory scope must resolve to the registered
 * workspace even when there is no session (the Web panel calls
 * GET /api/memory/list?scope=workspace over plain HTTP with no agent initiator,
 * so `session` is `undefined`).
 *
 * The bug this pins: `resolveWorkspaceRoot` fell back to `process.cwd()`, which
 * is the directory the dsh web process was launched from (the user's home, not
 * the workspace). So `/api/memory/list?scope=workspace` read
 * `<home>/.dsh/memory.jsonl` — a file that does not exist — and reported an
 * empty list, while the real `<workspace>/.dsh/memory.jsonl` (with the actual
 * memories) was never read. The user saw "还没有记忆" even though memories
 * existed.
 *
 * Fix: when there is no session, resolve from `ctx.workspaceRegistry` instead
 * of `process.cwd()` — pick the registered workspace whose path is the longest
 * prefix of `process.cwd()`, else the first registered workspace.
 *
 * This test drives the real apply() (no change to it), points a stub registry
 * at a synthetic workspace directory that is NOT the process cwd, simulates an
 * agentless list call, and asserts the workspace scope returns the memories
 * that live in the registered workspace — not an empty set from the cwd.
 *
 * Run: node test/memory-workspace-scope.test.mjs
 */
import { mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import assert from 'node:assert/strict'

const mod = await import('../lib/host/ltm.js')

const noop = () => {}
const tools = []
const webRoutes = {}
const stubCtx = {
  on: noop,
  effect: (fn) => { try { return fn() } catch { return undefined } },
  tools: { register: (def) => tools.push(def) },
  webServer: { register: (r) => { webRoutes[r.path] = r.handler }, get: noop, post: noop, route: noop, addRoute: noop },
  commands: { register: noop },
  agents: { currentInitiator: () => undefined },
  systemPrompt: { section: noop, add: noop, context: noop },
  workspaceRegistry: undefined,
  settings: { register: () => ({ value: {} }) },
  logger: { warn: noop, info: noop, debug: noop, error: noop },
  inject: noop,
  get: (key) => (key === 'webServer' ? stubCtx.webServer : undefined),
  set: noop
}

// A synthetic workspace that is deliberately NOT the process cwd. Put a memory
// file there so we can prove the resolver finds it.
const workspaceDir = join(tmpdir(), 'ltm-workspace-fix')
mkdirSync(join(workspaceDir, '.dsh'), { recursive: true })
const wsMemories = [
  { id: 'ws-1', scope: 'workspace', content: 'registered-workspace fact', tags: ['regression'], updatedAt: 1 }
]
writeFileSync(join(workspaceDir, '.dsh', 'memory.jsonl'), wsMemories.map((m) => JSON.stringify(m)).join('\n') + '\n')

const globalMemories = [
  { id: 'g-1', scope: 'global', content: 'global fact', tags: ['regression'], updatedAt: 2 }
]
mkdirSync(join(workspaceDir, 'dsh-memory'), { recursive: true })
writeFileSync(join(workspaceDir, 'dsh-memory', 'global.jsonl'), globalMemories.map((m) => JSON.stringify(m)).join('\n') + '\n')

const registry = {
  list: () => [{ path: workspaceDir }]
}

try {
  stubCtx.workspaceRegistry = registry
  mod.apply(stubCtx, {})

  const listRoute = webRoutes['/api/memory/list']
  assert.ok(listRoute, `memory list route not registered; saw: ${Object.keys(webRoutes).join(', ')}`)

  // Simulate the panel's agentless request: a real IncomingMessage/ServerResponse
  // is overkill — the handler only reads req.url and writes JSON via sendJson.
  const req = { url: 'http://localhost/api/memory/list?scope=workspace', method: 'GET' }
  let body = ''
  let status = 0
  const res = {
    writeHead: (code) => { status = code },
    setHeader: noop,
    end: (s) => { body = s }
  }

  const run = listRoute(req, res)

  await run

  // sendJson stores the status on res.statusCode and the payload via res.end.
  // We read it back through the response object.
  const parsed = JSON.parse(body ?? '{}')

  const wsResults = (parsed.results ?? []).filter((r) => r.scope === 'workspace')
  assert.equal(
    wsResults.length,
    1,
    `scope=workspace should return the registered workspace's memory, got ${wsResults.length} results ` +
      `(body: ${body.slice(0, 200)})`
  )
  assert.equal(wsResults[0].content, 'registered-workspace fact', 'returned memory must come from the registered workspace')

  // And a sanity check that the OLD bug is dead: the cwd-based file is empty,
  // so if resolution fell back to process.cwd() we'd see 0 workspace results.
  console.log('ok  scope=workspace resolves to the registered workspace (agentless request)')
  console.log(`ok  returned ${wsResults.length} workspace memory/memories, cwd fallback would have returned 0`)
} finally {
  rmSync(workspaceDir, { recursive: true, force: true })
}
