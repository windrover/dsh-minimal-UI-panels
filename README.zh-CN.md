# dsh-minimal-UI-panels

> [English](./README.md) · [中文](./README.zh-CN.md)

<p>
  <a href="https://github.com/windrover/dsh-minimal-UI-panels"><img src="https://img.shields.io/badge/version-0.2.0-blue" alt="version"></a>
  <a href="https://github.com/windrover/dsh-minimal-UI-panels/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-MIT-green" alt="license"></a>
  <a href="https://github.com/windrover/dsh-minimal-UI-panels"><img src="https://img.shields.io/badge/platform-DeepSeek%20Harness-9cf" alt="platform"></a>
  <img src="https://img.shields.io/badge/status-active-brightgreen" alt="status">
  <img src="https://img.shields.io/badge/panels-4-ff69b4" alt="panels">
</p>

> All-in-one DeepSeek Harness UI panels — 一个 bundle、一个 loader 行，把产物 / 长期记忆 / 终端 / 记事本注册为右侧栏标签页类型。

`dsh-minimal-UI-panels` 把三个原本独立的 DSH 插件合并为一个包，并以**单 loader 行**挂载。每个面板注册为 `@deepseek-ai/dsh-client-ui-sidebar-right` 的一个**标签页类型**（`ctx.sidebarRightTabs`），在右侧栏中以标签页打开；同时提供宿主侧工具/路由，即插即用。

> **DSH 0.1.5 起架构已变**：旧版那个可被第三方占用的 `details` 列已被 `rightbar` 取代，由官方右侧栏（docking kit + 标签类型注册表）接管。本包 0.2.0 完成该迁移——不再有自绘的多面板容器。

## ✨ 功能一览

| 面板 / 能力 | 说明 |
|---|---|
| **右侧栏标签页类型** | 每个面板注册为一个标签页类型：停靠 / 浮动 / 分屏、拖动重排、标签条关闭全部由官方 docking kit 提供。入口是右侧栏标签条的「+」→ guide 页，点胶囊即以 `openTab(kind)` 打开 |
| **产物面板** | 扫描工作区产物文件，按类型/日期/体积/行数分组排序；代码/配置/数据预览语法高亮；图片 base64 预览（4 MiB 上限）；mp4/m4v/webm/ogv 视频流式播放（支持 Range 请求） |
| **长期记忆面板** | 三作用域（user/global/workspace）记忆的查看、新增、搜索、编辑；标签分组；内容高亮；配套 `memory_*` 工具与 `/memory` 命令 |
| **终端面板** | 深色终端外观的 bash 命令执行器（`bash -lc`），输出收集后返回，下方常驻常用命令提示 |
| **记事本面板** | Apple 便签风格多条目记事：侧边列表 + 正文编辑、新建/删除、自动保存（600ms 防抖）、按首行自动命名，存储于 `~/.dsh/notes.json` |

## 📸 截图

产物 / 长期记忆 / 记事本 / 终端四个面板：

> ⚠️ 下图拍的是 0.1.x 的自绘 `details` 多面板栏；0.2.0 起面板改由官方右侧栏承载，标签条、分屏与浮动控件的外观以 DSH 自带为准。

<img src="docs/screenshot.png" alt="面板效果" width="460">

## 📦 安装

本插件以**本地 link 依赖**挂载（与 DSH 本地插件一致）。

### 1. 克隆仓库

选一个目录并克隆：

```bash
git clone https://github.com/windrover/dsh-minimal-UI-panels.git
# → <你的路径>/dsh-minimal-UI-panels
```

### 2. 在 DSH profile 中登记

编辑 `~/.dsh/profiles/web/package.json`，把 `link:` 改成**你自己的克隆路径**（`<你的路径>` 是你克隆到的目录）：

```jsonc
{
  "dependencies": {
    "dsh-minimal-ui-panels": "link:<你的路径>/dsh-minimal-UI-panels"
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

> 把 `<你的路径>` 换成克隆目录的绝对路径，例如 `link:/Users/me/dev/dsh-minimal-UI-panels`。
> 目录名可以带大写（如 `dsh-minimal-UI-panels`）——**目录名不影响加载**，真正起作用的 identity 是 `package.json` 的 `name`。

### 3. 建立 link

```bash
cd ~/.dsh/profiles/web && pnpm install
```

### 4. 重启 dsh web

**Ctrl+C 退出 → 重新 `dsh web` → 浏览器刷新**。loader 启动时扫描 profile bundles，新代码即生效。

> 若你之前挂载过那几个旧插件，请从 `dsh.profile.bundles` 列表移除它们（本包已取代）；同时清理 `~/.dsh/cordis.patch.yml` 中残留的旧行（如 `- id: artifacts-panel`），避免 `patch: entry ... not found` 告警。

## 🖥 使用

- 打开任意会话 → 右侧栏（对话区右上角的展开按钮）→ 点标签条的「+」打开 **guide 页** → 选择**产物 / 长期记忆 / 终端 / 记事本**。面板以标签页打开，可拖动重排、分屏或浮动。
- **终端**：输入命令回车执行（`bash -lc`），输出展示在下半区，常用命令提示常驻。
- **记事本**：点「新建」创建条目，左侧列表可拖动分隔条调宽，点击标题自动隐藏列表聚焦正文，工具栏可手动显示/隐藏列表。
- **`/memory`** 命令（宿主侧）：`/memory list|search|get|forget|export` 管理长期记忆。
- 宿主侧还提供模型工具：`memory_*`（write/recall/list/forget/export/import/correct/batch/diagnose）与 `artifacts_list`。

## 🏗 架构

```
dsh-minimal-UI-panels  (一个 loader 行 / 一个包)
│
├── lib/index.js  ── 宿主半身【薄组合入口】
│   └── import + 按序调用:
│       ├── lib/host/ltm.js              ← 原 dsh-long-term-memory（一字不改）
│       │     └── store.js / threats.js / llm.js / automation.js
│       ├── lib/host/artifacts.js        ← 原 dsh-artifacts-panel（一字不改）
│       └── lib/host/terminal-notes.js   ← 原 dsh-terminal-notes（一字不改）
│       inject = tools, systemPrompt, commands, settings, agents,
│                webServer, workspaceRegistry, subprocess, fs
│
└── lib/client.js  ── 浏览器半身【合并单 bundle = scripts/merge-client.mjs 生成】
    ├── function artifacts(react, react_jsx_runtime)     ← 原 dsh-artifacts-panel factory 体
    ├── function ltm(react, react_jsx_runtime)           ← 原 dsh-long-term-memory factory 体
    └── function terminalNotes(react, react_jsx_runtime) ← 原 dsh-terminal-notes factory 体
        每个 fn 末尾 return { apply, inject }
    └── function apply(ctx)   ← 主入口，依次调用 3 个 fn 的 apply
        exports.inject = ["slots", "locale", "sidebarRightTabs"]

右侧栏标签页类型（每个类型再在 sidebar.right.pane.tab 槽下按自己的 id 注册 body）：
    dsh-minimal-ui-panels/artifacts          kind "artifacts"
    dsh-minimal-ui-panels/long-term-memory   kind "long-term-memory"
    dsh-minimal-ui-panels/terminal           kind "terminal"
    dsh-minimal-ui-panels/notes              kind "notes"

宿主工具/路由: memory_*(9) + artifacts_list, /api/artifacts/*, /api/terminal-notes/*
```

合并流程（详见 `scripts/merge-client.mjs`）：

```
dsh-artifacts-panel/lib/client.js ─┐
dsh-long-term-memory/lib/client.js ├─ 提取 factory 体 → 改写 react/react_jsx_runtime
dsh-terminal-notes/lib/client.js  ─┘   绑定、删除子模块内 exports. 语句
                                           │
                                           ▼
                            lib/client.js  (单 __ModuleLoader__.load bundle)
```

> ⚠️ **关键约定：三处名字必须逐字节一致**（本包为小写 `dsh-minimal-ui-panels`）
>
> 1. `cordis.patch.yml` 里 `insert.name`
> 2. `lib/client.js` 里 `__ModuleLoader__.load({ id })`
> 3. `package.json` 的 `name`
>
> 机制：`dsh-client-modules` 的 `nearestPackage()` 从 Loader 行解析出的模块路径逐级向上找 `package.json`，**只接受 `name === 该 specifier` 的那一个**；随后 `arrive()` 再断言 `factories.has(row.id)`。任一环大小写不一致，**整个浏览器半身会静默地不进 `window.__DSH_BOOT__`**——而宿主半（工具/路由）照常工作，极易误判成「插件在跑」。
>
> 这正是 0.1.x 遗留的隐藏 bug：`package.json` 早已改成小写，但 `cordis.patch.yml` 与 client bundle 仍写着大写 `UI`。目录名带不带大写无关紧要，**一切以 `package.json` 的 `name` 为准**。

### 为什么不再需要「多面板容器」

旧版四个插件必须合并，是因为它们都要抢同一个 `details` 单槽。DSH 0.1.5 换成 `rightbar` 之后，每个面板注册**自己的 tab kind 与 body key**，彼此不再竞争——容器这个角色由官方右侧栏接管，本包因此删掉了 `dsh-details-tabs`（约 1100 行）及其自绘的布局持久化 / DockRail。

## 🌐 宿主路由

与各原插件一致，未作变更：

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/api/artifacts/scan` | 扫描目录 |
| GET | `/api/artifacts/read` | 读文件预览 |
| GET | `/api/artifacts/media` | 视频流（支持 Range） |
| POST | `/api/terminal-notes/exec` | 执行 bash 命令 |
| GET/POST | `/api/terminal-notes/notes` | 列出 / 新建记事 |
| GET/POST | `/api/terminal-notes/note` | 读 / 存单条记事 |
| POST | `/api/terminal-notes/note-delete` | 删除记事 |

## 🛠 开发与验证

- 改代码后先跑预检（DSH 插件工作流）：

  ```bash
  bash ~/.dsh/dsh-plugin-precheck.sh web --tests
  ```

  预检会做：宿主插件树加载（`--dump-config`）+ 各插件 `node --check` + 客户端 bundle mock 装载契约断言 + 本仓库单元测试。**通过后才允许重启**；进不去时用 `~/.dsh/dsh-safe-start.sh` 安全启动。

- 本包的契约测试 `test/client-contract.test.mjs` 比预检更进一步：它在桩环境里**真正执行 `apply(ctx)`**，断言 4 个 tab 类型（id/kind/priority/guide 条目）、4 个 `sidebar.right.pane.tab` body，以及面板 ✕ 关闭的是自己那个 tab：

  ```bash
  node test/client-contract.test.mjs
  ```

- 浏览器半身由仓库内脚本生成：

  ```bash
  node scripts/merge-client.mjs
  ```

  它会读取三个原始插件（作为本仓库的**兄弟目录** `../dsh-{artifacts-panel,long-term-memory,terminal-notes}/lib/client.js`），提取 factory 体、改写 react/`react_jsx_runtime` 绑定、删除子模块内 `exports.` 语句，输出 `lib/client.js`。重新生成后务必核对：`react_jsx_runtime` 有定义、子模块无残留 `exports.`、`__ModuleLoader__.load` 的 id 与 `package.json` 的 `name` 一致。

- 数据位置：长期记忆 `~/.dsh/dsh-memory/{global,user}.jsonl`、工作区 `.dsh/memory.jsonl`；记事本 `~/.dsh/notes.json`。

## 🔒 注意事项

- 记事本存储为单 JSON 文档（fs 服务无 unlink 原语，单文件原子重写更可靠）。
- 面板不再自绘任何栏宽/布局；停靠、浮动、分屏与宽度都由官方 `dsh-client-ui-sidebar-right` 的 docking kit 决定。升级 dsh 不会再冲掉本包的布局改动（因为已经没有这类改动）。
- 本包仅动态注册的服务/路由/工具随 fiber 生命周期；停止或热更新会移除全部副作用。
