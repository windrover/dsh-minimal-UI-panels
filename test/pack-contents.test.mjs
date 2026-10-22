#!/usr/bin/env node
/**
 * Packaging gate: the tarball npm would publish must be complete *and*
 * importable.
 *
 * `files` is resolved by npm-packlist (minimatch semantics), where `*` never
 * crosses `/`. A pattern like `lib/host/*.js` therefore ships only the top
 * level of lib/host/ and silently drops subdirectories: 0.5.0 lost all seven
 * `lib/host/ltm/*.js` files, so `lib/host/ltm.js`'s
 * `import ... from './ltm/runtime.js'` threw ERR_MODULE_NOT_FOUND at host
 * import time and DSH discarded the whole plugin (host half + browser half)
 * from the boot graph.
 *
 * Nothing else in the repo can catch this: every other test runs from the
 * checkout, where `files` filtering does not apply. So this gate packs exactly
 * like a publisher would (`npm pack --dry-run --json`) and asserts:
 *
 *   1. every lib/**.js on disk appears in the tarball;
 *   2. the relative-import graph of the packed files closes inside the
 *      tarball — no packed module imports a file that was left out;
 *   3. every `exports` target plus the bundle patch file are in the tarball.
 *
 * It is deliberately dependency-free (no install, no temp tarball extraction)
 * so it can run first in CI and stay green on Node 20/22/24.
 */
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(fileURLToPath(new URL('..', import.meta.url)))

/** Every .js file the source tree expects to ship, as tarball-relative paths. */
function sourceLibFiles() {
  const out = []
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) walk(full)
      else if (entry.name.endsWith('.js')) {
        out.push(path.relative(ROOT, full).split(path.sep).join('/'))
      }
    }
  }
  walk(path.join(ROOT, 'lib'))
  return out.sort()
}

/** The `files` list npm would publish, straight from npm-packlist. */
function packedFiles() {
  // npm needs a writable cache/logs dir; keep it in a throwaway directory so
  // the gate also works when $HOME (or ~/.npm) is read-only.
  const cache = mkdtempSync(path.join(tmpdir(), 'dsh-pack-gate-'))
  let stdout
  try {
    const run = spawnSync('npm', ['pack', '--dry-run', '--json', '--loglevel=error'], {
      cwd: ROOT,
      encoding: 'utf8',
      env: { ...process.env, npm_config_cache: cache, npm_config_update_notifier: 'false' },
      // npm is a .cmd shim on Windows; without a shell spawnSync cannot find it.
      shell: process.platform === 'win32',
    })
    assert.equal(run.error, undefined, `could not run npm: ${run.error}`)
    assert.equal(run.status, 0, `npm pack --dry-run failed:\n${run.stderr ?? ''}`)
    stdout = run.stdout
  } finally {
    rmSync(cache, { recursive: true, force: true })
  }

  // npm <= 11 prints `[ { files: [...] } ]`; npm 12 prints `{ "<name>": { ... } }`.
  // Accept both so the gate does not depend on the npm major in CI.
  const parsed = JSON.parse(stdout)
  const entry = Array.isArray(parsed) ? parsed[0] : Object.values(parsed)[0]
  assert.ok(entry && Array.isArray(entry.files), 'npm pack --json returned no file list')
  return new Set(entry.files.map((f) => f.path))
}

const packed = packedFiles()
const shipped = sourceLibFiles()

// 1. Completeness: nothing under lib/ may be filtered out.
const missing = shipped.filter((f) => !packed.has(f))
assert.deepEqual(
  missing,
  [],
  `tarball is missing ${missing.length} lib/ file(s) — fix \`files\` in package.json:\n` +
    missing.map((f) => `  - ${f}`).join('\n'),
)

// 2. Closure: follow relative imports from the packed modules; every target
//    must itself be packed. This is the ERR_MODULE_NOT_FOUND class of bug.
const IMPORT_RE = /(?:from\s*|import\s*\(\s*)(['"])(\.{1,2}\/[^'"]+)\1/g
const queue = ['lib/index.js', 'lib/client.js']
const seen = new Set()
const unresolved = []
while (queue.length > 0) {
  const rel = queue.pop()
  if (seen.has(rel)) continue
  seen.add(rel)
  if (!packed.has(rel)) {
    unresolved.push(`${rel} (imported, but not packed)`)
    continue
  }
  const source = readFileSync(path.join(ROOT, rel), 'utf8')
  for (const match of source.matchAll(IMPORT_RE)) {
    const target = path
      .relative(ROOT, path.resolve(path.dirname(path.join(ROOT, rel)), match[2]))
      .split(path.sep)
      .join('/')
    const targetPacked = [...packed].find(
      (p) => p === target || p === `${target}.js` || p === `${target}/index.js`,
    )
    if (targetPacked === undefined) {
      unresolved.push(`${rel} -> ${match[2]}`)
    } else {
      queue.push(targetPacked)
    }
  }
}
assert.deepEqual(
  unresolved,
  [],
  `packed modules import files that are not in the tarball:\n${unresolved
    .map((u) => `  - ${u}`)
    .join('\n')}`,
)

// 3. Package entry points and the bundle patch must ship too.
const manifest = JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf8'))
const exportTargets = Object.values(manifest.exports ?? {}).flatMap((value) =>
  typeof value === 'string' ? [value] : Object.values(value),
)
for (const target of [...exportTargets, manifest.dsh?.bundle?.patch].filter(Boolean)) {
  const rel = target.replace(/^\.\//, '')
  assert.ok(packed.has(rel), `package.json points at ${target}, which the tarball does not include`)
}

console.log(`✔ pack contents: ${shipped.length} lib/ files shipped, import graph closed`)
