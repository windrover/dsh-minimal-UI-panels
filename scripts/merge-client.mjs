#!/usr/bin/env node
// Merge the panel client bundles into one dsh-minimal-ui-panels client bundle.
// Each source client.js is a `window.__ModuleLoader__.load({ id, factory })`
// file. We extract each factory body (everything between the factory arrow
// body and the trailing `return module.exports; });`) and wrap it as a
// function named by the plugin, executed inside the merged factory. Internal
// names (NS, components, helpers) stay scoped to their own function, so
// collisions are impossible. Each wrapped function receives the shared
// `react` / `react_jsx_runtime` bindings and returns its { apply, inject }.
//
// The bundle used to merge four plugins because they all fought over the one
// `details` column: dsh-details-tabs owned it and the panels registered into
// its child slot. DSH 0.1.5 replaced that column with `rightbar`, where each
// panel registers its own tab type — so the container plugin is gone and the
// remaining three sources mount independently, with no slot contention left.
//
// Usage:  node scripts/merge-client.mjs [--check]
// The sources live IN THIS REPO, under src/<panel>/client.js. They used to be
// read from sibling checkouts of the three original plugin repos, which was a
// trap: those repos are archived on GitHub, so a source edit made only there —
// or worse, made directly in the generated lib/client.js — had no version
// control behind it at all. Vendoring them here is what makes the browser half
// reproducible from a clone.
// Output is written to ./lib/client.js.
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(HERE, '..') // repo root (scripts/ is a child)
const SRC = {
  artifacts: join(ROOT, 'src', 'artifacts', 'client.js'),
  ltm: join(ROOT, 'src', 'long-term-memory', 'client.js'),
  terminalNotes: join(ROOT, 'src', 'terminal-notes', 'client.js'),
}

// Fail loudly and specifically: a missing source is the one error whose old
// symptom was a *stale but valid* bundle (the sibling checkout silently
// disappeared and the merge kept emitting whatever it last read).
for (const [name, file] of Object.entries(SRC)) {
  if (!existsSync(file)) {
    console.error(`✗ merge-client: source "${name}" not found at ${file}`)
    console.error('  The panel sources are vendored in this repo under src/. Restore the file, or update SRC.')
    process.exit(1)
  }
}

function extractFactoryBody(file) {
  const text = readFileSync(file, 'utf8')
  // Find the start of the factory body: after "factory: (require) => {"
  const marker = 'factory: (require) => {'
  const idx = text.indexOf(marker)
  if (idx < 0) throw new Error(`no factory marker in ${file}`)
  let body = text.slice(idx + marker.length)
  // Trim the module/exports prologue lines.
  body = body.replace(/^\s*var module = \{ exports: \{\} \};\s*/, '')
  body = body.replace(/^\s*var exports = module\.exports;\s*/, '')
  body = body.replace(/^\s*Object\.defineProperty\(exports, Symbol\.toStringTag, \{ value: "Module" \}\);\s*/, '')
  // Replace react requires with the shared bindings passed as parameters.
  // Keep `react_jsx_runtime` referenced — the original bundles call
  // `react_jsx_runtime.jsx(...)` 75+ times; deleting its binding leaves it
  // undefined at render time (blank panels). The terminal-notes bundle uses
  // the CAPITAL `React` alias for hooks; we rewrite those references to the
  // lowercase `react` parameter so hooks resolve inside the scoped function.
  body = body.replace(/let react = require\("react"\);\s*/, '')
  body = body.replace(/let react_jsx_runtime = require\("react\/jsx-runtime"\);\s*/, '')
  body = body.replace(/let React = require\("react"\);\s*/, '')
  body = body.replace(/\bReact\./g, 'react.')
  // Drop every `exports.<name> = ...;` assignment: the original module's
  // export statements live inside the submodule function scope where no
  // `exports` binding exists (the prologue was stripped), so leaving them
  // would throw `ReferenceError: exports is not defined` at apply time and
  // blank every panel. The merged factory's own exports handle the surface.
  body = body.replace(/^\s*exports\.[A-Za-z_$][\w$]*\s*=\s*[^;]+;\s*$/gm, '')
  // The factory ends with "return module.exports;\n\t}\n});" — cut there.
  const endMarker = 'return module.exports;'
  const endIdx = body.indexOf(endMarker)
  if (endIdx >= 0) body = body.slice(0, endIdx)
  return body.trim()
}

const parts = []
for (const [key, file] of Object.entries(SRC)) {
  const body = extractFactoryBody(file)
  parts.push(`\t// ---- ${key} (merged from ${file.split('/').pop()}) ----\n\tfunction ${key}(react, react_jsx_runtime) {\n${body}\n\t\treturn { apply, inject };\n\t}\n`)
}

const merged = `/**
 * dsh-minimal-ui-panels — Browser half (merged from three plugins).
 *
 * Registers the artifacts / long-term-memory / terminal / notes panels as
 * right-Sidebar tab types. Each plugin's original factory body is preserved
 * verbatim inside its own scoped function (artifacts, ltm, terminalNotes) and
 * applied in sequence by the merged apply(). No container is needed any more:
 * DSH 0.1.5 replaced the single \`details\` column (which forced the merge in
 * the first place) with \`rightbar\`, where every panel owns its own tab kind
 * and body key, so the three sources mount independently.
 */
window.__ModuleLoader__.load({
	id: "dsh-minimal-ui-panels",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react = require("react");
		let react_jsx_runtime = require("react/jsx-runtime");
${parts.join('\n')}
		function apply(ctx) {
			artifacts(react, react_jsx_runtime).apply(ctx);
			ltm(react, react_jsx_runtime).apply(ctx);
			terminalNotes(react, react_jsx_runtime).apply(ctx);
		}

		const inject = ["slots", "locale", "sidebarRightTabs"];
		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});
`

// ── overwrite guard ─────────────────────────────────────────────────────────
// lib/client.js is a build artifact, but it is also the file people reach for
// first when they want to tweak a panel. A hand-edit made here lives nowhere
// else, and the next `node scripts/merge-client.mjs` silently destroys it —
// which is exactly how the artifacts panel's grouping/sorting labels were lost
// once. So: never overwrite quietly.
const OUT = join(ROOT, 'lib', 'client.js')
const CHECK_ONLY = process.argv.includes('--check')
let previous = null
try { previous = readFileSync(OUT, 'utf8') } catch { /* first run */ }

if (previous === merged) {
  console.log('✅ lib/client.js already up to date')
  process.exit(0)
}

if (previous !== null) {
  // Multiset difference, NOT an index-by-index walk: inserting one line shifts
  // every later line, so a positional compare reports thousands of "changes"
  // for a one-line edit and the warning stops meaning anything.
  const counts = (text) => {
    const map = new Map()
    for (const line of text.split('\n')) map.set(line, (map.get(line) ?? 0) + 1)
    return map
  }
  const before = counts(previous)
  const after = counts(merged)
  let added = 0
  let removed = 0
  for (const [line, n] of after) added += Math.max(0, n - (before.get(line) ?? 0))
  for (const [line, n] of before) removed += Math.max(0, n - (after.get(line) ?? 0))
  console.error(`⚠  lib/client.js would change: +${added} / -${removed} lines (${previous.split('\n').length} → ${merged.split('\n').length}).`)
  console.error('   Any hand-edit made directly in lib/client.js is about to be discarded.')
  console.error('   Port it into src/<panel>/client.js first — that is the copy this script reads, and the only one under version control.')
}

if (CHECK_ONLY) {
  console.error('✗ --check: lib/client.js is stale; regenerate with `node scripts/merge-client.mjs`.')
  process.exit(1)
}

writeFileSync(OUT, merged)
console.log('✅ merged client written')
console.log('size:', merged.length, 'chars')
