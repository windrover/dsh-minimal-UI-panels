/**
 * dsh-terminal-notes — Host half.
 *
 * A plain Cordis plugin loaded as the `terminal-notes` loader row. It exposes
 * HTTP routes on the harness web server that the browser half (exports["./client"])
 * calls with fetch():
 *
 *   POST /api/terminal-notes/exec        { command } -> { ok, code?, output?, error? }
 *       Runs `bash -lc <command>`, collects bounded stdout+stderr.
 *   GET  /api/terminal-notes/notes       -> { ok, notes: [{id,title,updatedAt}] }
 *       Lists every saved note (title = first line).
 *   POST /api/terminal-notes/notes       {} -> { ok, id }
 *       Creates a new empty note and returns its id.
 *   GET  /api/terminal-notes/note?id=<id> -> { ok, id, text, title }
 *       Reads one note (empty when missing).
 *   POST /api/terminal-notes/note        { id, text } -> { ok }
 *       Saves one note (auto-titles from the first line); creates if absent.
 *   POST /api/terminal-notes/note-delete { id } -> { ok }
 *       Deletes one note.
 *
 * Notes are stored as one JSON document at ~/.dsh/notes.json (the fs
 * provider offers no unlink primitive, so a single atomic JSON rewrite is the
 * reliable storage shape; each entry is still an independent note).
 *
 * Services: `webServer` (routes), `subprocess` (terminal), `fs` (notes file).
 */

import { dshHomePath } from '@deepseek-ai/dsh-home-paths'
import { resolve } from 'node:path'

export const name = 'dsh-terminal-notes'

export const inject = ['webServer', 'subprocess', 'fs']

function sendJson(res, status, value) {
  const body = JSON.stringify(value)
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'content-length': Buffer.byteLength(body),
  })
  res.end(body)
}

async function readJson(req) {
  let body = ''
  let total = 0
  for await (const chunk of req) {
    total += chunk.length
    if (total > 4 * 1024 * 1024) throw new Error('request body too large')
    body += chunk
  }
  if (body === '') return {}
  return JSON.parse(body)
}

function notesFilePath() {
  return resolve(dshHomePath(), 'notes.json')
}

/** Extract a note title from its text (first non-empty line, capped). */
function titleOf(text) {
  const first = String(text ?? '').split('\n').map((l) => l.trim()).find((l) => l !== '') ?? ''
  return first.slice(0, 40) || '未命名'
}

export function apply(ctx) {
  const { webServer, subprocess, fs } = ctx

  // Resolve the notes file target lazily (fs targets are stable identities).
  let noteTargetPromise
  const noteTarget = () => {
    if (!noteTargetPromise) noteTargetPromise = fs.resolve(notesFilePath())
    return noteTargetPromise
  }

  /** Load the notes document; returns { notes: [] } when absent or corrupt. */
  async function loadNotes() {
    try {
      const target = await noteTarget()
      const info = await fs.stat(target)
      if (!info) return { notes: [] }
      const raw = await fs.readText(target)
      const parsed = JSON.parse(raw)
      if (!Array.isArray(parsed.notes)) return { notes: [] }
      return parsed
    } catch {
      return { notes: [] }
    }
  }

  /** Persist the notes document atomically. */
  async function saveNotes(doc) {
    const target = await noteTarget()
    await fs.writeText(target, JSON.stringify(doc, null, 2))
  }

  function noteListOf(doc) {
    return doc.notes
      .map((n) => ({ id: n.id, title: n.title ?? titleOf(n.text), updatedAt: n.updatedAt ?? 0 }))
      .sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0))
  }

  function now() {
    return Date.now()
  }

  // ---- terminal -----------------------------------------------------------
  ctx.effect(() => webServer.register({
    kind: 'exact',
    path: '/api/terminal-notes/exec',
    handler: async (req, res) => {
      if (req.method !== 'POST') {
        sendJson(res, 405, { ok: false, error: 'method not allowed' })
        return
      }
      let payload
      try {
        payload = await readJson(req)
      } catch (err) {
        sendJson(res, 400, { ok: false, error: `bad request: ${String(err?.message ?? err)}` })
        return
      }
      const command = typeof payload?.command === 'string' ? payload.command.trim() : ''
      if (command === '') {
        sendJson(res, 400, { ok: false, error: 'missing command' })
        return
      }
      try {
        const bash = await subprocess.resolveExecutable('bash')
        const handle = subprocess.spawn({
          argv: [bash, '-lc', command],
          cwd: process.cwd(),
          stdio: {
            stdin: 'pipe',
            stdout: { collect: true, maxBytes: 256 * 1024 },
            stderr: { collect: true, maxBytes: 256 * 1024 },
          },
          graceMs: 2000,
        })
        const outcome = await handle.done
        const out = handle.collected.stdout ? handle.collected.stdout.readFrom(0).text : ''
        const errText = handle.collected.stderr ? handle.collected.stderr.readFrom(0).text : ''
        const output = (out + (errText ? (out ? '\n' : '') + errText : '')).slice(0, 512 * 1024)
        sendJson(res, 200, { ok: true, code: outcome.exitCode, output })
      } catch (err) {
        sendJson(res, 500, { ok: false, error: String(err?.message ?? err) })
      }
    },
  }), 'terminal-notes: exec route')

  // ---- notes --------------------------------------------------------------
  ctx.effect(() => webServer.register({
    kind: 'exact',
    path: '/api/terminal-notes/notes',
    handler: async (req, res) => {
      if (req.method === 'GET') {
        try {
          const doc = await loadNotes()
          sendJson(res, 200, { ok: true, notes: noteListOf(doc) })
        } catch (err) {
          sendJson(res, 500, { ok: false, error: String(err?.message ?? err) })
        }
        return
      }
      if (req.method === 'POST') {
        try {
          const doc = await loadNotes()
          const id = `note-${now()}-${Math.random().toString(36).slice(2, 8)}`
          doc.notes.push({ id, text: '', title: '未命名', updatedAt: now() })
          await saveNotes(doc)
          sendJson(res, 200, { ok: true, id })
        } catch (err) {
          sendJson(res, 500, { ok: false, error: String(err?.message ?? err) })
        }
        return
      }
      sendJson(res, 405, { ok: false, error: 'method not allowed' })
    },
  }), 'terminal-notes: notes list route')

  ctx.effect(() => webServer.register({
    kind: 'exact',
    path: '/api/terminal-notes/note',
    handler: async (req, res) => {
      if (req.method === 'GET') {
        const id = new URL(req.url ?? '/', 'http://x').searchParams.get('id') ?? ''
        try {
          const doc = await loadNotes()
          const note = doc.notes.find((n) => n.id === id)
          sendJson(res, 200, { ok: true, id, text: note?.text ?? '', title: note?.title ?? titleOf(note?.text) })
        } catch (err) {
          sendJson(res, 500, { ok: false, error: String(err?.message ?? err) })
        }
        return
      }
      if (req.method === 'POST') {
        let payload
        try {
          payload = await readJson(req)
        } catch (err) {
          sendJson(res, 400, { ok: false, error: `bad request: ${String(err?.message ?? err)}` })
          return
        }
        const id = typeof payload?.id === 'string' ? payload.id : ''
        if (id === '') {
          sendJson(res, 400, { ok: false, error: 'missing id' })
          return
        }
        const text = typeof payload?.text === 'string' ? payload.text : ''
        try {
          const doc = await loadNotes()
          let note = doc.notes.find((n) => n.id === id)
          if (!note) {
            note = { id, text: '', title: '未命名', updatedAt: now() }
            doc.notes.push(note)
          }
          note.text = text
          note.title = titleOf(text)
          note.updatedAt = now()
          await saveNotes(doc)
          sendJson(res, 200, { ok: true })
        } catch (err) {
          sendJson(res, 500, { ok: false, error: String(err?.message ?? err) })
        }
        return
      }
      sendJson(res, 405, { ok: false, error: 'method not allowed' })
    },
  }), 'terminal-notes: note route')

  ctx.effect(() => webServer.register({
    kind: 'exact',
    path: '/api/terminal-notes/note-delete',
    handler: async (req, res) => {
      if (req.method !== 'POST') {
        sendJson(res, 405, { ok: false, error: 'method not allowed' })
        return
      }
      let payload
      try {
        payload = await readJson(req)
      } catch (err) {
        sendJson(res, 400, { ok: false, error: `bad request: ${String(err?.message ?? err)}` })
        return
      }
      const id = typeof payload?.id === 'string' ? payload.id : ''
      if (id === '') {
        sendJson(res, 400, { ok: false, error: 'missing id' })
        return
      }
      try {
        const doc = await loadNotes()
        doc.notes = doc.notes.filter((n) => n.id !== id)
        await saveNotes(doc)
        sendJson(res, 200, { ok: true })
      } catch (err) {
        sendJson(res, 500, { ok: false, error: String(err?.message ?? err) })
      }
    },
  }), 'terminal-notes: note delete route')
}
