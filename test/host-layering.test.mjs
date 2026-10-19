#!/usr/bin/env node
/**
 * Layering guard for the host half.
 *
 * ltm.js was a 1925-line file whose apply() held 1532 lines of closure state.
 * It is now split by responsibility:
 *
 *   host/ltm/shared.js   constants + pure validators/renderers (no IO, no ctx)
 *   host/ltm/runtime.js  the stateful core: store cache, pending queue, settings
 *   host/ltm.js          entry: config, tools, routes, wiring
 *
 * A split is only worth keeping if the boundaries hold, so this asserts:
 *   1. shared.js imports nothing local — it must stay pure and dependency-free,
 *      otherwise every consumer inherits its dependencies.
 *   2. runtime.js never imports ltm.js (that would be a cycle: ltm.js owns it).
 *   3. every local import resolves to a real file.
 *   4. no local import cycle exists anywhere under lib/.
 */
import assert from 'node:assert/strict'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const HOST = join(dirname(fileURLToPath(import.meta.url)), '..', 'lib', 'host')
const ROOT = join(HOST, '..')

/** Files under lib/ (the ladder of modules we care about). */
function walk(dir) {
  const out = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) out.push(...walk(full))
    else if (entry.name.endsWith('.js')) out.push(full)
  }
  return out
}
const files = walk(ROOT)
const rel = (f) => relative(ROOT, f).split('\\').join('/')

/** Local imports declared by one file, resolved to absolute paths. */
function localImports(file) {
  const src = readFileSync(file, 'utf8')
  const out = []
  for (const m of src.matchAll(/from '(\.\.?\/[^']+)'/g)) {
    const target = resolve(dirname(file), m[1])
    out.push(target)
  }
  return out
}

// 1. shared.js must stay pure.
const shared = join(HOST, 'ltm', 'shared.js')
assert.ok(existsSync(shared), 'ltm/shared.js exists')
assert.deepEqual(localImports(shared), [], 'ltm/shared.js must not import anything local (keep it pure)')

// 2. runtime.js must not import the entry it belongs to.
const runtime = join(HOST, 'ltm', 'runtime.js')
assert.ok(existsSync(runtime), 'ltm/runtime.js exists')
assert.ok(!localImports(runtime).includes(join(HOST, 'ltm.js')),
  'ltm/runtime.js must not import ltm.js (that would be a cycle)')

// 3. Every local import resolves.
let checked = 0
for (const file of files) {
  for (const target of localImports(file)) {
    checked += 1
    assert.ok(existsSync(target), `${rel(file)} imports a missing file: ${rel(target)}`)
  }
}

// 4. No cycles (depth-first over the local import graph).
const graph = new Map(files.map((f) => [f, localImports(f)]))
const WHITE = 0, GRAY = 1, BLACK = 2
const color = new Map(files.map((f) => [f, WHITE]))
const stack = []
function visit(node) {
  color.set(node, GRAY)
  stack.push(node)
  for (const next of graph.get(node) ?? []) {
    if (!graph.has(next)) continue
    if (color.get(next) === GRAY) {
      const cycle = [...stack.slice(stack.indexOf(next)), next].map(rel).join(' -> ')
      assert.fail(`import cycle: ${cycle}`)
    }
    if (color.get(next) === WHITE) visit(next)
  }
  stack.pop()
  color.set(node, BLACK)
}
for (const file of files) if (color.get(file) === WHITE) visit(file)

console.log(`layering ok: ${files.length} files · ${checked} local imports · acyclic · ltm/shared.js pure`)
