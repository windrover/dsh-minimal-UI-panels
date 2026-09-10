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
// Usage:  node scripts/merge-client.mjs
// The source plugins are expected as SIBLING directories of this repo
// (../dsh-artifacts-panel, ../dsh-long-term-memory, ../dsh-terminal-notes).
// Output is written to ./lib/client.js.
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(HERE, '..') // repo root (scripts/ is a child)
const SRC = {
  artifacts: join(ROOT, '..', 'dsh-artifacts-panel', 'lib', 'client.js'),
  ltm: join(ROOT, '..', 'dsh-long-term-memory', 'lib', 'client.js'),
  terminalNotes: join(ROOT, '..', 'dsh-terminal-notes', 'lib', 'client.js'),
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
  const before = previous.split('\n')
  const after = merged.split('\n')
  let changed = 0
  for (let i = 0; i < Math.max(before.length, after.length); i += 1) if (before[i] !== after[i]) changed += 1
  console.error(`⚠  lib/client.js would change (${changed} differing lines, ${before.length} → ${after.length} lines).`)
  console.error('   Any hand-edit made directly in lib/client.js is about to be discarded.')
  console.error('   Port it into the source repo under ../dsh-*/lib/client.js first — that is the only copy that survives.')
}

if (CHECK_ONLY) {
  console.error('✗ --check: lib/client.js is stale; regenerate with `node scripts/merge-client.mjs`.')
  process.exit(1)
}

writeFileSync(OUT, merged)
console.log('✅ merged client written')
console.log('size:', merged.length, 'chars')
