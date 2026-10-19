#!/usr/bin/env node
/**
 * Route-level test for the artifacts host routes.
 *
 * The existing artifacts tests pin the naming/scan helpers directly; none drives
 * the HTTP surface the browser half actually calls. This one mounts the real
 * apply() against a throwaway workspace and asserts what the routes answer:
 *
 *   POST /api/artifacts/scan         method guard, missing dir, scope check, scan
 *   GET  /api/artifacts/session-dir  method guard, missing cwd, scope check, naming
 *
 * Everything is local: a temp workspace, no network, no DSH services beyond the
 * two the routes read (workspaceRegistry for the allowed roots, webServer/effect
 * for registration).
 */
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, realpathSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { apply } from '../lib/host/artifacts.js'

const root = mkdtempSync(join(tmpdir(), 'artifacts-route-'))
const workspace = join(root, 'workspace')
const outside = join(root, 'outside')
mkdirSync(workspace, { recursive: true })
mkdirSync(join(workspace, 'notes'), { recursive: true })
mkdirSync(outside, { recursive: true })
writeFileSync(join(workspace, 'a.txt'), 'hello artifacts\n', 'utf8')
writeFileSync(join(join(workspace, 'notes'), 'b.md'), '# note\n', 'utf8')

// The routes canonicalize every path (macOS /var -> /private/var), so compare canonically.
const canonicalWorkspace = realpathSync(workspace)

const routes = new Map()
const tools = []
const ctx = {
  webServer: { register: (route) => { routes.set(route.path, route); return () => {} } },
  effect: (fn) => { const d = fn(); return typeof d === 'function' ? d : () => {} },
  tools: { register: (tool) => { tools.push(tool); return () => {} } },
  workspaceRegistry: { list: () => [{ path: workspace }] },
  // The panel also contributes a system-prompt section; only the call matters here.
  systemPrompt: { section: () => () => {} },
  get: () => undefined,
  logger: { info() {}, warn() {}, error() {}, debug() {} },
}

apply(ctx, {})

const call = async (path, { method = 'POST', url, body } = {}) => {
  const route = routes.get(path)
  assert.ok(route, `route ${path} must be registered`)
  // readJson() consumes the request with `for await (const chunk of req)`,
  // so the mock must be async-iterable rather than an EventEmitter.
  const req = {
    method,
    url: url ?? path,
    socket: { remoteAddress: '127.0.0.1' },
    headers: { host: '127.0.0.1' },
    async *[Symbol.asyncIterator]() {
      if (body !== undefined) yield Buffer.from(JSON.stringify(body))
    },
  }
  const res = {
    statusCode: 200,
    headers: {},
    setHeader(k, v) { this.headers[k.toLowerCase()] = v },
    writeHead(status, headers) { this.statusCode = status; Object.assign(this.headers, headers ?? {}) },
    end(payload) { this.body = payload },
    writableEnded: false,
  }
  await route.handler(req, res)
  return { status: res.statusCode, body: JSON.parse(res.body) }
}

try {
  // ---- POST /api/artifacts/scan -------------------------------------------
  assert.equal((await call('/api/artifacts/scan', { method: 'GET' })).status, 405, 'scan: GET must be 405')
  assert.equal((await call('/api/artifacts/scan', { body: {} })).status, 400, 'scan: missing dir must be 400')

  const scan = await call('/api/artifacts/scan', { body: { dir: workspace } })
  assert.equal(scan.status, 200, 'scan: happy path must be 200')
  assert.equal(scan.body.dir, canonicalWorkspace)
  // The scan walks subdirectories, so both files show up.
  const names = (scan.body.files ?? []).map((f) => f.name).sort()
  assert.deepEqual(names, ['a.txt', 'b.md'], `scan must walk the workspace, got ${JSON.stringify(names)}`)
  // dirs are absolute paths (strings), not descriptors.
  assert.ok((scan.body.dirs ?? []).some((d) => String(d).endsWith('/notes')), 'scan must list the subdirectory')

  // The browser sends an arbitrary path; the scope check must refuse it.
  const escaped = await call('/api/artifacts/scan', { body: { dir: outside } })
  assert.equal(escaped.status, 403, 'scan: a directory outside the registered workspaces must be 403')

  // ---- GET /api/artifacts/session-dir -------------------------------------
  assert.equal((await call('/api/artifacts/session-dir', { method: 'POST' })).status, 405, 'session-dir: POST must be 405')
  assert.equal((await call('/api/artifacts/session-dir', { method: 'GET', url: '/api/artifacts/session-dir' })).status, 400,
    'session-dir: missing cwd must be 400')

  const resolved = await call('/api/artifacts/session-dir', {
    method: 'GET',
    url: `/api/artifacts/session-dir?cwd=${encodeURIComponent(workspace)}&sessionId=abcd1234ef56`,
  })
  assert.equal(resolved.status, 200, 'session-dir: happy path must be 200')
  assert.equal(typeof resolved.body.dir, 'string', 'session-dir must answer a directory')
  assert.ok(resolved.body.dir.startsWith(join(canonicalWorkspace, 'sessions')),
    `session-dir must live under the workspace sessions/ folder, got ${resolved.body.dir}`)
  assert.ok(resolved.body.dir.includes('abcd1234'), 'the folder name must carry the session id prefix')
  assert.equal(resolved.body.exists, false, 'a not-yet-created session folder reports exists: false')

  const blocked = await call('/api/artifacts/session-dir', {
    method: 'GET',
    url: `/api/artifacts/session-dir?cwd=${encodeURIComponent(outside)}&sessionId=abcd1234ef56`,
  })
  assert.equal(blocked.status, 403, 'session-dir: outside the registered workspaces must be 403')

  assert.ok(tools.length >= 1, 'the artifacts_list tool must be registered')
  console.log(`✔ artifacts routes: ${routes.size} routes, ${tools.length} tool, scan + session-dir ok`)
} finally {
  rmSync(root, { recursive: true, force: true })
}
