# dsh-minimal-UI-panels

> [English](./README.md) · [中文](./README.zh-CN.md)

<p>
  <a href="https://github.com/windrover/dsh-minimal-UI-panels"><img src="https://img.shields.io/badge/version-0.2.0-blue" alt="version"></a>
  <a href="https://github.com/windrover/dsh-minimal-UI-panels/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-MIT-green" alt="license"></a>
  <a href="https://github.com/windrover/dsh-minimal-UI-panels"><img src="https://img.shields.io/badge/platform-DeepSeek%20Harness-9cf" alt="platform"></a>
  <img src="https://img.shields.io/badge/status-active-brightgreen" alt="status">
  <img src="https://img.shields.io/badge/panels-4-ff69b4" alt="panels">
</p>

> All-in-one DeepSeek Harness UI panels — one bundle, one loader row: artifacts, long-term memory, terminal, and notes as right-Sidebar tab types.

`dsh-minimal-UI-panels` merges three formerly separate DSH plugins into a single package mounted as **one loader row**. Each panel registers as a **tab type** (`ctx.sidebarRightTabs`) on `@deepseek-ai/dsh-client-ui-sidebar-right` and opens as a tab in the right Sidebar. It also ships the host-side tools/routes — plug and play.

> **DSH 0.1.5 changed the architecture**: the third-party-occupiable `details` column is gone, replaced by `rightbar` and owned by the shipped right Sidebar (docking kit + tab-type registry). This package's 0.2.0 release completes that migration — there is no self-drawn multi-panel container any more.

## ✨ Features

| Panel / capability | Description |
|---|---|
| **Right-Sidebar tab types** | Every panel registers as a tab type: docking, floating, splitting, drag-reordering and strip-close all come from the shipped docking kit. The way in is the strip's add control → the guide page → a capsule, which calls `openTab(kind)` |
| **Artifacts panel** | Scans workspace artifact files, groups/sorts by type/date/size/line count; syntax-highlighted code/config/data previews; inline base64 image previews (4 MiB cap); mp4/m4v/webm/ogv video streaming (Range requests) |
| **Long-term memory panel** | View/add/search/edit memory across three scopes (user/global/workspace); tag grouping; content highlighting; pairs with `memory_*` tools and the `/memory` command |
| **Terminal panel** | A dark-themed bash command runner (`bash -lc`), output collected and returned; common-command hints stay pinned below |
| **Notes panel** | Apple-Notes-style multi-note scratchpad: sidebar list + editor, create/delete, autosave (600 ms debounce), auto-title from the first line, stored at `~/.dsh/notes.json` |

## 📸 Screenshots

The four panels (Artifacts / Long-term memory / Notes / Terminal):

> ⚠️ The shot below shows the 0.1.x self-drawn `details` container. From 0.2.0 the panels live in the shipped right Sidebar, so the strip, split and float controls look like DSH's own.

<img src="docs/screenshot.png" alt="panels" width="460">

## 📦 Install

This plugin mounts as a **local link dependency** (consistent with other DSH local plugins).

### 1. Clone the repo

Pick a directory and clone it:

```bash
git clone https://github.com/windrover/dsh-minimal-UI-panels.git
# → <your-path>/dsh-minimal-UI-panels
```

### 2. Register it in your DSH profile

Edit `~/.dsh/profiles/web/package.json`. Set `link:` to **your clone path** (`<your-path>` is wherever you ran the clone):

```jsonc
{
  "dependencies": {
    "dsh-minimal-ui-panels": "link:<your-path>/dsh-minimal-UI-panels"
  },
  "dsh": {
    "profile": {
      "bundles": [
        "@deepseek-ai/dsh-base",
        "@deepseek-ai/dsh-web-app",
        "dsh-minimal-ui-panels"
      ]
    }
  }
}
```

> Replace `<your-path>` with the absolute path to the cloned folder, e.g. `link:/Users/me/dev/dsh-minimal-UI-panels`.
> The directory may keep its capitalised name (`dsh-minimal-UI-panels`) — **the directory name does not matter**; the identity that counts is `package.json`'s `name`.

### 3. Establish the link

```bash
cd ~/.dsh/profiles/web && pnpm install
```

### 4. Restart dsh web

**Ctrl+C to quit → run `dsh web` again → refresh the browser**. The loader scans profile bundles at startup, so the new code takes effect.

> If you previously mounted the old plugins, remove them from `dsh.profile.bundles` (this package supersedes them); also clean any stale rows in `~/.dsh/cordis.patch.yml` (e.g. `- id: artifacts-panel`) to avoid `patch: entry ... not found` warnings.

## 🖥 Usage

- Open a session → the right Sidebar (the expand button in the conversation header) → the strip's add control → the **guide page** → pick **Artifacts / Long-term memory / Terminal / Notes**. Panels open as tabs and can be dragged, split, or floated.
- **Terminal**: type a command and press Enter (`bash -lc`); output shows in the lower half; common-command hints stay pinned.
- **Notes**: click **New** to create an entry; drag the sidebar divider to resize; clicking a title auto-hides the list to focus the editor; the toolbar toggle shows/hides the list manually.
- **`/memory`** command (host side): `/memory list|search|get|forget|export`.
- Host-side model tools: `memory_*` (write/recall/list/forget/export/import/correct/batch/diagnose) and `artifacts_list`.

## 🏗 Architecture

```
dsh-minimal-UI-panels  (one loader row / one package)
│
├── lib/index.js  ── Host half 【thin composition entry】
│   └── import + invoke in order:
│       ├── lib/host/ltm.js               ← original dsh-long-term-memory (verbatim)
│       │     └── store.js / threats.js / llm.js / automation.js
│       ├── lib/host/artifacts.js         ← original dsh-artifacts-panel (verbatim)
│       └── lib/host/terminal-notes.js    ← original dsh-terminal-notes (verbatim)
│       inject = tools, systemPrompt, commands, settings, agents,
│                webServer, workspaceRegistry, subprocess, fs
│
└── lib/client.js  ── Browser half 【single merged bundle = scripts/merge-client.mjs】
    ├── function artifacts(react, react_jsx_runtime)      ← original dsh-artifacts-panel factory body
    ├── function ltm(react, react_jsx_runtime)            ← original dsh-long-term-memory factory body
    └── function terminalNotes(react, react_jsx_runtime)  ← original dsh-terminal-notes factory body
        each fn returns { apply, inject }
    └── function apply(ctx)   ← main entry, calls each fn's apply in order
        exports.inject = ["slots", "locale", "sidebarRightTabs"]

Right-Sidebar tab types (each then registers a body under its own id in the
sidebar.right.pane.tab seat):
    dsh-minimal-ui-panels/artifacts          kind "artifacts"
    dsh-minimal-ui-panels/long-term-memory   kind "long-term-memory"
    dsh-minimal-ui-panels/terminal           kind "terminal"
    dsh-minimal-ui-panels/notes              kind "notes"

Host tools/routes: memory_*(9) + artifacts_list, /api/artifacts/*, /api/terminal-notes/*
```

Merge pipeline (see `scripts/merge-client.mjs`):

```
dsh-artifacts-panel/lib/client.js ─┐
dsh-long-term-memory/lib/client.js ├─ extract factory body → rewrite react/react_jsx_runtime
dsh-terminal-notes/lib/client.js  ─┘   bindings, strip inner exports. statements
                                           │
                                           ▼
                            lib/client.js  (single __ModuleLoader__.load bundle)
```

> ⚠️ **Key contract: three names must match byte for byte** (here the lowercase `dsh-minimal-ui-panels`)
>
> 1. `insert.name` in `cordis.patch.yml`
> 2. the `__ModuleLoader__.load({ id })` in `lib/client.js`
> 3. `package.json`'s `name`
>
> Why: `dsh-client-modules`' `nearestPackage()` walks up from the module path the Loader row resolved and **only accepts the `package.json` whose `name` strictly equals that specifier**; `arrive()` then asserts `factories.has(row.id)`. A case mismatch anywhere in that chain makes **the entire browser half silently miss `window.__DSH_BOOT__`** while the host half (tools/routes) keeps working — exactly the state that reads as "the plugin is running".
>
> That was the last hidden bug in 0.1.x: `package.json` had already gone lowercase, but `cordis.patch.yml` and the client bundle still said `UI`. The directory's own casing is irrelevant; **`package.json`'s `name` is the source of truth**.

### Why the multi-panel container is gone

The old four plugins had to be merged because they all fought over the one `details` slot. After DSH 0.1.5 moved to `rightbar`, each panel registers **its own tab kind and body key**, so they no longer contend — the container role belongs to the shipped right Sidebar. This package therefore dropped `dsh-details-tabs` (~1100 lines) along with its self-drawn layout persistence and DockRail.

## 🌐 Host routes

Unchanged from the originals:

| Method | Path | Description |
|---|---|---|
| POST | `/api/artifacts/scan` | Scan a directory |
| GET | `/api/artifacts/read` | Read file preview |
| GET | `/api/artifacts/media` | Video stream (Range support) |
| POST | `/api/terminal-notes/exec` | Run a bash command |
| GET/POST | `/api/terminal-notes/notes` | List / create notes |
| GET/POST | `/api/terminal-notes/note` | Read / save one note |
| POST | `/api/terminal-notes/note-delete` | Delete a note |

## 🛠 Development & verification

- Always run the precheck after changing code (DSH plugin workflow):

  ```bash
  bash ~/.dsh/dsh-plugin-precheck.sh web --tests
  ```

  It runs: plugin-tree load (`--dump-config`) + `node --check` per plugin + client bundle mock-load contract assertions + this repo's unit tests. **Restart only after it passes**; if you're locked out, use `~/.dsh/dsh-safe-start.sh` for a safe boot.

- This repo's contract test `test/client-contract.test.mjs` goes further than the precheck: it **actually runs `apply(ctx)`** against a stub context and pins the four tab types (id/kind/priority/guide entry), the four `sidebar.right.pane.tab` bodies, and the fact that a panel's ✕ closes its own tab:

  ```bash
  node test/client-contract.test.mjs
  ```

- The browser half is generated by the in-repo script:

  ```bash
  node scripts/merge-client.mjs
  ```

  It reads the three original plugins (as **sibling directories** `../dsh-{artifacts-panel,long-term-memory,terminal-notes}/lib/client.js`), extracts each factory body, rewrites the react / `react_jsx_runtime` bindings, strips inner `exports.` statements, and writes `lib/client.js`. After regenerating, verify: `react_jsx_runtime` is defined, no stale `exports.` remains in the submodules, and the `__ModuleLoader__.load` id equals `package.json`'s `name`.

- Data locations: long-term memory `~/.dsh/dsh-memory/{global,user}.jsonl`, workspace `.dsh/memory.jsonl`; notes `~/.dsh/notes.json`.

## 🔒 Notes

- Notes are stored as a single JSON document (the fs service offers no unlink primitive; a single atomic JSON rewrite is more reliable).
- The panels no longer draw any column width or layout of their own: docking, floating, splitting and sizing all belong to the shipped `dsh-client-ui-sidebar-right` docking kit. Upgrading dsh can no longer clobber a layout patch from this package, because there is no longer one to clobber.
- This package's services/routes/tools are registered on the calling fiber's lifecycle; stopping or hot-reloading removes every side effect.
