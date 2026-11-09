#!/usr/bin/env node
/**
 * Compression must archive before deleting.
 *
 * Budget pressure is a hard cap, so compression has to drop records; the
 * dropped ones used to be deleted outright. Now they land in
 * `<store>-archive.jsonl` with `archivedAt` / `archiveReason`, and a failed
 * archive write aborts the deletion.
 */
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import assert from 'node:assert/strict'

const root = mkdtempSync(join(tmpdir(), 'ltm-archive-'))
const home = join(root, 'home')
mkdirSync(home, { recursive: true })
process.env.DSH_HOME = home

const { apply } = await import('../lib/host/ltm.js')
const { archivePathForFile } = await import('../lib/host/ltm/archive.js')

let passed = 0
const ok = (label, cond) => { assert.ok(cond, label); passed++; console.log('  ✓ ' + label) }
const noop = () => {}

const tools = new Map()
const ctx = {
  on: noop,
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

const dir = mkdtempSync(join(root, 'ws-'))
const file = join(dir, '.dsh/memory.jsonl')
apply(ctx, { workspaceFile: file, workspaceRoot: dir, charLimit: 100 })

const session = { id: 's1', header: { cwd: dir } }
const call = (name, args) => tools.get(name).execute(args, { agent: { session } })

try {
  ok('archive path derives from the store file', archivePathForFile(file) === join(dir, '.dsh/memory-archive.jsonl'))

  const a = 'Alpha constraint: keep the staging gate closed'      // 48 chars
  const b = 'Beta constraint: rotate the signing key monthly'      // 50
  const c = 'Gamma constraint: paginate every list endpoint'       // 48
  await call('memory_write', { content: a, scope: 'workspace' })
  await call('memory_write', { content: b, scope: 'workspace' })
  // Third write exceeds the 100-char budget and forces rule compression.
  const third = await call('memory_write', { content: c, scope: 'workspace' })
  ok('third write succeeds after compression', third.status === 'stored')

  const live = await call('memory_list', { scope: 'workspace', limit: 10 })
  const liveContents = live.results.map((r) => r.content)
  ok('coldest record left the live store', !liveContents.includes(a))
  ok('newer records survived', liveContents.includes(b) && liveContents.includes(c))

  const archiveFile = archivePathForFile(file)
  ok('archive file exists', existsSync(archiveFile))
  const archived = readFileSync(archiveFile, 'utf8').trim().split('\n').map((line) => JSON.parse(line))
  ok('archive contains the dropped record', archived.some((r) => r.content === a))
  ok('archive records why and when', archived.every((r) => typeof r.archivedAt === 'number' && r.archiveReason === 'budget'))

  console.log(`\n${passed} 项通过 · compression archive`)
} finally {
  rmSync(root, { recursive: true, force: true })
}
