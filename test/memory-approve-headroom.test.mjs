#!/usr/bin/env node
/**
 * Approving a pending write when the store is at its character cap.
 *
 * A corrected record is invisible to recall but still counts toward
 * `charLimit`, so a heavily-corrected scope can sit at the cap with little live
 * content. Before this fix, approving a pending item in that state failed with
 * "adding this entry would exceed the limit" and the panel showed it as a load
 * failure. Approval now archives superseded records first and retries.
 */
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import assert from 'node:assert/strict'

const root = mkdtempSync(join(tmpdir(), 'ltm-approve-headroom-'))
const home = join(root, 'home')
const dir = join(root, 'ws')
mkdirSync(home, { recursive: true })
mkdirSync(join(dir, '.dsh'), { recursive: true })
process.env.DSH_HOME = home

const file = join(dir, '.dsh/memory.jsonl')
const now = Date.now()
const record = (id, content, superseded) => JSON.stringify({
  id, scope: 'workspace', content, tags: [],
  createdAt: now - 60_000, updatedAt: now - 60_000, hits: 0, superseded,
})
writeFileSync(file, [
  record('r-superseded', 'S'.repeat(80), true),
  record('r-live', 'L'.repeat(40), false),
].join('\n') + '\n', 'utf8')

const { apply } = await import('../lib/host/ltm.js')

let passed = 0
const ok = (label, cond) => { assert.ok(cond, label); passed++; console.log('  ✓ ' + label) }
const noop = () => {}

const routes = new Map()
const tools = new Map()
const ctx = {
  on: noop,
  effect: (fn) => { const dispose = fn(); return typeof dispose === 'function' ? dispose : noop },
  tools: { register: (def) => { tools.set(def.name, def); return noop } },
  commands: { register: noop },
  systemPrompt: { section: noop, add: noop, context: noop },
  agents: { currentInitiator: () => ({ session: { id: 's1', header: { cwd: dir } } }) },
  settings: { register: () => ({ get: () => ({}), update: async () => {} }) },
  logger: { warn: noop, info: noop, debug: noop, error: noop },
  inject: noop,
  get: (name) => (name === 'webServer' ? { register: (r) => { routes.set(r.path, r); return noop } } : undefined),
}

apply(ctx, {
  workspaceFile: file,
  workspaceRoot: dir,
  charLimit: 150,
  requireApprovalForWrite: true,
  semanticDedupThreshold: 0,
})

const session = { id: 's1', header: { cwd: dir } }
const invoke = async (path, { method = 'GET', body } = {}) => {
  const route = routes.get(path)
  assert.ok(route, `route ${path} must be registered`)
  const req = {
    method,
    url: path,
    async *[Symbol.asyncIterator]() { if (body !== undefined) yield JSON.stringify(body) },
  }
  let status = 0
  let raw = ''
  const res = { writeHead: (code) => { status = code }, end: (chunk) => { raw += chunk ?? '' } }
  await route.handler(req, res)
  return { status, json: raw === '' ? undefined : JSON.parse(raw) }
}

try {
  const pending = await tools.get('memory_write').execute(
    { content: 'P'.repeat(50), scope: 'workspace' },
    { agent: { session } }
  )
  ok('write is queued (store at cap + approval on)', pending.status === 'pending')

  const approved = await invoke('/api/memory/pending', { method: 'POST', body: { id: pending.id, action: 'approve' } })
  ok('approval succeeds instead of failing on the cap', approved.status === 200 && approved.json.ok === true)
  ok('the approved record is the one stored', approved.json.result?.record?.content === 'P'.repeat(50))

  const live = readFileSync(file, 'utf8').trim().split('\n').filter(Boolean).map((line) => JSON.parse(line))
  ok('superseded record left the live store', !live.some((r) => r.id === 'r-superseded'))
  ok('live record and the approved one remain', live.some((r) => r.id === 'r-live') && live.some((r) => r.content === 'P'.repeat(50)))

  const archiveFile = join(dir, '.dsh/memory-archive.jsonl')
  ok('superseded record was archived', existsSync(archiveFile) && readFileSync(archiveFile, 'utf8').includes('r-superseded'))
  const archived = readFileSync(archiveFile, 'utf8').trim().split('\n').map((l) => JSON.parse(l))
  ok('archive records the cleanup reason', archived.every((r) => r.archiveReason === 'superseded_cleanup'))

  const usage = live.reduce((sum, r) => sum + (r.content?.length ?? 0), 0)
  ok('store is back under the cap', usage <= 150)

  console.log(`\n${passed} 项通过 · approval headroom`)
} finally {
  rmSync(root, { recursive: true, force: true })
}
