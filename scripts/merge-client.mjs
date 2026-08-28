#!/usr/bin/env node
// Merge four client bundles into one dsh-minimal-UI-panels client bundle.
// Each source client.js is a `window.__ModuleLoader__.load({ id, factory })`
// file. We extract each factory body (everything between the factory arrow
// body and the trailing `return module.exports; });`) and wrap it as a
// function named by the plugin, executed inside the merged factory. Internal
// names (NS, components, helpers) stay scoped to their own function, so
// collisions are impossible. Each wrapped function receives the shared
// `react` / `react_jsx_runtime` bindings and returns its { apply, inject }.
//
// Usage:  node scripts/merge-client.mjs
// The source plugins are expected as SIBLING directories of this repo
// (../dsh-details-tabs, ../dsh-artifacts-panel, ../dsh-long-term-memory,
// ../dsh-terminal-notes). Output is written to ./lib/client.js.
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(HERE, '..') // repo root (scripts/ is a child)
const SRC = {
  detailsTabs: join(ROOT, '..', 'dsh-details-tabs', 'lib', 'client.js'),
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
 * dsh-minimal-UI-panels — Browser half (merged from four plugins).
 *
 * Registers the Blender-style details container (dsh-details-tabs) and the
 * artifacts / long-term-memory / terminal / notes panels. Each plugin's
 * original factory body is preserved verbatim inside its own scoped function
 * (detailsTabs, artifacts, ltm, terminalNotes) and applied in sequence by the
 * merged apply(). The container mounts first so the child panels find
 * the keyed child slot declared.
 */
window.__ModuleLoader__.load({
	id: "dsh-minimal-UI-panels",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react = require("react");
		let react_jsx_runtime = require("react/jsx-runtime");
${parts.join('\n')}
		function apply(ctx) {
			detailsTabs(react, react_jsx_runtime).apply(ctx);
			artifacts(react, react_jsx_runtime).apply(ctx);
			ltm(react, react_jsx_runtime).apply(ctx);
			terminalNotes(react, react_jsx_runtime).apply(ctx);
		}

		const inject = ["slots", "locale", "layout"];
		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});
`

writeFileSync(join(ROOT, 'lib', 'client.js'), merged)
console.log('✅ merged client written')
console.log('size:', merged.length, 'chars')
