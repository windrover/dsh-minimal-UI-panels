#!/usr/bin/env node
/**
 * Regression test: the `artifacts_list` agent tool must actually satisfy its own
 * output schema.
 *
 * The bug this pins down: `scanFile()` and the preview reader filled `mtimeMs`
 * straight from `stat.mtimeMs`, which Node reports as a FLOAT (e.g.
 * 1789091760946.6096). The tool's output schema declares
 * `mtimeMs: { type: "integer" }`, so the harness rejected every call with
 * `"value.files[0].mtimeMs" must be an integer` — and one bad file poisoned the
 * whole result, so the tool failed 100% of the time on any non-empty directory.
 * An empty directory passed by accident, which is exactly why this looked
 * intermittent at first.
 *
 * The assertions are deliberately about the SCHEMA, not about a literal value:
 * a future refactor that changes how mtime is produced still has to keep the
 * tool's own declared contract. We walk the whole response for non-integer
 * numbers, so a second field drifting to a float (size, lines, scanned, …)
 * fails here too rather than in production.
 *
 * Run: node test/artifacts-tool-schema.test.mjs
 */
import { mkdtempSync, writeFileSync, mkdirSync, utimesSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import assert from 'node:assert/strict'

const mod = await import('../lib/host/artifacts.js')

// ── a context stub that survives the whole apply() ───────────────────────────
// apply() does more than register the tool: it hooks `session/created`, adds a
// system-prompt section and mounts HTTP routes. We only care about the tool, so
// every surface it touches is stubbed to a no-op and `tools.register` is the one
// that records.
const tools = []
const noop = () => {}
const stubCtx = {
  on: noop,
  effect: (fn) => {
    // The tool is registered inside an effect; run it to capture the def.
    try {
      return fn()
    } catch {
      return undefined
    }
  },
  tools: { register: (def) => tools.push(def) },
  webServer: { get: noop, post: noop, route: noop, addRoute: noop },
  systemPrompt: { section: noop, add: noop },
  workspaceRegistry: undefined,
  logger: { warn: noop, info: noop, debug: noop, error: noop },
  inject: noop,
  get: () => undefined,
  set: noop
}

mod.apply(stubCtx, {})

const tool = tools.find((t) => t?.name === 'artifacts_list')
assert.ok(
  tool,
  `artifacts_list was not registered; saw: ${tools.map((t) => t?.name).join(', ') || '(none)'}`
)
assert.equal(typeof tool.execute, 'function', 'artifacts_list must expose execute()')

// ── build a directory whose file has a FRACTIONAL mtime ──────────────────────
const dir = mkdtempSync(join(tmpdir(), 'artifacts-schema-'))
try {
  // utimes takes SECONDS and keeps the fraction, so this reproduces a float
  // mtime at the source instead of rounding it away when the file is created.
  const fractional = 1789091760.9466096
  writeFileSync(join(dir, 'note.md'), '# hello\n\nbody\n')
  utimesSync(join(dir, 'note.md'), fractional, fractional)

  mkdirSync(join(dir, 'sub'))
  writeFileSync(join(dir, 'sub', 'data.json'), '{"a":1}\n')

  const value = await tool.execute({ dir }, { agent: { session: { header: { cwd: dir } } } })

  // ── walk the whole response for non-integer numbers ────────────────────────
  const problems = []
  const walk = (node, path) => {
    if (node === null || typeof node !== 'object') return
    if (Array.isArray(node)) {
      node.forEach((item, i) => walk(item, `${path}[${i}]`))
      return
    }
    for (const [key, val] of Object.entries(node)) {
      const here = path === '' ? key : `${path}.${key}`
      if (val === null) continue
      if (typeof val === 'number') {
        if (!Number.isInteger(val)) problems.push(`${here} = ${val} (not an integer)`)
      } else if (typeof val === 'object') {
        walk(val, here)
      }
    }
  }
  walk(value, '')

  assert.deepEqual(
    problems,
    [],
    `artifacts_list returned non-integer numbers, which its schema rejects:\n  ${problems.join('\n  ')}`
  )

  // ── and pin the exact field that broke ────────────────────────────────────
  assert.ok(Array.isArray(value.files), 'result must carry a files array')
  assert.ok(value.files.length >= 2, `expected at least 2 files, got ${value.files.length}`)
  for (const f of value.files) {
    assert.ok(
      Number.isInteger(f.mtimeMs),
      `files[].mtimeMs must be an integer, got ${f.mtimeMs} (${typeof f.mtimeMs}) for ${f.name}`
    )
    assert.ok(Number.isInteger(f.size), `files[].size must be an integer, got ${f.size} for ${f.name}`)
  }

  // mtimeMs is epoch MILLISECONDS: rounding must not truncate to seconds.
  const note = value.files.find((f) => f.name === 'note.md')
  assert.ok(note, 'note.md must appear in the listing')
  assert.equal(note.mtimeMs, Math.round(fractional * 1000), 'mtimeMs must be epoch ms, rounded')

  console.log('ok  artifacts_list output satisfies its integer schema')
  console.log(`ok  ${value.files.length} files listed, mtimeMs = ${note.mtimeMs}`)
} finally {
  rmSync(dir, { recursive: true, force: true })
}
