#!/usr/bin/env node
/**
 * Regression tests for self-hosted settings persistence (the fix for
 * "panel save shows no feedback + reverts to defaults on reopen").
 *
 * Root cause: this profile does NOT mount the DSH settings service, so
 * ctx.settings.register() throws and the plugin silently fell back to a
 * non-persistent cfg. POST /api/memory/settings returned 409 and nothing was
 * saved. Fix: the plugin now owns $DSH_HOME/dsh-memory/settings.json and
 * persists toggles there, surviving a restart.
 *
 * Runs with NO real DSH — a mock ctx whose `settings` is UNDEFINED (mirroring
 * the real profile), so memorySettings stays undefined and the file path is used.
 */
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import assert from 'node:assert/strict'

// Isolate DSH_HOME so the test never reads/writes the real
// ~/.dsh/dsh-memory/settings.json. The plugin resolves its settings path from
// DSH_HOME, which on macOS ignores $HOME, so $HOME alone cannot sandbox it.
// Without this, a pre-existing real settings file leaks into the "default GET"
// assertion and the test fails on any machine that has actually run the plugin.
const dir = mkdtempSync(join(tmpdir(), 'ltm-settings-'))
process.env.DSH_HOME = dir

const mod = await import('../lib/host/ltm.js')
const routes = {}
let postBody = null
const ctx = {
  on: () => {},
  effect: (fn) => { try { return fn() } catch { return undefined } },
  tools: { register: () => {} },
  commands: { register: () => {} },
  systemPrompt: { section: () => {}, add: () => {}, context: () => {} },
  workspaceRegistry: undefined,
  agents: { currentInitiator: () => ({ session: { id: 's1', header: { cwd: dir } } }) },
  // Deliberately NO settings service — mirrors the real profile where the 409 happened.
  get: (k) => (k === 'webServer' ? {
    register: ({ path, handler }) => { routes[path] = handler },
  } : undefined),
  set: () => {},
  logger: { warn: () => {}, info: () => {}, debug: () => {}, error: () => {} },
}
const cfg = {
  userFile: join(dir, 'user.jsonl'),
  globalFile: join(dir, 'global.jsonl'),
  workspaceFile: join(dir, '.dsh/memory.jsonl'),
  workspaceRoot: dir,
}
mod.apply(ctx, cfg)

function makeRes() {
  let status = 0, body = ''
  return {
    writeHead: (s) => { status = s },
    end: (b) => { body = b },
    get status() { return status },
    get json() { return JSON.parse(body) },
  }
}
const postJson = async (path, obj) => {
  const res = makeRes()
  await routes[path]({ method: 'POST', url: path, [Symbol.asyncIterator]: async function* () { yield JSON.stringify(obj) } }, res)
  return res
}
const getJson = async (path) => {
  const res = makeRes()
  await routes[path]({ method: 'GET', url: path }, res)
  return res
}

let passed = 0
const ok = (name, cond) => { assert.ok(cond, name); passed++; console.log('  ✓ ' + name) }

// 1. Initial GET reflects defaults.
const before = (await getJson('/api/memory/settings')).json
ok('GET returns semanticVectorRecall default false', before.semanticVectorRecall === false)

// 2. POST a toggle change — must NOT 409 (the old bug).
const post = await postJson('/api/memory/settings', { semanticVectorRecall: true, requireApprovalForWrite: false })
ok('POST settings does not 409 (service unmounted)', post.status !== 409)
ok('POST settings returns 200', post.status === 200)

// 3. The change is written to disk (source of truth).
const settingsFile = join(process.env.DSH_HOME ?? process.env.HOME ?? require('node:os').homedir(), 'dsh-memory', 'settings.json')
ok('settings file persisted to disk', existsSync(settingsFile))
const saved = JSON.parse(readFileSync(settingsFile, 'utf8'))
ok('persisted file has semanticVectorRecall=true', saved.semanticVectorRecall === true)

// 4. GET now reflects the change (read from the file-backed cfg).
const after = (await getJson('/api/memory/settings')).json
ok('GET reflects saved semanticVectorRecall=true', after.semanticVectorRecall === true)
ok('GET reflects saved requireApprovalForWrite=false', after.requireApprovalForWrite === false)

// 5. Simulate restart: a fresh apply() reads the file and keeps the value.
mod.apply(ctx, cfg)
const afterRestart = (await getJson('/api/memory/settings')).json
ok('value survives a fresh apply (restart)', afterRestart.semanticVectorRecall === true)

rmSync(dir, { recursive: true, force: true })
console.log(`\nSettings persistence: ${passed} assertions passed ✅`)
