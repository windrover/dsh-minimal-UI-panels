# Browser-half sources

These four files are the **source of truth** for the browser half of this
package. `lib/client.js` is generated from them by
`../scripts/merge-client.mjs` — never edit the generated file, or the next
merge will discard your change.

```
src/composite/client.js         → function composite(react, react_jsx_runtime, panels)
src/artifacts/client.js         → function artifacts(react, react_jsx_runtime, panels)
src/long-term-memory/client.js  → function ltm(react, react_jsx_runtime, panels)
src/terminal-notes/client.js    → function terminalNotes(react, react_jsx_runtime, panels)
```

## The `panels` hand-off

The merge passes one shared registry into every fragment as its third argument.
The three panel fragments **write** their component into it; the composite
**reads** it to build its tab bodies:

```js
panels.artifacts      = { Component, ns, titleKey, t }   // src/artifacts
panels.longTermMemory = { Component, ns, titleKey, t }   // src/long-term-memory
panels.terminal       = { Component, ns, titleKey, t }   // src/terminal-notes
panels.notes          = { Component, ns, titleKey, t }   // src/terminal-notes
```

`t` is each panel's own namespace-bound translator, so the composite can draw a
panel's title without knowing which namespace it came from. **Order matters**:
the composites run last, after the registry is filled.

Two consequences worth knowing before editing:

- A fragment is **not independently loadable any more** — it references the
  `panels` parameter, which only the merged wrapper provides. `node --check`
  still passes (it is just an identifier), so nothing catches a stray
  standalone load; the merged bundle is the only thing DSH ever loads.
- Each fragment must **stop at contributing a panel**. Registering a tab type
  itself is the composite's job; a second registrar would double the guide page
  and leave the bundle with tab types nobody renders.

## What the composite owns

`src/composite/client.js` holds every right-Sidebar registration:

| tab kind | title | halves (top / bottom) |
|---|---|---|
| `artifacts-terminal` | 产物 + 终端 | `panels.artifacts` / `panels.terminal` |
| `memory-notes` | 长期记忆 + 记事本 | `panels.longTermMemory` / `panels.notes` |

Two panels per tab, stacked vertically with a draggable divider whose split is
remembered per pairing. Stacking (not a 2×2 grid) is what makes a pairing usable
in one narrow Sidebar pane — and it means **two panes side by side show all four
panels at once**, which is the point of pairing. Regrouping the panels is a
change to the `PAIRS` array in that file, and nothing else.

## Why they live here

Each panel file began as the `lib/client.js` of a separate plugin repo
(`dsh-artifacts-panel`, `dsh-long-term-memory`, `dsh-terminal-notes`). The
merge used to read them from **sibling checkouts** of those repos. That was a
trap: all three repos were archived on GitHub (read-only, `git push` → 403), so
a source edit had no version control behind it, and an edit made directly in
the generated `lib/client.js` was destroyed by the next merge with no way to
recover it — which is exactly how the artifacts panel's toolbar labels were
lost once. Vendoring them here makes the browser half reproducible from a
clone of this repo alone.

`dsh-details-tabs` is **not** among the sources. It owned the single `details`
column that every panel used to fight over; DSH 0.1.5 replaced that column with
`rightbar`, and the container role now belongs to the shipped right Sidebar.

## Editing

1. Change the relevant `src/<fragment>/client.js`.
2. `node scripts/merge-client.mjs` (or `--check` in CI to catch a stale bundle).
3. `node test/client-contract.test.mjs` — it runs `apply(ctx)` for real and pins
   the two tab types, their guide entries, both halves of each body, the
   per-panel translators and the draggable divider.
4. Restart `dsh web` (the client bundle is served from disk at boot).

The fragments keep the shape of a DSH client plugin — a
`window.__ModuleLoader__.load({ id, factory })` wrapper around an
`{ apply, inject }` module — so they stay diffable against upstream.
`merge-client.mjs` extracts the factory body from each and rewrites the
`react` / `react_jsx_runtime` bindings.
