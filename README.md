# dsh-minimal-UI-panels

> All-in-one DeepSeek Harness UI panels — 一个 bundle、一个 loader 行，包含右侧多面板详情栏 + 产物 + 长期记忆 + 终端 + 记事本。

`dsh-minimal-UI-panels` 把四个原本独立的 DSH 插件合并为一个包，并以**单 loader 行**挂载，避免多个插件互相抢占 `details` 槽。它同时提供宿主侧工具/路由与浏览器侧面板 UI，即插即用。

## ✨ 功能一览

| 面板 / 能力 | 说明 |
|---|---|
| **多面板详情栏容器** | 把右侧 `details` 栏变成 Blender 风格的多面板并列容器：左右/上下分割、拖动分隔条、拖拽合并/替换/关闭、面板条（chip）点击切换、DockRail 快速导航 |
| **产物面板** | 扫描工作区产物文件，按类型/日期/体积/行数分组排序；代码/配置/数据预览语法高亮；图片 base64 预览（4 MiB 上限）；mp4/m4v/webm/ogv 视频流式播放（支持 Range 请求） |
| **长期记忆面板** | 三作用域（user/global/workspace）记忆的查看、新增、搜索、编辑；标签分组；内容高亮；配套 `memory_*` 工具与 `/memory` 命令 |
| **终端面板** | 深色终端外观的 bash 命令执行器（`bash -lc`），输出收集后返回，下方常驻常用命令提示 |
| **记事本面板** | Apple 便签风格多条目记事：侧边列表 + 正文编辑、新建/删除、自动保存（600ms 防抖）、按首行自动命名，存储于 `~/.dsh/notes.json` |

## 🧩 合并来源

| 原插件 | 贡献 |
|---|---|
| dsh-details-tabs | 多面板 details 容器（占据 `details` 槽，声明 `details.tabs.item` 子槽） |
| dsh-artifacts-panel | 产物面板 + `artifacts_list` 工具 + `/api/artifacts/*` 路由 |
| dsh-long-term-memory | 长期记忆面板 + `memory_*` 工具 + `/memory` 命令 + 每轮注入 + 设置卡片 |
| dsh-terminal-notes | 终端 + 记事本面板 + `/api/terminal-notes/*` 路由 |

> 原三个独立仓库（details-tabs / artifacts-panel / long-term-memory）已归档为只读（archived），功能全部并入本包。

## 📦 安装

本包以本地 link 依赖挂载（与 DSH 本地插件一致）。编辑 `~/.dsh/profiles/web/package.json`：

```jsonc
{
  "dependencies": {
    "dsh-minimal-ui-panels": "link:/Users/Haoguangxing/Documents/DSH/dsh-minimal-UI-panels"
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

然后在 profile 目录执行一次 pnpm 安装以建立 link：

```bash
cd ~/.dsh/profiles/web && pnpm install
```

最后重启 dsh web：**Ctrl+C 退出 → 重新 `dsh web` → 浏览器刷新**。loader 启动时扫描 profile bundles，新代码即生效。

> 若你之前挂载过那几个旧插件，请从 `dsh.profile.bundles` 列表移除它们（本包已取代）；同时清理 `~/.dsh/cordis.patch.yml` 中残留的旧行（如 `- id: artifacts-panel`），避免 `patch: entry ... not found` 告警。

## 🖥 使用

- 打开任意会话，点击右侧面板条的 chip 切换**产物 / 长期记忆 / 终端 / 记事本**。
- **终端**：输入命令回车执行（`bash -lc`），输出展示在下半区，常用命令提示常驻。
- **记事本**：点「新建」创建条目，左侧列表可拖动分隔条调宽，点击标题自动隐藏列表聚焦正文，工具栏可手动显示/隐藏列表。
- **`/memory`** 命令（宿主侧）：`/memory list|search|get|forget|export` 管理长期记忆。
- 宿主侧还提供模型工具：`memory_*`（write/recall/list/forget/export/import/correct/batch/diagnose）与 `artifacts_list`。

## 🏗 架构

- **宿主半身** `lib/index.js` — 薄组合入口：仅 `import { apply as applyX } from './host/x.js'` 并按序调用，`inject` 为各逻辑所需服务的并集（`tools, systemPrompt, commands, settings, agents, webServer, workspaceRegistry, subprocess, fs`）。各宿主逻辑从原插件**逐字拷贝**（`lib/host/{ltm,artifacts,terminal-notes}.js` + `store/threats/llm/automation` 辅助文件），保证内部 API 精确无损。
- **浏览器半身** `lib/client.js` — 把各原插件的 `__ModuleLoader__.load` factory 体封装为独立作用域函数（`detailsTabs` / `artifacts` / `ltm` / `terminalNotes`），接收共享的 `react`、`react_jsx_runtime`，末尾 `return { apply, inject }`；主 `apply` 按序调用（容器先挂载，子面板再注册进 `details.tabs.item`）。

> ⚠️ **关键约定**：`__ModuleLoader__.load` 的 `id` 必须**精确等于包目录名**（本包为 `dsh-minimal-UI-panels`，含大写 UI）。loader 以目录 basename 作为 entry id，与 npm 包名大小写可能不同；不一致会导致启动报 `loaded without registering "..." via __ModuleLoader__.load`（fail-loud）。

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
  bash ~/.dsh/dsh-plugin-precheck.sh web
  ```

  预检会做：宿主插件树加载（`--dump-config`）+ 各插件 `node --check` + 客户端 bundle mock 装载契约断言。**通过后才允许重启**；进不去时用 `~/.dsh/dsh-safe-start.sh` 安全启动。

- 合并浏览器半身由脚本生成：`/tmp/merge-client.mjs`（读取四个原始 `lib/client.js`，提取 factory 体、改写 react 绑定、删除子模块内 `exports.` 语句，输出单 bundle）。重新生成后务必核对：`react_jsx_runtime` 有定义、子模块无残留 `exports.`、`__ModuleLoader__.load` id 与目录名一致。

- 数据位置：长期记忆 `~/.dsh/dsh-memory/{global,user}.jsonl`、工作区 `.dsh/memory.jsonl`；记事本 `~/.dsh/notes.json`。

## 🔒 注意事项

- 记事本存储为单 JSON 文档（fs 服务无 unlink 原语，单文件原子重写更可靠）。
- details 列宽可在官方包 `dsh-client-ui-layout` 放宽（本包档案将上限调至 1600px，`computeColumns` 让步链保证中心对话区 ≥640px）——升级 dsh 会覆盖，需重打。
- 本包仅动态注册的服务/路由/工具随 fiber 生命周期；停止或热更新会移除全部副作用。
