# Panel sources (browser half)

These three files are the **source of truth** for the browser half of this
package. `lib/client.js` is generated from them by
`../scripts/merge-client.mjs` — never edit the generated file, or the next
merge will discard your change.

```
src/artifacts/client.js         → function artifacts(react, react_jsx_runtime)
src/long-term-memory/client.js  → function ltm(react, react_jsx_runtime)
src/terminal-notes/client.js    → function terminalNotes(react, react_jsx_runtime)
```

## Why they live here

Each file began as the `lib/client.js` of a separate plugin repo
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
`rightbar`, where each panel registers its own tab type and body key, so no
container is needed and the plugin was dropped from the merge.

## Editing

1. Change the relevant `src/<panel>/client.js`.
2. `node scripts/merge-client.mjs` (or `--check` in CI to catch a stale bundle).
3. `node test/client-contract.test.mjs` — it runs `apply(ctx)` for real and
   pins the four tab types, their guide entries, their bodies and the
   self-closing close control.
4. Restart `dsh web` (the client bundle is served from disk at boot).

The files keep their original shape — a `window.__ModuleLoader__.load({ id,
factory })` wrapper around a `{ apply, inject }` module, exactly as a DSH client
plugin is built. `merge-client.mjs` extracts the factory body from each and
rewrites the `react` / `react_jsx_runtime` bindings, so each file stays
independently valid and diffable against upstream.
