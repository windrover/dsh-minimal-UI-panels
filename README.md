# dsh-minimal-UI-panels

All-in-one DeepSeek Harness UI plugin — merged from four plugins into one
bundle and one loader row:

| Original plugin | Contributes |
|---|---|
| dsh-details-tabs | Blender-style multi-panel right details column (the container that owns the `details` slot and renders panels in side-by-side splits) |
| dsh-artifacts-panel | 产物面板 (artifacts panel) + `artifacts_list` tool + `/api/artifacts/*` routes |
| dsh-long-term-memory | 长期记忆面板 + `memory_*` tools + `/memory` command + per-assembly injection + settings card |
| dsh-terminal-notes | 终端面板 (bash runner) + 记事本面板 (multi-note, `~/.dsh/notes.json`) |

## Layout

- Host half (`lib/index.js`) composes the three host logics verbatim
  (`lib/host/*.js`) — exact internal APIs, no rewrites.
- Browser half (`lib/client.js`) wraps each plugin's original factory body in
  its own scoped function (`detailsTabs`, `artifacts`, `ltm`, `terminalNotes`)
  and applies them in sequence; the container mounts first so child panels
  find `details.tabs.item` declared.

## Install

```jsonc
// ~/.dsh/profiles/web/package.json
"dependencies": {
  "dsh-minimal-ui-panels": "link:/Users/Haoguangxing/Documents/DSH/dsh-minimal-UI-panels"
},
"dsh": { "profile": { "bundles": [ /* ... */, "dsh-minimal-ui-panels" ] } }
```

Then restart `dsh web`. Remove the four original plugins from the bundles
list (they are superseded by this single row).

## Routes (unchanged from originals)

- `/api/artifacts/scan` · `/api/artifacts/read` · `/api/artifacts/media`
- `/api/terminal-notes/exec` · `/api/terminal-notes/notes` ·
  `/api/terminal-notes/note` · `/api/terminal-notes/note-delete`
