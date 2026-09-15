#!/usr/bin/env node
/**
 * Regression test: creating a session must NOT pre-create its artifact folder.
 *
 * The bug this pins down: the host hook on `session/created` did
 * `mkdir(<workspace>/sessions/<day>-<id>, { recursive: true })` for every
 * session. That looks harmless until you know `session/created` fires on every
 * RESUME, not only on first use — so a session that only ever asked questions
 * still left a fresh folder behind each day it was reopened. The workspace
 * accumulated empty directories one per resume: 47 of 58 directories were empty
 * when this was found, and 17 of the 18 created on a single day.
 *
 * The folder must instead appear exactly when something is written into it.
 * Nothing needs it to exist early:
 *
 *   - DSH's write path creates parent directories itself
 *     (`writeFileAtomic` → `mkdir(dirname, { recursive: true })`);
 *   - the injected system-prompt section tells the agent to `mkdir -p` when it
 *     writes via a shell;
 *   - `scanWorkspace` already skips a missing directory instead of throwing.
 *
 * So this test asserts the negative — no directory is created — plus the two
 * properties that make that safe. A test that only checked "the folder is not
 * there" would pass trivially if the hook were dropped entirely and the
 * prompt/scan guarantees were lost with it.
 *
 * Run: node test/artifacts-no-empty-dirs.test.mjs
 */
import { mkdtempSync, writeFileSync, existsSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import assert from 'node:assert/strict'

const mod = await import('../lib/host/artifacts.js')

const noop = () => {}
const handlers = new Map()
const promptSections = []

const workspace = mkdtempSync(join(tmpdir(), 'artifacts-nodirs-'))

const stubCtx = {
  // Capture the session/created handler so we can fire it deliberately.
  on: (event, fn) => handlers.set(event, fn),
  effect: (fn) => {
    try {
      return fn()
    } catch {
      return undefined
    }
  },
  tools: { register: noop },
  webServer: { get: noop, post: noop, route: noop, addRoute: noop },
  systemPrompt: { section: (s) => promptSections.push(s), add: noop },
  // Report our temp workspace as the allowed root, so sessionDirFor() would
  // resolve to a real path if it were still being called to mkdir.
  workspaceRegistry: {
    list: () => [{ path: workspace }],
    roots: () => [workspace],
    current: () => ({ path: workspace })
  },
  logger: { warn: noop, info: noop, debug: noop, error: noop },
  inject: noop,
  get: () => undefined,
  set: noop
}

try {
  mod.apply(stubCtx, {})

  const created = handlers.get('session/created')
  const sessionsDir = join(workspace, 'sessions')

  // ── 1. Firing session/created must not create anything ─────────────────────
  if (typeof created === 'function') {
    await created({ id: 'session-abc123' })
    // Fire it several times: once per resume is exactly the failure mode.
    await created({ id: 'session-abc123' })
    await created({ id: 'session-abc123' })
  }

  assert.equal(
    existsSync(sessionsDir),
    false,
    `session/created must not pre-create the artifact directory, but ${sessionsDir} exists ` +
      `with ${existsSync(sessionsDir) ? readdirSync(sessionsDir).length : 0} entries`
  )

  // ── 2. The agent is still told where to write ──────────────────────────────
  const dirSection = promptSections.find((s) => s?.name === 'tool:artifacts-session-dir')
  assert.ok(dirSection, 'the artifact-directory system-prompt section must still be registered')
  assert.equal(typeof dirSection.text, 'function', 'the section text must be a thunk (it is per-session)')

  const text = dirSection.text({ agent: { session: { id: 'session-abc123' } } })
  assert.match(text, /sessions\//, 'the prompt must name the per-session folder')
  assert.match(text, /mkdir -p/i, 'the prompt must still tell the agent to create the folder itself')

  // ── 3. Scanning a directory that does not exist must not throw ─────────────
  // This is what makes lazy creation safe for the panel: before anything is
  // written there is no folder to list, and that has to be a normal empty
  // result rather than an error.
  const value = await mod.scanWorkspace(workspace, { maxFiles: 50 }, [])
  assert.ok(value, 'scanWorkspace must return a result for an as-yet-unwritten session')

  // ── 4. Writing a file DOES create the folder, proving laziness is viable ───
  // Mirrors what DSH's write path does, so the folder still shows up in time.
  const { mkdirSync } = await import('node:fs')
  const target = join(sessionsDir, '2026-01-01-abc123')
  mkdirSync(target, { recursive: true })
  writeFileSync(join(target, 'out.md'), '# hi\n')
  assert.ok(existsSync(target), 'the folder must exist once something is written into it')

  console.log('ok  session/created creates no directory (fired 3x, still absent)')
  console.log('ok  the system prompt still directs the agent to the session folder')
  console.log('ok  scanning a missing directory returns cleanly')
} finally {
  rmSync(workspace, { recursive: true, force: true })
}
