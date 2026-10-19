#!/usr/bin/env node
/**
 * Host-side test for the Notes panel's storage.
 *
 * Reported: 在「长期记忆 + 记事本」页里点「新建」没有任何反应，记事本无法新建。
 *
 * Root cause: the host half stored notes through the `ctx.fs` service. DSH
 * 0.2.1 swapped that service's backend to `@deepseek-ai/dsh-fs-sandbox`, whose
 * `workspace-write` policy allows mutations only under the workspace root (plus
 * temp dirs). `~/.dsh/notes.json` is outside that fence, so POST
 * /api/terminal-notes/notes (create), POST /api/terminal-notes/note (save) and
 * note-delete all answered 500 `FS_SANDBOX_DENIED`; reads passed, which is why
 * the existing note still listed but nothing could be added.
 *
 * Pinned here:
 *   - the host declares no `fs` dependency, and works with an `fs` service
 *     whose mutation methods throw `FS_SANDBOX_DENIED` (the regression shape);
 *   - create writes ~/.dsh/notes.json (here $DSH_HOME) and the created id is
 *     listed by GET /notes;
 *   - save fills the text and auto-titles from the first non-empty line;
 *   - delete removes it, and a corrupt file degrades to an empty list;
 *   - every write leaves exactly one notes.json behind (temp file renamed).
 *
 * Run: node test/notes-persist.test.mjs
 */
import assert from 'node:assert/strict'
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const home = await mkdtemp(join(tmpdir(), 'dsh-notes-test-'))
// Resolve $DSH_HOME before the host module (and its home-path resolver) loads.
process.env.DSH_HOME = home

const { apply, inject } = await import('../lib/host/terminal-notes.js')

assert.deepEqual(inject, ['webServer', 'subprocess'],
  'notes must not depend on ctx.fs: the sandbox denies writes outside the workspace')

/** Apply the host plugin and return the registered routes plus an invoker. */
function createHarness() {
  const routes = new Map()
  const ctx = {
    effect: (cb) => { const dispose = cb(); return typeof dispose === 'function' ? dispose : () => {} },
    webServer: {
      register: (route) => { routes.set(route.path, route); return () => {} },
    },
    // The real 0.2.1 backend: reads pass, mutations are fenced. The host must
    // never call it for notes again.
    fs: {
      resolve: async (path) => { throw new Error('fs.resolve must not be used for notes') },
      stat: async () => undefined,
      readText: async () => '',
      writeText: async () => {
        throw new Error('cannot write "~/.dsh/notes.json": file access denied under workspace-write mode')
      },
    },
    subprocess: {
      resolveExecutable: async () => '/bin/bash',
      spawn: () => { throw new Error('terminal not used in this test') },
    },
  }
  apply(ctx, {})

  /** Invoke a registered route and return { status, json }. */
  const invoke = async (path, { method = 'GET', body, query = '' } = {}) => {
    const route = routes.get(path)
    assert.ok(route, `no route registered at ${path}`)
    const req = {
      method,
      url: path + query,
      async *[Symbol.asyncIterator]() {
        if (body !== undefined) yield JSON.stringify(body)
      },
    }
    let status = 0
    let raw = ''
    const res = {
      writeHead: (code) => { status = code },
      end: (chunk) => { raw += chunk ?? '' },
    }
    await route.handler(req, res)
    return { status, json: raw === '' ? undefined : JSON.parse(raw) }
  }
  return { invoke }
}

const notesFile = join(home, 'notes.json')
const { invoke } = createHarness()

// ---- create -----------------------------------------------------------------
const created = await invoke('/api/terminal-notes/notes', { method: 'POST', body: {} })
assert.equal(created.status, 200, 'create must not 500')
assert.equal(created.json.ok, true)
assert.equal(typeof created.json.id, 'string')
assert.notEqual(created.json.id, '')

const onDisk = JSON.parse(await readFile(notesFile, 'utf8'))
assert.equal(onDisk.notes.length, 1, 'created note is persisted')
assert.equal(onDisk.notes[0].id, created.json.id)
assert.equal(onDisk.notes[0].text, '')
assert.equal(onDisk.notes[0].title, '未命名')

const listed = await invoke('/api/terminal-notes/notes')
assert.equal(listed.status, 200)
assert.deepEqual(listed.json.notes.map((n) => n.id), [created.json.id])

// ---- save + auto-title ------------------------------------------------------
const saved = await invoke('/api/terminal-notes/note', {
  method: 'POST',
  body: { id: created.json.id, text: '第一行标题\n正文内容' },
})
assert.equal(saved.status, 200)
assert.equal(saved.json.ok, true)

const read = await invoke('/api/terminal-notes/note', { query: `?id=${created.json.id}` })
assert.equal(read.status, 200)
assert.equal(read.json.text, '第一行标题\n正文内容')

const relisted = await invoke('/api/terminal-notes/notes')
assert.equal(relisted.json.notes[0].title, '第一行标题', 'title derives from the first non-empty line')

// saving an unknown id still creates it (the client may race a delete)
const adopted = await invoke('/api/terminal-notes/note', {
  method: 'POST',
  body: { id: 'note-adopted', text: '新条目' },
})
assert.equal(adopted.json.ok, true)
assert.equal((await invoke('/api/terminal-notes/notes')).json.notes.length, 2)

// ---- delete -----------------------------------------------------------------
const deleted = await invoke('/api/terminal-notes/note-delete', {
  method: 'POST',
  body: { id: created.json.id },
})
assert.equal(deleted.json.ok, true)
const afterDelete = await invoke('/api/terminal-notes/notes')
assert.deepEqual(afterDelete.json.notes.map((n) => n.id), ['note-adopted'])

// ---- corrupt file degrades to an empty list ---------------------------------
await writeFile(notesFile, 'not json', 'utf8')
const corrupt = await invoke('/api/terminal-notes/notes')
assert.equal(corrupt.status, 200)
assert.deepEqual(corrupt.json.notes, [])
// and saving after corruption rewrites a valid document
const revived = await invoke('/api/terminal-notes/note', {
  method: 'POST',
  body: { id: 'note-revived', text: '恢复' },
})
assert.equal(revived.json.ok, true)
assert.equal(JSON.parse(await readFile(notesFile, 'utf8')).notes.length, 1)

// ---- no temp files left behind ----------------------------------------------
const leftover = (await readdir(home)).filter((name) => name.startsWith('notes.json.tmp-'))
assert.deepEqual(leftover, [], 'atomic write cleans up its temp file')

await rm(home, { recursive: true, force: true })
console.log('notes-persist ok')
