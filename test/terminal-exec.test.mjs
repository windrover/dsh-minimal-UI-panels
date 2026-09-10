#!/usr/bin/env node
/**
 * Host-side test for POST /api/terminal-notes/exec.
 *
 * Reported: typing `bash` into the Terminal panel froze the panel.
 *
 * Root cause: the route spawned with `stdin: 'pipe'` — a descriptor that is
 * opened, never written and never closed. Every command that reads stdin
 * (bash, cat, read, python, an editor) therefore blocked until the harness was
 * restarted; `handle.done` never settled, the HTTP request never answered, and
 * the panel sat on 「运行中…」 with its input disabled and no way out. There was
 * no deadline either, and the subprocess seam is explicit that callers own
 * them ("this layer reacts to an abort signal; callers own deadlines").
 *
 * Pinned here:
 *   - the spawn asks for `stdin: 'ignore'`, i.e. fd 0 on /dev/null, so a
 *     command that reads stdin gets EOF instead of blocking;
 *   - the spawn carries an abort signal, and the route turns its firing into a
 *     classified `timeout` result instead of hanging;
 *   - a timed-out command still hands back the output it managed to print;
 *   - the happy path is unchanged.
 *
 * Run: node test/terminal-exec.test.mjs   (the precheck runs it with --tests)
 */
import assert from 'node:assert/strict'
import { apply } from '../lib/host/terminal-notes.js'

/**
 * Apply the host plugin against a mock context and expose what it registered.
 * @param options - `timeoutMs` for the plugin config, and how the fake child
 *   settles (`onAbort` mimics a process that only dies when we terminate it).
 * @returns the captured routes, the spawn specs, and an HTTP invoker.
 */
function createHarness(options = {}) {
  const routes = new Map()
  const specs = []
  const ctx = {
    effect: (cb) => { const dispose = cb(); return typeof dispose === 'function' ? dispose : () => {} },
    webServer: {
      register: (route) => { routes.set(route.path, route); return () => {} },
    },
    fs: {},
    subprocess: {
      resolveExecutable: async () => '/bin/bash',
      spawn: (spec) => {
        specs.push(spec)
        const stdout = { readFrom: () => ({ text: 'partial output', nextOffset: 0, lossy: false }) }
        const stderr = { readFrom: () => ({ text: '', nextOffset: 0, lossy: false }) }
        const done = options.settle === 'onAbort'
          // A managed range that only goes away when the caller's signal fires.
          ? new Promise((resolve) => {
            spec.signal.addEventListener('abort', () => resolve({ exitCode: null, signal: 'SIGTERM' }), { once: true })
          })
          : Promise.resolve({ exitCode: 0, signal: null })
        return { stdin: undefined, stdout: undefined, stderr: undefined, collected: { stdout, stderr }, done, terminate: () => {} }
      },
    },
  }
  apply(ctx, options.config ?? {})

  /** Invoke a registered route with a JSON body and return its parsed reply. */
  const invoke = async (path, body) => {
    const route = routes.get(path)
    assert.ok(route, `no route registered at ${path}`)
    const req = {
      method: 'POST',
      async *[Symbol.asyncIterator]() { yield JSON.stringify(body) },
    }
    const res = {
      status: 0,
      headers: null,
      body: '',
      writeHead(status, headers) { res.status = status; res.headers = headers },
      end(text) { res.body = text },
    }
    await route.handler(req, res)
    return { status: res.status, json: JSON.parse(res.body) }
  }

  return { routes, specs, invoke }
}

// ---- the exec route is where we think it is --------------------------------
{
  const harness = createHarness()
  assert.ok(harness.routes.has('/api/terminal-notes/exec'), 'the exec route must be registered')
}

// ---- the spawn never hands the child an open stdin -------------------------
{
  const harness = createHarness({ settle: 'immediately' })
  const { status, json } = await harness.invoke('/api/terminal-notes/exec', { command: 'bash' })

  const spec = harness.specs[0]
  assert.ok(spec, 'the route must spawn a child')
  assert.deepEqual([...spec.argv], ['/bin/bash', '-lc', 'bash'], 'the command runs through bash -lc')
  assert.equal(
    spec.stdio.stdin,
    'ignore',
    "stdin must be 'ignore' (fd 0 on /dev/null): an open, never-written pipe is what hung every command that reads stdin",
  )
  assert.ok(spec.signal instanceof AbortSignal, 'the spawn must carry an abort signal so the route can enforce a deadline')
  assert.equal(json.ok, true, 'a command that exits normally still succeeds')
  assert.equal(json.output, 'partial output', 'collected output is returned as before')
  assert.equal(status, 200)
}

// ---- a command that never exits is killed and classified -------------------
{
  const CAPPED_AT_MS = 30
  const harness = createHarness({ settle: 'onAbort', config: { timeoutMs: CAPPED_AT_MS } })
  const { status, json } = await harness.invoke('/api/terminal-notes/exec', { command: 'bash' })

  assert.equal(status, 200)
  assert.equal(json.ok, false, 'a command killed at the deadline is not a success')
  assert.equal(json.error, 'timeout', 'the failure is a stable code the panel localizes, not prose')
  assert.equal(json.timeoutMs, CAPPED_AT_MS, 'the reply names the deadline that fired')
  assert.equal(
    json.output,
    'partial output',
    'a killed command still hands back what it printed — a killed build without its output is not diagnosable',
  )
}

console.log('✅ terminal exec OK — stdin is /dev/null, and a hung command is killed at the deadline with its output')
