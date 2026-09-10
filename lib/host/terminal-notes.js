/**
 * dsh-terminal-notes — Host half.
 *
 * A plain Cordis plugin loaded as the `terminal-notes` loader row. It exposes
 * HTTP routes on the harness web server that the browser half (exports["./client"])
 * calls with fetch():
 *
 *   POST /api/terminal-notes/exec        { command, runId? } -> { ok, code?, output?, error? }
 *       Runs `bash -lc <command>`, collects bounded stdout+stderr. `error` is a
 *       stable code ('timeout' | 'cancelled' | ...) rather than prose, so the
 *       panel can localize it. The child's stdin is /dev/null, and every run has
 *       a deadline (DEFAULT_TIMEOUT_MS, config `terminalNotes.timeoutMs`).
 *   POST /api/terminal-notes/exec-cancel { runId } -> { ok, cancelled }
 *       Terminates the run that was started with that id, if it is still going.
 *       A miss answers ok with cancelled:false — "it is not running" is what the
 *       caller asked for.
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

/**
 * Deadline for one command, in milliseconds.
 *
 * The subprocess seam deliberately owns no deadline — "callers own deadlines
 * and cause classification" — so without one the exec route waited forever on
 * anything that ran long, and the panel sat on 「运行中…」 with its input
 * disabled and no way out. Two minutes covers the one-line commands this panel
 * is for; a genuinely long build is what the session's own bash tool is for.
 */
const DEFAULT_TIMEOUT_MS = 120_000

export function apply(ctx, config = {}) {
  const { webServer, subprocess, fs } = ctx
  const timeoutMs = Number.isFinite(config?.timeoutMs) && config.timeoutMs > 0
    ? config.timeoutMs
    : DEFAULT_TIMEOUT_MS
  /**
   * Commands currently running, keyed by the id the caller sent with them.
   *
   * A request/response pair cannot cancel itself: the handle it would need to
   * reach is created after the request arrives and lives only inside that one
   * handler. So a run is NAMED by the client, and a second request addresses it
   * by that name. The panel sends one id per run and keeps only one in flight,
   * but the map is keyed rather than singular so a stale cancel can never hit a
   * command it did not start.
   */
  const activeRuns = new Map()

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
      const runId = typeof payload?.runId === 'string' && payload.runId !== '' ? payload.runId : null
      try {
        const bash = await subprocess.resolveExecutable('bash')
        // The caller owns the deadline: fire the abort, then classify it from
        // the fact that it was us who fired it.
        const controller = new AbortController()
        let timedOut = false
        let cancelled = false
        const onAbort = () => { timedOut = true }
        controller.signal.addEventListener('abort', onAbort)
        const timer = setTimeout(() => controller.abort(), timeoutMs)
        let handle
        let outcome
        try {
          handle = subprocess.spawn({
            argv: [bash, '-lc', command],
            cwd: process.cwd(),
            stdio: {
              // A one-line runner has no stdin to hand over. `'pipe'` left fd 0
              // open and never written, so every command that reads it — bash,
              // cat, read, python, an editor — blocked until the harness was
              // restarted, and the request never returned. /dev/null gives the
              // child EOF immediately, which is what "no stdin" should mean.
              stdin: 'ignore',
              stdout: { collect: true, maxBytes: 256 * 1024 },
              stderr: { collect: true, maxBytes: 256 * 1024 },
            },
            graceMs: 2000,
            signal: controller.signal,
          })
          // Publish the handle under the caller's id so the cancel route can
          // reach it. `cancelled` is separate from `timedOut` on purpose: the
          // abort signal we own says "deadline", and only this flag says "the
          // user pressed stop".
          if (runId !== null) activeRuns.set(runId, {
            cancel: () => { cancelled = true; handle.terminate() },
          })
          outcome = await handle.done
        } finally {
          clearTimeout(timer)
          controller.signal.removeEventListener('abort', onAbort)
          if (runId !== null) activeRuns.delete(runId)
        }
        const out = handle.collected.stdout ? handle.collected.stdout.readFrom(0).text : ''
        const errText = handle.collected.stderr ? handle.collected.stderr.readFrom(0).text : ''
        const output = (out + (errText ? (out ? '\n' : '') + errText : '')).slice(0, 512 * 1024)
        if (cancelled) {
          // The user stopped it; say so, and keep what it printed first.
          sendJson(res, 200, { ok: false, error: 'cancelled', output, code: outcome.exitCode })
          return
        }
        if (timedOut) {
          // Hand back whatever it managed to print: a killed build is far more
          // useful with its output than without it. `error` is a stable code
          // the panel localizes; the raw text would not translate.
          sendJson(res, 200, { ok: false, error: 'timeout', timeoutMs, output, code: outcome.exitCode })
          return
        }
        sendJson(res, 200, { ok: true, code: outcome.exitCode, output })
      } catch (err) {
        sendJson(res, 500, { ok: false, error: String(err?.message ?? err) })
      }
    },
  }), 'terminal-notes: exec route')

  // ---- cancel a running command -------------------------------------------
  // The escape hatch for a long command: the panel posts the id it sent with
  // the run and the harness terminates that run instead of leaving the panel
  // stuck until the deadline.
  ctx.effect(() => webServer.register({
    kind: 'exact',
    path: '/api/terminal-notes/exec-cancel',
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
      const runId = typeof payload?.runId === 'string' && payload.runId !== '' ? payload.runId : null
      if (runId === null) {
        sendJson(res, 400, { ok: false, error: 'missing runId' })
        return
      }
      const run = activeRuns.get(runId)
      // A miss is not an error: the command may have finished a moment ago, and
      // "it is not running any more" is exactly what the caller wanted.
      if (run === undefined) {
        sendJson(res, 200, { ok: true, cancelled: false })
        return
      }
      try {
        run.cancel()
        sendJson(res, 200, { ok: true, cancelled: true })
      } catch (err) {
        sendJson(res, 500, { ok: false, error: String(err?.message ?? err) })
      }
    },
  }), 'terminal-notes: exec-cancel route')

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
