/**
 * dsh-artifacts-panel — Browser half.
 *
 * Embeds the artifacts panel into the right details column. It mounts
 * adaptively: as a tab inside the dsh-details-tabs container when that
 * container is installed (`details.tabs.item`), otherwise directly on the
 * `details` slot (priority -2). The window chrome for reopening the collapsed
 * column is owned by dsh-details-tabs, not by this panel.
 *
 * The panel lets you pick a workspace directory, scans it through the host
 * route `POST /api/artifacts/scan`, and groups/sorts/filters the artifact
 * rows by type, date, size, or line count — all client-side. It also offers
 * subdirectory drill-down (host returns the immediate subdirs), manual path
 * entry (scope any), persisted view preferences (localStorage), "show more"
 * pagination for large result sets, and a preview drawer that fetches the
 * bounded file content through `GET /api/artifacts/read` when a row is
 * clicked (copy-path lives in the preview header).
 */
window.__ModuleLoader__.load({
	id: "dsh-artifacts-panel",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react = require("react");
		let react_jsx_runtime = require("react/jsx-runtime");
		//#region lib/types/client/locales.js
		/** Dictionary namespace owned by this plugin. */
		const NS = "artifacts";
		/** Simplified Chinese dictionary (the key-set source of truth). */
		const zh = {
			"panel.title": "产物面板",
			"tab.description": "浏览本会话产出的文件",
			"panel.open": "打开产物面板",
			"panel.close": "关闭产物面板",
			"panel.empty": "没有扫描到产物文件",
			"panel.loading": "扫描中…",
			"panel.error": "扫描失败：{message}",
			"panel.refresh": "刷新",
			"panel.auto": "自动刷新",
			"panel.autoShort": "自动",
			"panel.dir": "目录：",
			"panel.currentSession": "当前会话",
			"panel.files": "{count} 个文件",
			"panel.limitReached": "已达扫描上限，结果可能不完整",
			"panel.copy": "复制路径",
			"panel.copied": "已复制",
			"panel.search": "搜索",
			"panel.searchPlaceholder": "搜索文件名…",
			"panel.dirs": "子目录",
			"panel.up": "上级目录",
			"panel.pathLabel": "路径：",
			"panel.pathPlaceholder": "输入目录路径，回车扫描",
			"panel.more": "显示更多（还有 {count} 项）",
			"panel.preview": "预览",
			"panel.back": "返回列表",
			"panel.previewBinary": "二进制文件，无法预览",
			"panel.previewTruncated": "文件过大，仅预览前 {size}",
			"group.label": "分组：",
			"group.none": "不分组",
			"group.type": "类型",
			"group.date": "日期",
			"group.size": "体积",
			"group.lines": "行数",
			"sort.label": "排序：",
			"sort.name": "名称",
			"sort.size": "体积",
			"sort.lines": "行数",
			"sort.mtime": "日期",
			"sort.asc": "升序",
			"sort.desc": "降序",
			"cat.code": "代码",
			"cat.docs": "文档",
			"cat.config": "配置",
			"cat.data": "数据",
			"cat.image": "图片",
			"cat.media": "媒体",
			"cat.web": "前端资源",
			"cat.archive": "归档",
			"cat.other": "其他",
			"date.today": "今天",
			"date.yesterday": "昨天",
			"date.week": "近 7 天",
			"date.month": "近 30 天",
			"date.older": "更早",
			"size.s1": "≤ 1 KB",
			"size.s2": "1–10 KB",
			"size.s3": "10–100 KB",
			"size.s4": "100 KB–1 MB",
			"size.s5": "> 1 MB",
			"lines.none": "无行数",
			"lines.l1": "≤ 10 行",
			"lines.l2": "11–100 行",
			"lines.l3": "101–1000 行",
			"lines.l4": "> 1000 行",
			"unit.b": "{n} B",
			"unit.kb": "{n} KB",
			"unit.mb": "{n} MB",
			"unit.gb": "{n} GB",
			"row.lines": "{n} 行"
		};
		/** English dictionary (same key set). */
		const en = {
			"panel.title": "Artifacts",
			"tab.description": "Browse files produced by this session",
			"panel.open": "Open artifacts panel",
			"panel.close": "Close artifacts panel",
			"panel.empty": "No artifact files found",
			"panel.loading": "Scanning…",
			"panel.error": "Scan failed: {message}",
			"panel.refresh": "Refresh",
			"panel.auto": "Auto refresh",
			"panel.autoShort": "Auto",
			"panel.dir": "Directory:",
			"panel.currentSession": "Current session",
			"panel.files": "{count} files",
			"panel.limitReached": "Scan limit reached; results may be incomplete",
			"panel.copy": "Copy path",
			"panel.copied": "Copied",
			"panel.search": "Search",
			"panel.searchPlaceholder": "Filter by name…",
			"panel.dirs": "Subdirectories",
			"panel.up": "Up one level",
			"panel.pathLabel": "Path:",
			"panel.pathPlaceholder": "Enter a directory path, press Enter to scan",
			"panel.more": "Show more ({count} remaining)",
			"panel.preview": "Preview",
			"panel.back": "Back to list",
			"panel.previewBinary": "Binary file, cannot preview",
			"panel.previewTruncated": "File too large; previewing first {size}",
			"group.label": "Group:",
			"group.none": "No grouping",
			"group.type": "By type",
			"group.date": "By date",
			"group.size": "By size",
			"group.lines": "By lines",
			"sort.label": "Sort:",
			"sort.name": "By name",
			"sort.size": "By size",
			"sort.lines": "By lines",
			"sort.mtime": "By date",
			"sort.asc": "Ascending",
			"sort.desc": "Descending",
			"cat.code": "Code",
			"cat.docs": "Docs",
			"cat.config": "Config",
			"cat.data": "Data",
			"cat.image": "Image",
			"cat.media": "Media",
			"cat.web": "Web assets",
			"cat.archive": "Archive",
			"cat.other": "Other",
			"date.today": "Today",
			"date.yesterday": "Yesterday",
			"date.week": "Last 7 days",
			"date.month": "Last 30 days",
			"date.older": "Older",
			"size.s1": "≤ 1 KB",
			"size.s2": "1–10 KB",
			"size.s3": "10–100 KB",
			"size.s4": "100 KB–1 MB",
			"size.s5": "> 1 MB",
			"lines.none": "No lines",
			"lines.l1": "≤ 10 lines",
			"lines.l2": "11–100 lines",
			"lines.l3": "101–1000 lines",
			"lines.l4": "> 1000 lines",
			"unit.b": "{n} B",
			"unit.kb": "{n} KB",
			"unit.mb": "{n} MB",
			"unit.gb": "{n} GB",
			"row.lines": "{n} lines"
		};
		//#endregion
		//#region lib/types/client/format.js
		/** Human-readable byte size. */
		function formatSize(t, bytes) {
			if (bytes < 1024) return t("unit.b", { n: String(bytes) });
			if (bytes < 1024 * 1024) return t("unit.kb", { n: (bytes / 1024).toFixed(1) });
			if (bytes < 1024 * 1024 * 1024) return t("unit.mb", { n: (bytes / 1024 / 1024).toFixed(1) });
			return t("unit.gb", { n: (bytes / 1024 / 1024 / 1024).toFixed(2) });
		}
		/** Compact timestamp: MM-DD HH:mm. */
		function formatMtime(ms) {
			const d = new Date(ms);
			const p = (n) => String(n).padStart(2, "0");
			return `${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
		}
		/** Path separator used by the host OS (the first one present in the path). */
		function pathSep(path) {
			return path.indexOf("/") !== -1 ? "/" : "\\";
		}
		/** Last path segment (file or directory name). */
		function baseName(path) {
			const index = path.lastIndexOf(pathSep(path));
			return index === -1 ? path : path.slice(index + 1);
		}
		/** Parent directory of a path, or null at the filesystem root. */
		function parentDir(path) {
			const sep = pathSep(path);
			const index = path.lastIndexOf(sep);
			if (index <= 0) return null;
			return path.slice(0, index);
		}
		/** Date bucket key for a millisecond timestamp. */
		function bucketOfDate(ms) {
			const now = new Date();
			const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
			const day = 24 * 60 * 60 * 1000;
			if (ms >= today) return "today";
			if (ms >= today - day) return "yesterday";
			if (ms >= today - 7 * day) return "week";
			if (ms >= today - 30 * day) return "month";
			return "older";
		}
		/** Size bucket key. */
		function bucketOfSize(size) {
			if (size <= 1024) return "s1";
			if (size <= 10 * 1024) return "s2";
			if (size <= 100 * 1024) return "s3";
			if (size <= 1024 * 1024) return "s4";
			return "s5";
		}
		/** Line-count bucket key; null lines (binary/huge) map to "none". */
		function bucketOfLines(lines) {
			if (lines === null) return "none";
			if (lines <= 10) return "l1";
			if (lines <= 100) return "l2";
			if (lines <= 1000) return "l3";
			return "l4";
		}
		//#endregion
		//#region lib/types/client/highlight.js
		// Zero-dependency tokenizer for the preview drawer: comments, strings,
		// numbers and keywords become colored spans. No HTML is ever built —
		// React elements only, so arbitrary file content is safe to render.
		const HL_COMMENT_STYLE = { color: "var(--dsw-alias-label-tertiary, #8a8a8a)", fontStyle: "italic" };
		const HL_STRING_STYLE = { color: "var(--dsw-alias-state-success-primary, #2e9e5b)" };
		const HL_NUMBER_STYLE = { color: "var(--dsw-alias-state-warn-primary, #c98a2d)" };
		const HL_KEYWORD_STYLE = { color: "var(--dsw-alias-state-info-primary, #5b8def)", fontWeight: 500 };
		/** Comment lexemes per language group (c-style / hash / html). */
		const HL_COMMENT_RES = {
			c: /\/\/[^\n]*|\/\*[\s\S]*?\*\//g,
			hash: /#[^\n]*/g,
			html: /<!--[\s\S]*?-->/g,
		};
		const HL_STRING_RE = /"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'|`(?:[^`\\]|\\.)*`/g;
		const HL_NUMBER_RE = /\b0x[0-9a-fA-F]+\b|\b\d[\d_]*(?:\.\d+)?(?:[eE][+-]?\d+)?\b/g;
		const HL_KEYWORDS = new Set(
			("const let var function return import from export default if else for while do class new async await " +
			 "try catch finally throw switch case break continue typeof instanceof in of this null undefined true false " +
			 "interface type enum extends implements public private protected static readonly package require module void " +
			 "yield super delete debugger def elif lambda pass none and or not is with as except global nonlocal " +
			 "struct fn impl pub mut self match loop where let").split(" ")
		);
		/** Extensions whose preview gets highlighted. */
		const HL_CODE_EXTS = new Set(
			("js ts jsx tsx mjs cjs py java c cpp h hpp cs go rs rb php swift kt scala sh bash zsh bat cmd ps1 lua pl pm r " +
			 "json yaml yml toml ini conf cfg env properties sql css scss sass less html htm vue svelte").split(" ")
		);
		/** Extensions using `#` comments (python/shell/config). */
		const HL_HASH_EXTS = new Set("py rb sh bash zsh pl pm r yaml yml toml ini conf cfg env properties".split(" "));
		/** Extensions using HTML comments. */
		const HL_HTML_EXTS = new Set("html htm vue svelte".split(" "));
		function codeLangOf(name) {
			const dot = String(name ?? "").lastIndexOf(".");
			const ext = dot < 0 ? "" : String(name).slice(dot + 1).toLowerCase();
			if (HL_HASH_EXTS.has(ext)) return "hash";
			if (HL_HTML_EXTS.has(ext)) return "html";
			return "c";
		}
		/** True when a preview file should be syntax-highlighted. */
		function isCodePreview(name) {
			const dot = String(name ?? "").lastIndexOf(".");
			if (dot < 0) return false;
			return HL_CODE_EXTS.has(String(name).slice(dot + 1).toLowerCase());
		}
		/** Tokenize code text into colored React spans (safe, no HTML). */
		function highlightCode(text, lang = "c") {
			const source = String(text ?? "");
			const commentRe = HL_COMMENT_RES[lang] ?? HL_COMMENT_RES.c;
			const re = new RegExp(
				`(?:${commentRe.source})|(?:${HL_STRING_RE.source})|(?:${HL_NUMBER_RE.source})|\\b([A-Za-z_$][A-Za-z0-9_$]*)\\b`,
				"g"
			);
			const out = [];
			let last = 0;
			let i = 0;
			let m;
			while ((m = re.exec(source)) !== null) {
				if (m.index > last) out.push(react.createElement("span", { key: `p${i++}` }, source.slice(last, m.index)));
				const tok = m[0];
				let style = null;
				if (tok.startsWith("//") || tok.startsWith("/*") || tok.startsWith("#") || tok.startsWith("<!--")) style = HL_COMMENT_STYLE;
				else if (tok.startsWith('"') || tok.startsWith("'") || tok.startsWith("`")) style = HL_STRING_STYLE;
				else if (/^[0-9]/.test(tok) || tok.startsWith("0x")) style = HL_NUMBER_STYLE;
				else if (HL_KEYWORDS.has(tok)) style = HL_KEYWORD_STYLE;
				out.push(react.createElement("span", { key: `k${i++}`, ...(style === null ? {} : { style }) }, tok));
				last = m.index + m[0].length;
			}
			if (last < source.length) out.push(react.createElement("span", { key: `e${i}` }, source.slice(last)));
			return out;
		}
		//#endregion

		//#region lib/types/client/group.js
		/** Stable display order of type categories. */
		const CATEGORY_ORDER = ["code", "docs", "config", "data", "image", "media", "web", "archive", "other"];
		const DATE_ORDER = ["today", "yesterday", "week", "month", "older"];
		const SIZE_ORDER = ["s1", "s2", "s3", "s4", "s5"];
		const LINES_ORDER = ["none", "l1", "l2", "l3", "l4"];
		/**
		 * Group artifact rows by one dimension. Groups keep a stable order and
		 * carry a localized label plus aggregate totals.
		 * @param files - artifact rows.
		 * @param groupBy - grouping dimension.
		 * @param t - translate.
		 * @returns ordered groups of rows.
		 */
		function groupFiles(files, groupBy, t) {
			if (groupBy === "none" || files.length === 0) return [{
				key: "all",
				label: t("group.none"),
				items: files
			}];
			const groups = new Map();
			for (const file of files) {
				let key;
				if (groupBy === "type") key = CATEGORY_ORDER.includes(file.category) ? file.category : "other";
				else if (groupBy === "date") key = bucketOfDate(file.mtimeMs);
				else if (groupBy === "size") key = bucketOfSize(file.size);
				else if (groupBy === "lines") key = bucketOfLines(file.lines);
				else key = "all";
				let group = groups.get(key);
				if (group === void 0) {
					group = { key, items: [] };
					groups.set(key, group);
				}
				group.items.push(file);
			}
			const order = groupBy === "type" ? CATEGORY_ORDER : groupBy === "date" ? DATE_ORDER : groupBy === "size" ? SIZE_ORDER : LINES_ORDER;
			const prefix = groupBy === "type" ? "cat." : groupBy === "date" ? "date." : groupBy === "size" ? "size." : "lines.";
			const entries = [...groups.values()].sort((a, b) => order.indexOf(a.key) - order.indexOf(b.key));
			return entries.map((group) => ({
				key: group.key,
				label: t(prefix + group.key),
				items: group.items
			}));
		}
		/**
		 * Sort rows within a group by one dimension.
		 * @param items - rows.
		 * @param sortBy - sort key.
		 * @param sortDir - "asc" or "desc".
		 * @returns sorted rows (stable).
		 */
		function sortRows(items, sortBy, sortDir) {
			const sign = sortDir === "asc" ? 1 : -1;
			const sorted = [...items];
			sorted.sort((a, b) => {
				let cmp = 0;
				if (sortBy === "name") cmp = a.name.localeCompare(b.name);
				else if (sortBy === "size") cmp = a.size - b.size;
				else if (sortBy === "lines") cmp = (a.lines ?? -1) - (b.lines ?? -1);
				else if (sortBy === "mtime") cmp = a.mtimeMs - b.mtimeMs;
				if (cmp === 0) cmp = a.name.localeCompare(b.name);
				return sign * cmp;
			});
			return sorted;
		}
		//#endregion
		//#region \0dsh-css:artifacts-panel.module.css
		const css = [
			".dap-root{display:flex;flex-direction:column;height:100%;min-height:0;background:var(--dsw-alias-bg-base,#fff);color:var(--dsw-alias-label-primary,#1a1a1a)}",
			".dap-head{display:flex;flex-direction:column;gap:8px;padding:12px 14px;border-bottom:1px solid var(--dsw-alias-border-l1,#ececec);flex:none}",
			".dap-title{display:flex;align-items:center;justify-content:space-between;font-size:14px;font-weight:600;line-height:20px}",
			".dap-close{background:none;border:none;cursor:pointer;color:var(--dsw-alias-label-tertiary,#999);font-size:14px;line-height:20px;padding:0 2px}",
			".dap-close:hover{color:var(--dsw-alias-label-primary,#1a1a1a)}",
			".dap-controls{display:flex;flex-wrap:wrap;gap:6px 8px;align-items:center}",
			".dap-controls-nowrap{display:flex;flex-wrap:nowrap;gap:6px 8px;align-items:center}",
			".dap-label{flex:none;white-space:nowrap;color:var(--dsw-alias-label-tertiary,#999);font-size:12px;line-height:24px}",
			".dap-select{flex:1 1 120px;min-width:0;height:26px;padding:0 6px;border:1px solid var(--dsw-alias-border-l2,#d8d8d8);border-radius:6px;background:var(--dsw-alias-bg-base,#fff);color:var(--dsw-alias-label-primary,#1a1a1a);font:inherit;font-size:12px;line-height:24px}",
			".dap-button{height:26px;padding:0 10px;border:1px solid var(--dsw-alias-border-l2,#d8d8d8);border-radius:6px;background:var(--dsw-alias-bg-base,#fff);color:var(--dsw-alias-label-secondary,#555);font:inherit;font-size:12px;line-height:24px;cursor:pointer;white-space:nowrap}",
			".dap-button:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(0,0,0,.06));color:var(--dsw-alias-label-primary,#1a1a1a)}",
			".dap-button[data-active]{border-color:var(--dsw-alias-state-business-primary,#4f7cff);color:var(--dsw-alias-state-business-primary,#4f7cff)}",
			".dap-button:disabled{opacity:.45;cursor:default}",
			".dap-input{flex:1 1 140px;min-width:0;height:26px;padding:0 8px;border:1px solid var(--dsw-alias-border-l2,#d8d8d8);border-radius:6px;background:var(--dsw-alias-bg-base,#fff);color:var(--dsw-alias-label-primary,#1a1a1a);font:inherit;font-size:12px;line-height:24px}",
			".dap-input::placeholder{color:var(--dsw-alias-label-caption,#999)}",
			".dap-input:focus{border-color:var(--dsw-alias-state-business-primary,#4f7cff);outline:none}",
			".dap-meta{display:flex;align-items:center;gap:10px;color:var(--dsw-alias-label-tertiary,#999);font-size:12px;line-height:18px;flex-wrap:wrap}",
			".dap-limit{color:var(--dsw-alias-state-warning-primary,#c98a00)}",
			".dap-body{flex:1;overflow:auto;padding:4px 0;min-height:0}",
			".dap-state{padding:24px 16px;text-align:center;color:var(--dsw-alias-label-tertiary,#999);font-size:13px;line-height:20px}",
			".dap-group{border-bottom:1px solid var(--dsw-alias-border-l1,#ececec)}",
			".dap-group-head{display:flex;align-items:center;justify-content:space-between;padding:6px 14px 4px;color:var(--dsw-alias-label-secondary,#555);font-size:12px;font-weight:600;line-height:18px;position:sticky;top:0;background:var(--dsw-alias-bg-base,#fff)}",
			".dap-group-count{color:var(--dsw-alias-label-tertiary,#999);font-weight:400}",
			".dap-dirs{border-bottom:1px solid var(--dsw-alias-border-l1,#ececec)}",
			".dap-dir{display:grid;grid-template-columns:16px minmax(0,1fr) auto;gap:8px;align-items:center;padding:4px 14px;cursor:pointer}",
			".dap-dir:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(0,0,0,.05))}",
			".dap-dir-icon{font-size:12px;line-height:22px;flex:none}",
			".dap-dir-name{text-overflow:ellipsis;white-space:nowrap;overflow:hidden;color:var(--dsw-alias-label-primary,#1a1a1a);font-size:13px;line-height:22px}",
			".dap-row{display:grid;grid-template-columns:8px minmax(0,1fr) auto auto auto;gap:8px;align-items:center;padding:4px 14px;cursor:pointer}",
			".dap-row:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(0,0,0,.05))}",
			".dap-dot{width:6px;height:6px;border-radius:50%;flex:none}",
			".dap-name{text-overflow:ellipsis;white-space:nowrap;overflow:hidden;color:var(--dsw-alias-label-primary,#1a1a1a);font-size:13px;line-height:22px}",
			".dap-cell{color:var(--dsw-alias-label-tertiary,#999);font-size:11px;line-height:22px;white-space:nowrap;font-variant-numeric:tabular-nums}",
			".dap-row[data-copied] .dap-name{color:var(--dsw-alias-state-success-primary,#2e9e5b)}",
			".dap-more{display:block;width:calc(100% - 28px);margin:8px 14px;height:26px;border:1px dashed var(--dsw-alias-border-l2,#d8d8d8);border-radius:6px;background:0 0;color:var(--dsw-alias-label-secondary,#555);font:inherit;font-size:12px;line-height:24px;cursor:pointer}",
			".dap-more:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(0,0,0,.05));color:var(--dsw-alias-label-primary,#1a1a1a)}",
			".dap-preview-name{text-overflow:ellipsis;white-space:nowrap;overflow:hidden;color:var(--dsw-alias-label-primary,#1a1a1a);font-size:13px;font-weight:600;line-height:20px;min-width:0;flex:1}",
			".dap-preview-wrap{flex-direction:column;display:flex;min-height:0;flex:1}",
			".dap-preview-text{flex:1;margin:0;padding:10px 14px;font-family:var(--ds-font-family-code,ui-monospace,SFMono-Regular,Menlo,monospace);font-size:12px;line-height:20px;color:var(--dsw-alias-label-primary,#1a1a1a);white-space:pre-wrap;word-break:break-word;overflow:auto}",
			".dap-preview-foot{padding:2px 14px 12px;color:var(--dsw-alias-label-tertiary,#999);font-size:12px;line-height:18px}",
			".dap-empty{padding:24px 16px;text-align:center;color:var(--dsw-alias-label-tertiary,#999);font-size:13px;line-height:20px}"
		].join("");
		const tagId = "dsh-artifacts-panel/style";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId) + "]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "dsh-artifacts-panel";
			tag.dataset.pluginCss = tagId;
			tag.textContent = css;
			document.head.appendChild(tag);
		}
		//#endregion
		//#region lib/types/client/panel.js
		/** Category accent colors (fall back when the theme token is absent). */
		const CATEGORY_COLORS = {
			code: "#4f7cff",
			docs: "#2e9e5b",
			config: "#8a63d2",
			data: "#d09b2e",
			image: "#e05b8d",
			media: "#d95f3b",
			web: "#2ea8b8",
			archive: "#7a8699",
			other: "#9aa0a6"
		};
		/** localStorage key for panel preferences. */
		const STORAGE_KEY = "dsh.artifacts.panel.v1";
		/** Extensions the preview drawer streams as <video> via the media route. */
		const VIDEO_EXTS = ["mp4", "m4v", "webm", "ogv"];
		/** True when a file path looks like a browser-playable video. */
		function isVideoPath(path) {
			const dot = String(path ?? "").lastIndexOf(".");
			if (dot < 0) return false;
			return VIDEO_EXTS.includes(String(path).slice(dot + 1).toLowerCase());
		}
		/** Default panel preferences (also the shape persisted under STORAGE_KEY). */
		const DEFAULT_PREFS = {
			groupBy: "type",
			sortBy: "mtime",
			sortDir: "desc",
			auto: true,
			dir: null
		};
		/** How many (group, row) pairs render before "show more" pagination kicks in. */
		const PAGE_SIZE = 200;
		/**
		 * Load persisted panel preferences, tolerating a missing or unparseable store.
		 * @returns the merged preference object (defaults + persisted overrides).
		 */
		function loadPrefs() {
			try {
				const raw = window.localStorage?.getItem(STORAGE_KEY);
				if (raw !== null && raw !== void 0 && raw !== "") return { ...DEFAULT_PREFS, ...JSON.parse(raw) };
			} catch {
				/* corrupted or unavailable storage: fall back to defaults */
			}
			return { ...DEFAULT_PREFS };
		}
		/**
		 * The artifacts panel, embedded in the right details column.
		 * @param props - session standard props (sessionId, useSessions, useWorkspaces),
		 *   the injected closeDetails action, and the locale seat t.
		 * @returns the panel filling the details column.
		 */
		function ArtifactsPanel({ sessionId, useSessions, useWorkspaces, closeDetails, t, embedded }) {
			const [prefs] = react.useState(loadPrefs);
			const [dir, setDir] = react.useState(prefs.dir ?? null);
			const [data, setData] = react.useState(null);
			const [loading, setLoading] = react.useState(false);
			const [error, setError] = react.useState(null);
			const [groupBy, setGroupBy] = react.useState(prefs.groupBy);
			const [sortBy, setSortBy] = react.useState(prefs.sortBy);
			const [sortDir, setSortDir] = react.useState(prefs.sortDir);
			const [auto, setAuto] = react.useState(prefs.auto);
			const [copiedPath, setCopiedPath] = react.useState(null);
			/** Bumped by the refresh button to re-run the scan effect (the effect's
			 * cleanup aborts any in-flight request before the new scan starts). */
			const [refreshKey, setRefreshKey] = react.useState(0);
			/** Case-insensitive name/path filter applied to the scanned rows. */
			const [query, setQuery] = react.useState("");
			/** How many (group, row) pairs render; grows via the "show more" button. */
			const [visibleCount, setVisibleCount] = react.useState(PAGE_SIZE);
			/** The artifact row whose preview view is open, or null for the list. */
			const [preview, setPreview] = react.useState(null);
			/** Fetched preview payload for the open row ({text|binary, truncated, ...}). */
			const [previewData, setPreviewData] = react.useState(null);
			/** Preview fetch failure, or null. */
			const [previewError, setPreviewError] = react.useState(null);
			const cwd = useSessions((s) => sessionId === void 0 ? void 0 : s.byId[sessionId]?.cwd);
			const workspaces = useWorkspaces((s) => s.items);
			const effectiveDir = dir ?? cwd ?? (workspaces.length > 0 ? workspaces[0].path : null);
			react.useEffect(() => {
				if (effectiveDir === null) return;
				let cancelled = false;
				const controller = new AbortController();
				setData(null);
				setError(null);
				const run = async () => {
					setLoading(true);
					try {
						const response = await fetch("/api/artifacts/scan", {
							method: "POST",
							headers: { "content-type": "application/json" },
							body: JSON.stringify({ dir: effectiveDir }),
							signal: controller.signal
						});
						const json = await response.json();
						if (!response.ok) throw new Error(json?.error ?? `HTTP ${response.status}`);
						if (!cancelled) setData(json);
					} catch (err) {
						if (!cancelled && err?.name !== "AbortError") setError(String(err?.message ?? err));
					} finally {
						if (!cancelled) setLoading(false);
					}
				};
				run();
				let timer = null;
				if (auto) timer = setInterval(run, 60000);
				return () => {
					cancelled = true;
					controller.abort();
					if (timer !== null) clearInterval(timer);
				};
			}, [effectiveDir, auto, refreshKey]);
			react.useEffect(() => {
				try {
					window.localStorage?.setItem(STORAGE_KEY, JSON.stringify({ groupBy, sortBy, sortDir, auto, dir }));
				} catch {
					/* storage unavailable: preferences just won't persist */
				}
			}, [groupBy, sortBy, sortDir, auto, dir]);
			react.useEffect(() => {
				setVisibleCount(PAGE_SIZE);
			}, [effectiveDir, query, groupBy, sortBy, sortDir]);
			react.useEffect(() => {
				if (preview === null) {
					setPreviewData(null);
					setPreviewError(null);
					return;
				}
				// Videos stream through the media route (Range support); no
				// bounded read needed — the <video> element requests it itself.
				if (isVideoPath(preview.path)) {
					setPreviewData({ video: true });
					setPreviewError(null);
					return;
				}
				let cancelled = false;
				const controller = new AbortController();
				setPreviewData(null);
				setPreviewError(null);
				fetch(`/api/artifacts/read?path=${encodeURIComponent(preview.path)}`, { signal: controller.signal })
					.then(async (response) => {
						const json = await response.json();
						if (!response.ok) throw new Error(json?.error ?? `HTTP ${response.status}`);
						if (!cancelled) setPreviewData(json);
					})
					.catch((err) => {
						if (!cancelled && err?.name !== "AbortError") setPreviewError(String(err?.message ?? err));
					});
				return () => {
					cancelled = true;
					controller.abort();
				};
			}, [preview]);
			const files = data?.files ?? [];
			const dirs = data?.dirs ?? [];
			const queryNorm = query.trim().toLowerCase();
			const filtered = queryNorm === "" ? files : files.filter((file) => file.name.toLowerCase().includes(queryNorm) || file.path.toLowerCase().includes(queryNorm));
			const groups = groupFiles(filtered, groupBy, t).map((group) => ({
				...group,
				items: sortRows(group.items, sortBy, sortDir)
			}));
			const totalSize = filtered.reduce((sum, file) => sum + (file.size ?? 0), 0);
			const rowEntries = [];
			for (const group of groups) {
				for (const item of group.items) rowEntries.push({ group, item });
			}
			const visibleEntries = rowEntries.slice(0, visibleCount);
			const hiddenCount = rowEntries.length - visibleCount;
			const onCopy = (path) => {
				navigator.clipboard?.writeText(path).catch(() => {});
				setCopiedPath(path);
				window.setTimeout(() => setCopiedPath((current) => current === path ? null : current), 1200);
			};
			// Lazily constructed so `preview.name` etc. are only evaluated while
			// `preview !== null` — eager construction crashed on the null preview
			// state (Cannot read properties of null).
			const previewView = () => [
				(0, react_jsx_runtime.jsxs)("div", {
					className: "dap-head",
					children: [
						(0, react_jsx_runtime.jsxs)("div", {
							className: "dap-title",
							children: [
								(0, react_jsx_runtime.jsx)("button", {
									type: "button",
									className: "dap-close",
									"aria-label": t("panel.back"),
									title: t("panel.back"),
									onClick: () => {
										setPreview(null);
									},
									children: "←"
								}),
								(0, react_jsx_runtime.jsx)("span", {
									className: "dap-preview-name",
									children: preview.name
								}),
								(0, react_jsx_runtime.jsx)("button", {
									type: "button",
									className: "dap-button",
									title: preview.path,
									onClick: () => {
										onCopy(preview.path);
									},
									children: copiedPath === preview.path ? t("panel.copied") : t("panel.copy")
								})
							]
						}),
						(0, react_jsx_runtime.jsxs)("div", {
							className: "dap-meta",
							children: [
								(0, react_jsx_runtime.jsx)("span", { children: preview.path }),
								(0, react_jsx_runtime.jsx)("span", { children: formatSize(t, preview.size) }),
								preview.lines !== null && (0, react_jsx_runtime.jsx)("span", { children: t("row.lines", { n: String(preview.lines) }) })
							]
						})
					]
				}),
				(0, react_jsx_runtime.jsx)("div", {
					className: "dap-body",
					children: previewError !== null ? (0, react_jsx_runtime.jsx)("div", {
						className: "dap-state",
						children: t("panel.error", { message: previewError })
					}) : previewData === null ? (0, react_jsx_runtime.jsx)("div", {
						className: "dap-state",
						children: t("panel.loading")
					}) : previewData.video === true ? (0, react_jsx_runtime.jsx)("div", {
						className: "dap-preview-wrap",
						children: (0, react_jsx_runtime.jsx)("video", {
							className: "dap-preview-video",
							controls: true,
							src: "/api/artifacts/media?path=" + encodeURIComponent(preview.path),
							style: { maxWidth: "100%", maxHeight: "70vh", display: "block", margin: "0 auto" }
						})
					}) : previewData.binary === true && previewData.image === true && typeof previewData.dataUrl === "string" ? (0, react_jsx_runtime.jsxs)("div", {
						className: "dap-preview-wrap",
						children: [
							(0, react_jsx_runtime.jsx)("img", {
								className: "dap-preview-image",
								src: previewData.dataUrl,
								alt: previewData.name ?? "preview",
								style: { maxWidth: "100%", maxHeight: "70vh", objectFit: "contain", display: "block", margin: "0 auto" }
							}),
							previewData.truncated === true && (0, react_jsx_runtime.jsx)("div", {
								className: "dap-preview-foot",
								children: t("panel.previewTruncated", { size: formatSize(t, previewData.size) })
							})
						]
					}) : previewData.binary === true ? (0, react_jsx_runtime.jsx)("div", {
						className: "dap-state",
						children: t("panel.previewBinary")
					}) : (0, react_jsx_runtime.jsxs)("div", {
						className: "dap-preview-wrap",
						children: [
							(0, react_jsx_runtime.jsx)("pre", {
								className: "dap-preview-text",
								children: isCodePreview(previewData.name)
									? highlightCode(previewData.text ?? "", codeLangOf(previewData.name))
									: (previewData.text ?? "")
							}),
							previewData.truncated === true && (0, react_jsx_runtime.jsx)("div", {
								className: "dap-preview-foot",
								children: t("panel.previewTruncated", { size: formatSize(t, previewData.size) })
							})
						]
					})
				})
			];
			return (0, react_jsx_runtime.jsxs)("div", {
				className: "dap-root",
				children: preview !== null ? previewView() : [
					(0, react_jsx_runtime.jsxs)("div", {
						className: "dap-head",
						children: [
							// The container (details-tabs) passes `embedded: true` and
							// renders its own leaf header — hide this standalone title
							// bar + close button to avoid a duplicate chrome per panel.
							embedded !== true && (0, react_jsx_runtime.jsxs)("div", {
								className: "dap-title",
								children: [
									(0, react_jsx_runtime.jsx)("span", { children: t("panel.title") }),
									closeDetails !== void 0 && (0, react_jsx_runtime.jsx)("button", {
										type: "button",
										className: "dap-close",
										"aria-label": t("panel.close"),
										onClick: () => {
											closeDetails();
										},
										children: "✕"
									})
								]
							}),
							(0, react_jsx_runtime.jsxs)("div", {
								className: "dap-controls-nowrap",
								children: [
									(0, react_jsx_runtime.jsx)("span", { className: "dap-label", children: t("panel.dir") }),
									(0, react_jsx_runtime.jsx)("select", {
										className: "dap-select",
										value: effectiveDir ?? "",
										title: effectiveDir ?? "",
										onChange: (event) => {
											setDir(event.currentTarget.value || null);
										},
										children: [
											cwd !== void 0 && (0, react_jsx_runtime.jsx)("option", {
												value: cwd,
												children: t("panel.currentSession")
											}),
											workspaces.filter((workspace) => workspace.path !== cwd).map((workspace) => (0, react_jsx_runtime.jsx)("option", {
												value: workspace.path,
												children: `${workspace.title}（${workspace.path}）`
											}, workspace.path)),
											effectiveDir !== null && effectiveDir !== cwd && !workspaces.some((workspace) => workspace.path === effectiveDir) && (0, react_jsx_runtime.jsx)("option", {
												value: effectiveDir,
												children: effectiveDir
											})
										]
									}),
									(0, react_jsx_runtime.jsx)("button", {
										type: "button",
										className: "dap-button",
										disabled: effectiveDir === null || parentDir(effectiveDir) === null,
										title: t("panel.up"),
										"aria-label": t("panel.up"),
										onClick: () => {
											const parent = parentDir(effectiveDir);
											if (parent !== null) setDir(parent);
										},
										children: "⬆"
									}),
									(0, react_jsx_runtime.jsx)("button", {
										type: "button",
										className: "dap-button",
										disabled: loading,
										title: t("panel.refresh"),
										"aria-label": t("panel.refresh"),
										onClick: () => {
											setRefreshKey((key) => key + 1);
										},
										children: "↻"
									}),
									(0, react_jsx_runtime.jsx)("button", {
										type: "button",
										className: "dap-button",
										"data-active": auto || void 0,
										title: t("panel.auto"),
										"aria-label": t("panel.auto"),
										onClick: () => {
											setAuto((value) => !value);
										},
										children: t("panel.autoShort") + " ↻"
									})
								]
							}),
							(0, react_jsx_runtime.jsxs)("div", {
								className: "dap-controls-nowrap",
								children: [
									(0, react_jsx_runtime.jsx)("input", {
										type: "search",
										className: "dap-input",
										placeholder: t("panel.searchPlaceholder"),
										"aria-label": t("panel.search"),
										value: query,
										onChange: (event) => {
											setQuery(event.currentTarget.value);
										}
									}),
									(0, react_jsx_runtime.jsxs)("label", {
										style: { display: "flex", alignItems: "center", gap: 4, flex: "1 1 140px", minWidth: 0 },
										children: [
											(0, react_jsx_runtime.jsx)("span", { className: "dap-label", children: t("panel.pathLabel") }),
											(0, react_jsx_runtime.jsx)("input", {
												type: "text",
												className: "dap-input",
												placeholder: t("panel.pathPlaceholder"),
												"aria-label": t("panel.pathLabel"),
												defaultValue: dir ?? "",
												onKeyDown: (event) => {
													if (event.key === "Enter") {
														const value = event.currentTarget.value.trim();
														if (value !== "") setDir(value);
													}
												}
											})
										]
									})
								]
							}),
							(0, react_jsx_runtime.jsxs)("div", {
								className: "dap-controls-nowrap",
								children: [
									(0, react_jsx_runtime.jsxs)("label", {
										style: { display: "flex", alignItems: "center", gap: 4, flex: "1 1 0%", minWidth: 0 },
										children: [
											(0, react_jsx_runtime.jsx)("span", { className: "dap-label", children: t("group.label") }),
											(0, react_jsx_runtime.jsx)("select", {
												className: "dap-select",
												style: { flex: "1 1 0%", minWidth: 0 },
												value: groupBy,
												"aria-label": t("group.label"),
												onChange: (event) => {
													setGroupBy(event.currentTarget.value);
												},
												children: [
													(0, react_jsx_runtime.jsx)("option", { value: "none", children: t("group.none") }),
													(0, react_jsx_runtime.jsx)("option", { value: "type", children: t("group.type") }),
													(0, react_jsx_runtime.jsx)("option", { value: "date", children: t("group.date") }),
													(0, react_jsx_runtime.jsx)("option", { value: "size", children: t("group.size") }),
													(0, react_jsx_runtime.jsx)("option", { value: "lines", children: t("group.lines") })
												]
											})
										]
									}),
									(0, react_jsx_runtime.jsxs)("label", {
										style: { display: "flex", alignItems: "center", gap: 4, flex: "1 1 0%", minWidth: 0 },
										children: [
											(0, react_jsx_runtime.jsx)("span", { className: "dap-label", children: t("sort.label") }),
											(0, react_jsx_runtime.jsx)("select", {
												className: "dap-select",
												style: { flex: "1 1 0%", minWidth: 0 },
												value: sortBy,
												"aria-label": t("sort.label"),
												onChange: (event) => {
													setSortBy(event.currentTarget.value);
												},
												children: [
													(0, react_jsx_runtime.jsx)("option", { value: "mtime", children: t("sort.mtime") }),
													(0, react_jsx_runtime.jsx)("option", { value: "name", children: t("sort.name") }),
													(0, react_jsx_runtime.jsx)("option", { value: "size", children: t("sort.size") }),
													(0, react_jsx_runtime.jsx)("option", { value: "lines", children: t("sort.lines") })
												]
											})
										]
									}),
									(0, react_jsx_runtime.jsx)("button", {
										type: "button",
										className: "dap-button",
										onClick: () => {
											setSortDir((value) => value === "asc" ? "desc" : "asc");
										},
										children: sortDir === "asc" ? t("sort.asc") : t("sort.desc")
									})
								]
							}),
							(0, react_jsx_runtime.jsxs)("div", {
								className: "dap-meta",
								children: [
									(0, react_jsx_runtime.jsx)("span", { children: t("panel.files", { count: String(filtered.length) }) }),
									(0, react_jsx_runtime.jsx)("span", { children: formatSize(t, totalSize) }),
									data?.limitReached === true && (0, react_jsx_runtime.jsx)("span", {
										className: "dap-limit",
										children: t("panel.limitReached")
									})
								]
							})
						]
					}),
					(0, react_jsx_runtime.jsx)("div", {
						className: "dap-body",
						children: loading && data === null ? (0, react_jsx_runtime.jsx)("div", {
							className: "dap-state",
							children: t("panel.loading")
						}) : error !== null ? (0, react_jsx_runtime.jsx)("div", {
							className: "dap-state",
							children: t("panel.error", { message: error })
						}) : filtered.length === 0 ? (0, react_jsx_runtime.jsx)("div", {
							className: "dap-empty",
							children: t("panel.empty")
						}) : [
							dirs.length > 0 && (0, react_jsx_runtime.jsxs)("div", {
								className: "dap-dirs",
								children: [
									(0, react_jsx_runtime.jsxs)("div", {
										className: "dap-group-head",
										children: [
											(0, react_jsx_runtime.jsx)("span", { children: t("panel.dirs") }),
											(0, react_jsx_runtime.jsx)("span", {
												className: "dap-group-count",
												children: String(dirs.length)
											})
										]
									}),
									dirs.map((dirPath) => (0, react_jsx_runtime.jsxs)("div", {
										className: "dap-dir",
										title: dirPath,
										onClick: () => {
											setDir(dirPath);
										},
										children: [
											(0, react_jsx_runtime.jsx)("span", { className: "dap-dir-icon", children: "📁" }),
											(0, react_jsx_runtime.jsx)("span", { className: "dap-dir-name", children: baseName(dirPath) })
										]
									}, dirPath))
								]
							}),
							...visibleEntries.flatMap((entry, index) => {
								const nodes = [];
								if (index === 0 || visibleEntries[index - 1].group.key !== entry.group.key) {
									nodes.push((0, react_jsx_runtime.jsxs)("div", {
										className: "dap-group-head",
										children: [
											(0, react_jsx_runtime.jsx)("span", { children: entry.group.label }),
											(0, react_jsx_runtime.jsx)("span", {
												className: "dap-group-count",
												children: `${entry.group.items.length} · ${formatSize(t, entry.group.items.reduce((sum, file) => sum + (file.size ?? 0), 0))}`
											})
										]
									}, entry.group.key));
								}
								const file = entry.item;
								const color = CATEGORY_COLORS[file.category] ?? CATEGORY_COLORS.other;
								nodes.push((0, react_jsx_runtime.jsxs)("div", {
									className: "dap-row",
									title: file.path,
									onClick: () => {
										setPreview(file);
									},
									children: [
										(0, react_jsx_runtime.jsx)("span", {
											className: "dap-dot",
											style: { background: color }
										}),
										(0, react_jsx_runtime.jsx)("span", {
											className: "dap-name",
											children: file.name
										}),
										(0, react_jsx_runtime.jsx)("span", {
											className: "dap-cell",
											children: file.lines === null ? t("lines.none") : t("row.lines", { n: String(file.lines) })
										}),
										(0, react_jsx_runtime.jsx)("span", {
											className: "dap-cell",
											children: formatSize(t, file.size)
										}),
										(0, react_jsx_runtime.jsx)("span", {
											className: "dap-cell",
											children: formatMtime(file.mtimeMs)
										})
									]
								}, file.path));
								return nodes;
							}),
							hiddenCount > 0 && (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: "dap-more",
								onClick: () => {
									setVisibleCount((count) => count + PAGE_SIZE);
								},
								children: t("panel.more", { count: String(hiddenCount) })
							})
						]
					})
				]
			});
		}
		//#endregion
		//#region lib/types/client/index.js
		/** This fragment registers no seat of its own; the merged bundle owns the tab type. */
		const inject = ["locale"];
		function apply(ctx) {
			ctx.effect(() => ctx.locale.register(NS, {
				zh,
				en
			}), "artifacts-panel: dictionaries");
			panels.artifacts = {
				Component: ArtifactsPanel,
				ns: NS,
				titleKey: "panel.title",
				t: ctx.locale.bind(NS)
			};
		}
		//#endregion
		exports.apply = apply;
		exports.inject = inject;
		exports.ArtifactsPanel = ArtifactsPanel;
		exports.groupFiles = groupFiles;
		exports.sortRows = sortRows;
		exports.formatSize = formatSize;
		exports.bucketOfDate = bucketOfDate;
		exports.bucketOfSize = bucketOfSize;
		exports.highlightCode = highlightCode;
		exports.isCodePreview = isCodePreview;
		exports.codeLangOf = codeLangOf;
		exports.bucketOfLines = bucketOfLines;
		return module.exports;
	}
});

//# sourceMappingURL=client.js.map
