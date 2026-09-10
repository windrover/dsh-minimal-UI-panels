/**
 * dsh-minimal-ui-panels — Browser half (merged from four fragments).
 *
 * The browser half is one tab type per PAIRING of panels, not per panel: the
 * composite fragment (src/composite) owns every right-Sidebar registration and
 * stacks two panels per tab with a draggable divider, so two Sidebar panes show
 * all four panels at once. The three panel fragments (artifacts, ltm,
 * terminalNotes) contribute only their component, locale namespace and bound
 * translator, through the `panels` registry created in apply() below and passed
 * into every fragment as its third argument.
 *
 * Order matters: the panel fragments fill the registry, the composite reads it.
 */
window.__ModuleLoader__.load({
	id: "dsh-minimal-ui-panels",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react = require("react");
		let react_jsx_runtime = require("react/jsx-runtime");
	// ---- artifacts (merged from client.js) ----
	function artifacts(react, react_jsx_runtime, panels) {
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
		 * Schedule before the browser paints when React offers the layout variant,
		 * and fall back to the passive one otherwise.
		 *
		 * Restoring a scroll offset has to happen before paint: a passive effect
		 * runs after it, so the list would flash its top and then jump back down.
		 */
		const useIsoLayoutEffect = typeof react.useLayoutEffect === "function" ? react.useLayoutEffect : react.useEffect;
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
			/** The list's scroll container; opening a preview replaces it. */
			const listBodyRef = react.useRef(null);
			/** The list's last offset, re-applied when the list comes back. */
			const listScrollTopRef = react.useRef(0);
			const cwd = useSessions((s) => sessionId === void 0 ? void 0 : s.byId[sessionId]?.cwd);
			const workspaces = useWorkspaces((s) => s.items);
			const effectiveDir = dir ?? cwd ?? (workspaces.length > 0 ? workspaces[0].path : null);
			// Both effects read `effectiveDir`, so they must sit after its
			// declaration — a dependency array is evaluated during render, and
			// naming it earlier would be a temporal-dead-zone ReferenceError.
			//
			// Opening a preview unmounts the list's scroll container, so the browser
			// drops the offset and returning lands at the top of a long directory.
			// Re-apply the remembered offset before paint: the return is then a
			// visual no-op instead of a flash of the top followed by a jump.
			useIsoLayoutEffect(() => {
				if (preview !== null) return;
				const body = listBodyRef.current;
				if (body === null) return;
				body.scrollTop = listScrollTopRef.current;
			}, [preview]);
			// A different directory or filter is a different listing, so it starts at
			// the top — and the remembered offset is dropped with it, or a preview
			// opened after the change would restore a position from the old listing.
			useIsoLayoutEffect(() => {
				listScrollTopRef.current = 0;
				const body = listBodyRef.current;
				if (body !== null) body.scrollTop = 0;
			}, [effectiveDir, query]);
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
						ref: listBodyRef,
						onScroll: (event) => {
							listScrollTopRef.current = event.currentTarget.scrollTop;
						},
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
		return { apply, inject };
	}

	// ---- ltm (merged from client.js) ----
	function ltm(react, react_jsx_runtime, panels) {
//#region lib/types/client/locales.js
		const NS = "long-term-memory";
		const zh = {
			"panel.title": "长期记忆",
			"tab.description": "查看和管理跨会话的长期记忆",
			"panel.open": "打开长期记忆",
			"panel.close": "关闭长期记忆",
			"panel.loading": "加载中…",
			"panel.error": "加载失败：{message}",
			"panel.empty": "还没有记忆",
			"panel.add": "新增记忆",
			"panel.save": "保存",
			"panel.cancel": "取消",
			"panel.edit": "编辑",
			"panel.delete": "删除",
			"panel.superseded": "已更正",
			"panel.search": "搜索…",
			"panel.export": "导出",
			"panel.import": "导入",
			"panel.content": "内容",
			"panel.tags": "标签（逗号分隔）",
			"panel.scope": "作用域",
			"panel.importHint": "粘贴 v1 JSON bundle",
			"panel.settings": "设置",
			"panel.usage": "{used}/{limit} 字符",
			"panel.filter": "全部",
			"panel.categoryAll": "全部分类",
			"panel.emptyFilter": "（无匹配记录，可清除筛选）",
			"panel.untagged": "未分类",
			"tag.preference": "偏好",
			"tag.decision": "决策",
			"tag.constraint": "约束",
			"tag.project": "项目",
			"tag.correction": "更正",
			"tag.personal": "个人",
			"scope.user": "用户画像",
			"scope.global": "全局",
			"scope.workspace": "工作区",
			"settings.title": "长期记忆设置",
			"settings.autoSummarize": "自动总结对话",
			"settings.autoSummarizeDesc": "每轮对话结束后用 LLM 蒸馏值得长期记住的事实（额外模型调用）",
			"settings.compressWithLLM": "LLM 压缩",
			"settings.compressWithLLMDesc": "超限时用 LLM 精炼压缩（关闭则用纯规则压缩）",
			"settings.injectContext": "上下文注入",
			"settings.requireApproval": "写入审批",
			"settings.charLimit": "字符预算",
			"settings.saved": "已保存",
		};
		const en = {
			"panel.title": "Long-term memory",
			"tab.description": "View and manage long-term memory across sessions",
			"panel.open": "Open long-term memory",
			"panel.close": "Close long-term memory",
			"panel.loading": "Loading…",
			"panel.error": "Failed to load: {message}",
			"panel.empty": "No memories yet",
			"panel.add": "Add memory",
			"panel.save": "Save",
			"panel.cancel": "Cancel",
			"panel.edit": "Edit",
			"panel.delete": "Delete",
			"panel.superseded": "Corrected",
			"panel.search": "Search…",
			"panel.export": "Export",
			"panel.import": "Import",
			"panel.content": "Content",
			"panel.tags": "Tags (comma-separated)",
			"panel.scope": "Scope",
			"panel.importHint": "Paste a v1 JSON bundle",
			"panel.settings": "Settings",
			"panel.usage": "{used}/{limit} chars",
			"panel.filter": "All",
			"panel.categoryAll": "All categories",
			"panel.emptyFilter": "(no matching records — clear a filter)",
			"panel.untagged": "Untagged",
			"tag.preference": "Preference",
			"tag.decision": "Decision",
			"tag.constraint": "Constraint",
			"tag.project": "Project",
			"tag.correction": "Correction",
			"tag.personal": "Personal",
			"scope.user": "User profile",
			"scope.global": "Global",
			"scope.workspace": "Workspace",
			"settings.title": "Long-term memory settings",
			"settings.autoSummarize": "Auto-summarize conversations",
			"settings.autoSummarizeDesc": "Distill durable facts with the LLM after each finished turn (extra model call)",
			"settings.compressWithLLM": "LLM compression",
			"settings.compressWithLLMDesc": "Refine with the LLM when over budget (off = rule-based compression)",
			"settings.injectContext": "Context injection",
			"settings.requireApproval": "Write approval",
			"settings.charLimit": "Char budget",
			"settings.saved": "Saved",
		};
		//#endregion

		//#region lib/types/client/api.js
		/** Tiny JSON helper around the host routes. */
		async function api(path, options) {
			const res = await fetch(path, {
				headers: { "content-type": "application/json" },
				...options,
			});
			const body = await res.json().catch(() => ({}));
			if (!res.ok) throw new Error(body?.error || `HTTP ${res.status}`);
			return body;
		}
		async function apiGet(path) {
			return api(path);
		}
		async function apiPost(path, payload) {
			return api(path, { method: "POST", body: JSON.stringify(payload) });
		}
		/** Locale lookup that never depends on injected props — falls back to zh. */
		// Locale-reactive re-render for the memory panel: subscribe the component
		// to the DSH locale service so a switch re-renders and makeT() reads the
		// new active locale immediately.
		let ltmT = null; // locale-bound translator, set in apply() from ctx.locale.bind(NS)
		function makeT() {
			return (key, params) => {
				const text = (ltmT ? ltmT(key) : (zh[key] || key));
				if (!params) return text;
				return Object.entries(params).reduce((s, [k, v]) => s.replace(`{${k}}`, String(v)), text);
			};
		}
		/** Shared minimal button style so the panel and card look consistent. */
		const btnStyle = {
			padding: "4px 10px",
			borderRadius: 6,
			border: "1px solid rgba(128,128,128,.35)",
			background: "rgba(128,128,128,.12)",
			color: "inherit",
			cursor: "pointer",
			fontSize: 12,
		};
		/** Trigger a browser download of `text` as a file. */
		function downloadFile(filename, text, mime) {
			const blob = new Blob([text], { type: mime || "application/octet-stream" });
			const url = URL.createObjectURL(blob);
			const a = document.createElement("a");
			a.href = url;
			a.download = filename;
			document.body.appendChild(a);
			a.click();
			document.body.removeChild(a);
			URL.revokeObjectURL(url);
		}
		//#endregion

		//#region lib/types/client/highlight.js
		/**
		 * Lightweight, dependency-free content renderer for memory text:
		 * highlights fenced code blocks, inline `code`, and URLs. Everything
		 * else stays plain. Returns React elements — no HTML is ever built,
		 * so arbitrary memory text is safe to render.
		 */
		const CODE_INLINE_STYLE = {
			fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
			fontSize: 12,
			background: "rgba(128,128,128,.16)",
			padding: "0 3px",
			borderRadius: 3,
			wordBreak: "break-all",
		};
		const CODE_BLOCK_STYLE = {
			fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
			fontSize: 12,
			background: "rgba(60,140,255,.07)",
			border: "1px solid rgba(60,140,255,.15)",
			borderRadius: 4,
			padding: "4px 6px",
			margin: "2px 0",
			whiteSpace: "pre-wrap",
			overflowX: "auto",
		};
		const URL_STYLE = {
			color: "var(--dsw-alias-state-info-primary, #6af)",
			textDecoration: "underline",
			wordBreak: "break-all",
		};
		const HIGHLIGHT_RE = /(```[\s\S]*?```)|(`[^`\n]+`)|((?:https?:\/\/)[^\s<>"']+)/g;
		/** Render memory text with code/URL highlighting into React elements. */
		function renderContent(text, keyPrefix) {
			const source = String(text ?? "");
			const out = [];
			let last = 0;
			let i = 0;
			let match;
			while ((match = HIGHLIGHT_RE.exec(source)) !== null) {
				if (match.index > last) out.push(react.createElement("span", { key: `${keyPrefix}-t${i++}` }, source.slice(last, match.index)));
				if (match[1] !== undefined) {
					// fenced code block: strip the fence lines, keep the body
					const inner = match[1].replace(/^```[^\n]*\n?/, "").replace(/```\s*$/, "");
					out.push(react.createElement("div", { key: `${keyPrefix}-b${i++}`, style: CODE_BLOCK_STYLE }, inner));
				} else if (match[2] !== undefined) {
					out.push(react.createElement("span", { key: `${keyPrefix}-c${i++}`, style: CODE_INLINE_STYLE }, match[2].slice(1, -1)));
				} else if (match[3] !== undefined) {
					const url = match[3].replace(/[.,;:!?)]+$/, "");
					out.push(react.createElement("a", { key: `${keyPrefix}-u${i++}`, href: url, target: "_blank", rel: "noreferrer", style: URL_STYLE }, url));
				}
				last = match.index + match[0].length;
			}
			if (last < source.length) out.push(react.createElement("span", { key: `${keyPrefix}-t${i}` }, source.slice(last)));
			return out;
		}
		//#endregion

		//#region lib/types/client/MemoryPanel.js
		/**
		 * The memory management panel: list + search + add/edit/delete + export/import.
		 * Fetches the host routes; keeps a small local state machine.
		 */
		function MemoryPanel(props) {
			const t = makeT();
			const closeDetails = props.closeDetails;
			// When rendered inside the details-tabs container, the container
			// passes `embedded: true` (ownerProps win) and provides its own leaf
			// header — hide the standalone title bar + close button to avoid a
			// duplicate chrome per panel.
			const embedded = props.embedded === true;
			const [records, setRecords] = react.useState([]);
			const [query, setQuery] = react.useState("");
			const [scopeFilter, setScopeFilter] = react.useState("all");
			const [catFilter, setCatFilter] = react.useState("all"); // "all" | category tag
			const [loading, setLoading] = react.useState(true);
			const [error, setError] = react.useState(null);
			const [usage, setUsage] = react.useState(0);
			const [limit, setLimit] = react.useState(0);
			const [editing, setEditing] = react.useState(null); // null | { id?, scope, content, tags }
			const [importOpen, setImportOpen] = react.useState(false);
			const [importText, setImportText] = react.useState("");
			const [notice, setNotice] = react.useState(null);

			const load = react.useCallback(async () => {
				try {
					setLoading(true);
					const data = await apiGet(`/api/memory/list?scope=${scopeFilter}`);
					setRecords(data.results || []);
					const settings = await apiGet("/api/memory/settings");
					setUsage(data.results.reduce((s, r) => s + (r.content?.length || 0), 0));
					setLimit(settings.charLimit || 0);
					setError(null);
				} catch (e) {
					setError(String(e.message || e));
				} finally {
					setLoading(false);
				}
			}, [scopeFilter]);

			react.useEffect(() => { load(); }, [load]);

			const runSearch = react.useCallback(async () => {
				try {
					setLoading(true);
					const data = query.trim()
						? await apiGet(`/api/memory/search?q=${encodeURIComponent(query)}&scope=${scopeFilter}`)
						: await apiGet(`/api/memory/list?scope=${scopeFilter}`);
					setRecords(data.results || []);
					setError(null);
				} catch (e) {
					setError(String(e.message || e));
				} finally {
					setLoading(false);
				}
			}, [query, scopeFilter]);

			const saveRecord = react.useCallback(async () => {
				if (!editing || !editing.content.trim()) return;
				try {
					await apiPost("/api/memory/put", {
						...(editing.id ? { id: editing.id } : {}),
						scope: editing.scope,
						content: editing.content.trim(),
						tags: editing.tags.split(",").map((s) => s.trim()).filter(Boolean),
					});
					setEditing(null);
					setNotice("saved");
					setTimeout(() => setNotice(null), 1500);
					await load();
				} catch (e) {
					setError(String(e.message || e));
				}
			}, [editing, load]);

			const removeRecord = react.useCallback(async (id) => {
				try {
					await apiGet(`/api/memory/delete?id=${encodeURIComponent(id)}`);
					await load();
				} catch (e) {
					setError(String(e.message || e));
				}
			}, [load]);

			const [exportFormat, setExportFormat] = react.useState("json");
			const [showSettings, setShowSettings] = react.useState(false);

			const doExport = react.useCallback(async () => {
				try {
					const data = await apiGet(`/api/memory/list?scope=all`);
					const records = (data.results || []).map((r) => ({ scope: r.scope, content: r.content, tags: r.tags || [] }));
					const stamp = new Date().toISOString().slice(0, 10);
					if (exportFormat === "markdown") {
						const lines = ["# Long-term memory export", ""];
						for (const scope of ["user", "global", "workspace"]) {
							const group = records.filter((r) => r.scope === scope);
							if (group.length === 0) continue;
							lines.push(`## ${scope}`, "");
							for (const r of group) {
								const tags = r.tags.length > 0 ? ` [${r.tags.join(", ")}]` : "";
								lines.push(`- ${r.content}${tags}`);
							}
							lines.push("");
						}
						downloadFile(`long-term-memory-${stamp}.md`, lines.join("\n"), "text/markdown");
					} else {
						downloadFile(`long-term-memory-${stamp}.json`, JSON.stringify({ version: 1, records }, null, 2), "application/json");
					}
					setNotice("exported");
					setTimeout(() => setNotice(null), 1500);
				} catch (e) {
					setError(String(e.message || e));
				}
			}, [exportFormat]);

			const doImport = react.useCallback(async () => {
				try {
					const data = await apiPost("/api/memory/import", { bundle: importText });
					setImportOpen(false);
					setImportText("");
					setNotice(`imported ${data.imported}`);
					setTimeout(() => setNotice(null), 2000);
					await load();
				} catch (e) {
					setError(String(e.message || e));
				}
			}, [importText, load]);

			const scopeOptions = ["user", "global", "workspace"].map((s) =>
				react.createElement("option", { key: s, value: s }, t(`scope.${s}`))
			);

			// ── 按逻辑分类（tag）分组展示 ──────────────────────────────────────
			// 按作用域优先分组展示（与存储层级一致）：分组段 = 用户画像/全局/工作区，
			// 每条记录带 tag 徽标。分类（tag）下拉作为二级过滤。
			const SCOPES = ["user", "global", "workspace"];
			const categoryLabel = (tag) => {
				const known = t(`tag.${tag}`);
				return known && !known.startsWith("tag.") ? known : `#${tag}`;
			};
			// 当前记录里出现过的 tag（用于分类下拉，不影响分组）。
			const cats = [...new Set((records || []).flatMap((r) => (Array.isArray(r.tags) ? r.tags : [])))].sort();
			const byScope = new Map();
			for (const r of records || []) {
				if (catFilter !== "all" && !(Array.isArray(r.tags) && r.tags.includes(catFilter))) continue;
				const sc = (typeof r.scope === "string" && SCOPES.includes(r.scope)) ? r.scope : "global";
				if (!byScope.has(sc)) byScope.set(sc, []);
				byScope.get(sc).push(r);
			}
			const visibleScopes = SCOPES.filter((sc) => (scopeFilter === "all" || scopeFilter === sc) && byScope.has(sc));
			const sections = visibleScopes.map((sc) => {
				const list = byScope.get(sc);
				const rows = list.map((r) =>
					react.createElement("div", { key: r.id, style: { borderBottom: "1px solid rgba(128,128,128,.2)", padding: "6px 0", opacity: r.superseded ? .55 : 1 } },
						react.createElement("div", { style: { display: "flex", gap: 6, alignItems: "center" } },
							r.superseded === true && react.createElement("span", { style: { fontSize: 11, color: "#b8860b", border: "1px solid rgba(184,134,11,.5)", borderRadius: 8, padding: "0 5px" } }, t("panel.superseded")),
							react.createElement("span", { style: { fontSize: 11, opacity: .5 } }, `#${String(r.id).slice(0, 8)}`),
							react.createElement("button", { onClick: () => setEditing({ id: r.id, scope: r.scope, content: r.content, tags: (r.tags || []).join(", ") }), style: btnStyle }, t("panel.edit")),
							react.createElement("button", { onClick: () => removeRecord(r.id), style: { ...btnStyle, color: "#c33" } }, t("panel.delete")),
						),
						react.createElement("div", { style: { marginTop: 2, whiteSpace: "pre-wrap", color: "var(--dsw-alias-label-secondary, #8a8a8a)" } }, ...renderContent(r.content, r.id)),
						(r.tags && r.tags.length > 0) &&
							react.createElement("div", { style: { fontSize: 11, color: "var(--dsw-alias-label-tertiary, #a4a4a4)" } }, r.tags.map((tag) => `#${tag}`).join(" ")),
					)
				);
				return react.createElement("div", { key: sc },
					react.createElement("div", { style: { display: "flex", alignItems: "baseline", gap: 6, margin: "8px 0 2px", borderBottom: "1px solid rgba(128,128,128,.25)" } },
						react.createElement("span", { style: { fontWeight: 700, fontSize: 13, color: "var(--dsw-alias-label-primary, inherit)" } }, t(`scope.${sc}`)),
						react.createElement("span", { style: { fontSize: 11, opacity: .5 } }, `(${list.length})`),
					),
					rows,
				);
			});

			const filterRow = react.createElement("div", { style: { display: "flex", gap: 6, marginBottom: 8 } },
				react.createElement("input", {
					style: { flex: 1 },
					placeholder: t("panel.search"),
					value: query,
					onChange: (e) => setQuery(e.target.value),
					onKeyDown: (e) => { if (e.key === "Enter") runSearch(); },
				}),
				react.createElement("select", { value: scopeFilter, onChange: (e) => setScopeFilter(e.target.value) },
					react.createElement("option", { value: "all" }, t("panel.filter")),
					...scopeOptions,
				),
				react.createElement("select", { value: catFilter, onChange: (e) => setCatFilter(e.target.value), title: t("panel.categoryAll") },
					react.createElement("option", { value: "all" }, t("panel.categoryAll")),
					...cats.map((c) => react.createElement("option", { key: c, value: c }, categoryLabel(c))),
				),
				react.createElement("button", { onClick: runSearch }, "⟳"),
			);

			const editor = editing && react.createElement("div", { style: { border: "1px solid rgba(128,128,128,.3)", padding: 8, marginBottom: 8, borderRadius: 6 } },
				react.createElement("div", null, t("panel.scope"),
					react.createElement("select", { value: editing.scope, onChange: (e) => setEditing({ ...editing, scope: e.target.value }) }, ...scopeOptions),
				),
				react.createElement("textarea", {
					style: { width: "100%", minHeight: 60, marginTop: 4 },
					placeholder: t("panel.content"),
					value: editing.content,
					onChange: (e) => setEditing({ ...editing, content: e.target.value }),
				}),
				react.createElement("input", {
					style: { width: "100%", marginTop: 4 },
					placeholder: t("panel.tags"),
					value: editing.tags,
					onChange: (e) => setEditing({ ...editing, tags: e.target.value }),
				}),
				react.createElement("div", { style: { marginTop: 6, display: "flex", gap: 6 } },
					react.createElement("button", { onClick: saveRecord }, t("panel.save")),
					react.createElement("button", { onClick: () => setEditing(null) }, t("panel.cancel")),
				),
			);

			const importRow = importOpen && react.createElement("div", { style: { border: "1px solid rgba(128,128,128,.3)", padding: 8, marginBottom: 8, borderRadius: 6 } },
				react.createElement("textarea", {
					style: { width: "100%", minHeight: 80 },
					placeholder: t("panel.importHint"),
					value: importText,
					onChange: (e) => setImportText(e.target.value),
				}),
				react.createElement("div", { style: { marginTop: 6, display: "flex", gap: 6 } },
					react.createElement("button", { onClick: doImport }, t("panel.import")),
					react.createElement("button", { onClick: () => setImportOpen(false) }, t("panel.cancel")),
				),
			);

			const toolbar = react.createElement("div", { style: { display: "flex", gap: 6, marginBottom: 8, alignItems: "center", flexWrap: "wrap" } },
				react.createElement("select", { value: exportFormat, onChange: (e) => setExportFormat(e.target.value), style: btnStyle }, 
					react.createElement("option", { value: "json" }, "JSON"),
					react.createElement("option", { value: "markdown" }, "MD"),
				),
				react.createElement("button", { onClick: doExport, style: btnStyle }, t("panel.export")),
				react.createElement("button", { onClick: () => setImportOpen(!importOpen), style: btnStyle }, t("panel.import")),
				react.createElement("button", { onClick: () => setEditing({ scope: "global", content: "", tags: "" }), style: { ...btnStyle, background: "rgba(60,140,255,.2)", borderColor: "rgba(60,140,255,.4)" } }, t("panel.add")),
				react.createElement("button", { onClick: () => setShowSettings(!showSettings), style: { ...btnStyle, background: showSettings ? "rgba(60,200,120,.2)" : undefined } }, t("panel.settings")),
				usage > 0 && react.createElement("span", { style: { fontSize: 11, opacity: .6, marginLeft: "auto" } }, t("panel.usage", { used: usage, limit })),
			);

			const body = showSettings
				? react.createElement(SettingsCard, null)
				: react.createElement("div", null,
					editor,
					importRow,
					loading ? react.createElement("div", null, t("panel.loading")) : (sections.length ? sections : react.createElement("div", { style: { opacity: .6 } }, (records && records.length > 0) ? t("panel.emptyFilter") : t("panel.empty"))),
				);

			return react.createElement("div", { style: { padding: 10, fontSize: 13, overflowY: "auto", height: "100%" } },
				!embedded && react.createElement("div", { style: { display: "flex", alignItems: "center", fontWeight: 600, marginBottom: 8 } },
					react.createElement("span", { style: { flex: 1 } }, t("panel.title")),
					typeof closeDetails === "function" && react.createElement("button", { onClick: closeDetails, style: { ...btnStyle, padding: "2px 8px" }, title: t("panel.close") }, "✕"),
				),
				notice && react.createElement("div", { style: { color: "#3a9" } }, notice),
				error && react.createElement("div", { style: { color: "#c33", marginBottom: 6 } }, t("panel.error", { message: error })),
				filterRow,
				toolbar,
				body,
			);
		}

		//#endregion

		//#region lib/types/client/SettingsCard.js
		/**
		 * The settings card rendered in Settings → Plugins → long-term-memory.
		 * Reads/writes /api/memory/settings.
		 */
		function SettingsCard(props) {
			const t = makeT();
			const [cfg, setCfg] = react.useState(null);
			const [notice, setNotice] = react.useState(null);
			react.useEffect(() => {
				apiGet("/api/memory/settings").then(setCfg).catch((e) => setCfg({ error: String(e) }));
			}, []);
			if (!cfg) return react.createElement("div", null, t("panel.loading"));
			if (cfg.error) return react.createElement("div", null, String(cfg.error));
			const set = (patch) => setCfg({ ...cfg, ...patch });
			const save = async () => {
				try {
					await apiPost("/api/memory/settings", cfg);
					setNotice(true);
					setTimeout(() => setNotice(false), 1500);
				} catch (e) { /* settings write errors surface via settings.yaml validation */ }
			};
			const row = (label, desc, control) => react.createElement("div", { style: { padding: "8px 0", borderBottom: "1px solid rgba(128,128,128,.15)" } },
				react.createElement("div", { style: { fontWeight: 600 } }, label),
				desc && react.createElement("div", { style: { fontSize: 12, opacity: .65 } }, desc),
				react.createElement("div", { style: { marginTop: 4 } }, control),
			);
			return react.createElement("div", { style: { padding: 12 } },
				react.createElement("div", { style: { fontWeight: 700, marginBottom: 8 } }, t("settings.title")),
				notice && react.createElement("div", { style: { color: "#3a9", marginBottom: 6 } }, t("settings.saved")),
				row(t("settings.autoSummarize"), t("settings.autoSummarizeDesc"),
					react.createElement("input", { type: "checkbox", checked: !!cfg.autoSummarize, onChange: (e) => set({ autoSummarize: e.target.checked }) })),
				row(t("settings.compressWithLLM"), t("settings.compressWithLLMDesc"),
					react.createElement("input", { type: "checkbox", checked: !!cfg.compressWithLLM, onChange: (e) => set({ compressWithLLM: e.target.checked }) })),
				row(t("settings.injectContext"), null,
					react.createElement("select", { value: cfg.injectContext || "recent", onChange: (e) => set({ injectContext: e.target.value }) },
						react.createElement("option", { value: "recent" }, "recent"),
						react.createElement("option", { value: "full" }, "full"),
						react.createElement("option", { value: "off" }, "off"),
					)),
				row(t("settings.requireApproval"), null,
					react.createElement("input", { type: "checkbox", checked: !!cfg.requireApprovalForWrite, onChange: (e) => set({ requireApprovalForWrite: e.target.checked }) })),
				row(t("settings.charLimit"), null,
					react.createElement("input", { type: "number", value: cfg.charLimit || 0, onChange: (e) => set({ charLimit: Number(e.target.value) }) })),
				react.createElement("button", { onClick: save, style: { ...btnStyle, marginTop: 10, background: "rgba(60,140,255,.2)", borderColor: "rgba(60,140,255,.4)" } }, t("panel.save")),
			);
		}
		//#endregion

		//#region lib/types/client/apply.js
		// Browser-side services this client bundle needs, resolved by the client
		// module loader: slots (dsh-client-ui-slots, for the Settings card) and
		// locale (dsh-client-locale). The right-Sidebar tab type belongs to the
		// merged bundle — see the panel hand-off in apply().
		const inject = ["slots", "locale"];
		/**
		 * Contribute the panel and register the Settings → Plugins card.
		 *
		 * The merged bundle pairs two panels per tab (see src/composite), so this
		 * fragment registers no tab type of its own.
		 * @param ctx - client context (slots / locale).
		 */
		function apply(ctx) {
			ctx.effect(() => ctx.locale.register(NS, { zh, en }), "long-term-memory: dictionaries");
			// Bind the translator the panel's makeT() reads, so panel copy follows
			// the active locale.
			ltmT = ctx.locale.bind(NS);

			panels.longTermMemory = {
				Component: MemoryPanel,
				ns: NS,
				titleKey: "panel.title",
				t: ctx.locale.bind(NS),
			};

			// Settings card in Settings → Plugins → long-term-memory.
			// `key` matches the settings namespace so the Plugins page dispatches
			// this card only for the long-term-memory entry.
			ctx.slots.inject("settings.plugin.item", () => ctx.slots.register({
				name: "settings.plugin.item",
				key: "long-term-memory",
				locale: NS,
				inject: () => ({}),
			}, SettingsCard));
		}
		//#endregion
		return { apply, inject };
	}

	// ---- terminalNotes (merged from client.js) ----
	function terminalNotes(react, react_jsx_runtime, panels) {
const NS = "terminal-notes";
		const zh = {
			"terminal.placeholder": "输入命令，回车执行（bash -lc）",
			"terminal.run": "执行",
			"terminal.running": "运行中…",
			"terminal.error": "执行失败",
			"terminal.timeout": "命令超时，已终止",
			"terminal.exit": "退出码",
			"notes.new": "新建",
			"notes.delete": "删除",
			"notes.empty": "还没有便签，点「新建」创建一条",
			"notes.placeholder": "在这里写点什么…",
			"notes.saving": "保存中…",
			"notes.saved": "已保存",
			"notes.failed": "保存失败",
			"notes.untitled": "未命名",
			"notes.hideList": "隐藏列表",
			"notes.showList": "显示列表",
			"terminal.title": "终端",
			"tab.terminalDescription": "在会话工作目录执行 shell 命令",
			"terminal.hintsTitle": "常用命令：",
			"notes.title": "记事本",
			"tab.notesDescription": "随手记录便签，自动保存",
		};
		const en = {
			"terminal.placeholder": "Type a command, Enter to run (bash -lc)",
			"terminal.run": "Run",
			"terminal.running": "Running…",
			"terminal.error": "Execution failed",
			"terminal.timeout": "Command timed out and was killed",
			"terminal.exit": "exit",
			"notes.new": "New",
			"notes.delete": "Delete",
			"notes.empty": "No notes yet — click New to create one",
			"notes.placeholder": "Write something…",
			"notes.saving": "Saving…",
			"notes.saved": "Saved",
			"notes.failed": "Save failed",
			"notes.untitled": "Untitled",
			"notes.hideList": "Hide list",
			"notes.showList": "Show list",
			"terminal.title": "Terminal",
			"tab.terminalDescription": "Run shell commands in the session workspace",
			"terminal.hintsTitle": "Common commands:",
			"notes.title": "Notes",
			"tab.notesDescription": "Scratch notes, saved automatically",
		};
		const dict = (locale) => (locale === "en" ? en : zh);
		let activeLocale = undefined;
		const t = (key) => dict(activeLocale)[key] ?? key;

		// ---- shared styles ----------------------------------------------------
		const panelStyle = {
			display: "flex", flexDirection: "column", gap: 8, height: "100%",
			padding: 10, boxSizing: "border-box", overflow: "auto",
			fontFamily: "inherit", fontSize: 13,
		};
		const inputStyle = {
			width: "100%", boxSizing: "border-box", padding: "6px 8px",
			border: "1px solid rgba(128,128,128,.35)", borderRadius: 6,
			background: "rgba(0,0,0,.06)", color: "inherit", fontSize: 13,
			outline: "none",
		};
		const buttonStyle = {
			alignSelf: "flex-start", padding: "4px 12px", fontSize: 12, cursor: "pointer",
			border: "1px solid rgba(128,128,128,.4)", borderRadius: 6,
			background: "rgba(128,128,128,.15)", color: "inherit",
		};

		// ---- terminal panel ---------------------------------------------------
		// Styled as a small dark terminal: dark background, monospace text.
		function TerminalPanel() {
			const [cmd, setCmd] = react.useState("");
			const [output, setOutput] = react.useState("");
			const [running, setRunning] = react.useState(false);
			const [error, setError] = react.useState("");
			const run = async () => {
				const line = cmd.trim();
				if (!line || running) return;
				setRunning(true);
				setError("");
				setOutput("");
				try {
					const res = await fetch("/api/terminal-notes/exec", {
						method: "POST",
						headers: { "content-type": "application/json" },
						body: JSON.stringify({ command: line }),
					});
					const data = await res.json();
					if (!data.ok) {
						// A command killed at the deadline may still have printed
						// something useful; keep it under the error instead of
						// throwing it away. `error` is a code, not prose, so the
						// message can be localized here.
						setOutput(data.output || "");
						setError(data.error === "timeout"
							? t("terminal.timeout") + ` (${Math.round((data.timeoutMs ?? 0) / 1000)}s)`
							: (data.error || "unknown error"));
					} else {
						const suffix = data.code == null ? "" : `\n[${t("terminal.exit")} ${data.code}]`;
						setOutput((data.output || "") + suffix);
					}
				} catch (err) {
					setError(String(err?.message ?? err));
				} finally {
					setRunning(false);
				}
			};
			const termWrap = {
				display: "flex", flexDirection: "column", gap: 8, height: "100%",
				boxSizing: "border-box", padding: 10,
				background: "#101418", color: "#d4d4d4",
				borderRadius: 8, overflow: "auto",
				fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontSize: 12,
			};
			const termInput = {
				flex: "0 0 auto", boxSizing: "border-box", padding: "6px 8px",
				background: "#1b2027", color: "#e6e6e6",
				border: "1px solid #333a44", borderRadius: 6, outline: "none",
				fontFamily: "inherit", fontSize: 12,
			};
			const termOutput = {
				margin: 0, flex: "1 1 auto", overflow: "auto", whiteSpace: "pre-wrap",
				wordBreak: "break-word", lineHeight: 1.5,
			};
			const hintStyle = {
				flex: "1 1 auto", overflow: "auto", fontSize: 11, lineHeight: 1.7,
				color: "#8a94a3", borderTop: "1px solid #2a313a",
				paddingTop: 8,
			};
			const hints = [
				"ls -la                   列出文件",
				"pwd                      当前目录",
				"cat <file>               查看文件",
				"echo hello               输出文本",
				"grep -r <pattern> <dir>  递归搜索",
				"ps aux | grep <name>     查找进程",
				"df -h / du -sh *         磁盘占用",
				"cd .. && ls              回到上级目录",
			];
			return react.createElement("div", { style: termWrap },
				react.createElement("div", { style: { display: "flex", gap: 6 } },
					react.createElement("input", {
						style: { ...termInput, flex: 1 },
						placeholder: t("terminal.placeholder"),
						value: cmd,
						onChange: (e) => setCmd(e.target.value),
						onKeyDown: (e) => { if (e.key === "Enter") run(); },
						disabled: running,
					}),
					react.createElement("button", {
						style: { ...termInput, cursor: running ? "default" : "pointer", flex: "0 0 auto" },
						onClick: run, disabled: running,
					}, running ? t("terminal.running") : t("terminal.run")),
				),
				error && react.createElement("div", { style: { color: "#ff6b6b" } },
					t("terminal.error") + ": " + error),
				output !== "" && react.createElement("pre", { style: termOutput }, output),
				output === "" && !error && react.createElement("div", { style: hintStyle },
					react.createElement("div", { style: { fontWeight: 600, marginBottom: 4, color: "#aab4c2" } },
						t("terminal.hintsTitle")),
					hints.map((h, i) => react.createElement("div", { key: i }, h)),
				),
			);
		}

		// ---- notes panel (multi-note, Apple Notes style) ----------------------
		function NotesPanel() {
			const [notes, setNotes] = react.useState([]);       // [{id,title,updatedAt}]
			const [activeId, setActiveId] = react.useState(null);
			const [text, setText] = react.useState("");
			const [status, setStatus] = react.useState("");
			const [loading, setLoading] = react.useState(true);
			// 2.1/2.3: list visibility — default shown; after opening a note or
			// creating one it collapses so the content gets the full width.
			const [showList, setShowList] = react.useState(true);
			// 2.2: list width — narrower default (120px), user-draggable.
			const [listWidth, setListWidth] = react.useState(120);
			let debounceTimer = null;
			let dragState = null;

			const refreshList = async () => {
				try {
					const res = await fetch("/api/terminal-notes/notes");
					const data = await res.json();
					if (data.ok) {
						const list = data.notes || [];
						setNotes(list);
						if (!list.some((n) => n.id === activeId)) {
							if (list.length > 0) select(list[0].id);
							else { setActiveId(null); setText(""); }
						}
					}
				} catch { /* ignore */ }
			};
			const select = async (id, opts) => {
				setActiveId(id);
				// 2.1: opening a note hides the list (focus the content).
				if (!opts || opts.hideList !== false) setShowList(false);
				try {
					const res = await fetch("/api/terminal-notes/note?id=" + encodeURIComponent(id));
					const data = await res.json();
					if (data.ok) {
						setText(data.text || "");
						setStatus("");
					}
				} catch { setText(""); }
			};
			react.useEffect(() => {
				refreshList();
				setLoading(false);
				// eslint-disable-next-line react-hooks/exhaustive-deps
			}, []);

			const save = async (value) => {
				if (!activeId) return;
				try {
					const res = await fetch("/api/terminal-notes/note", {
						method: "POST",
						headers: { "content-type": "application/json" },
						body: JSON.stringify({ id: activeId, text: value }),
					});
					const data = await res.json();
					setStatus(data.ok ? t("notes.saved") : t("notes.failed"));
					refreshList(); // re-sort + re-title
				} catch {
					setStatus(t("notes.failed"));
				}
				setTimeout(() => setStatus(""), 1500);
			};
			const onChange = (e) => {
				const value = e.target.value;
				setText(value);
				setStatus(t("notes.saving"));
				clearTimeout(debounceTimer);
				debounceTimer = setTimeout(() => save(value), 600);
			};
			const createNote = async () => {
				try {
					const res = await fetch("/api/terminal-notes/notes", { method: "POST" });
					const data = await res.json();
					if (data.ok) {
						await refreshList();
						select(data.id);
						setStatus(t("notes.saved"));
					}
				} catch { /* ignore */ }
			};
			const deleteNote = async () => {
				if (!activeId) return;
				try {
					await fetch("/api/terminal-notes/note-delete", {
						method: "POST",
						headers: { "content-type": "application/json" },
						body: JSON.stringify({ id: activeId }),
					});
					setActiveId(null);
					setText("");
					setShowList(true);
					refreshList();
				} catch { /* ignore */ }
			};

			// 2.2: drag the splitter between list and content.
			const startSplitDrag = (e) => {
				e.preventDefault();
				const startX = e.clientX;
				const startW = listWidth;
				dragState = { startX, startW };
				const onMove = (ev) => {
					if (!dragState) return;
					const next = Math.min(280, Math.max(90, dragState.startW + (ev.clientX - dragState.startX)));
					setListWidth(next);
				};
				const onUp = () => {
					dragState = null;
					window.removeEventListener("mousemove", onMove);
					window.removeEventListener("mouseup", onUp);
				};
				window.addEventListener("mousemove", onMove);
				window.addEventListener("mouseup", onUp);
			};

			const sidebarStyle = {
				width: listWidth, flex: "0 0 auto", overflowY: "auto",
				border: "1px solid rgba(128,128,128,.25)", borderRadius: 6,
				display: "flex", flexDirection: "column",
			};
			const splitterStyle = {
				width: 5, flex: "0 0 auto", cursor: "col-resize",
				background: "rgba(128,128,128,.12)", borderRadius: 3,
				alignSelf: "stretch",
			};
			const itemStyle = (active) => ({
				padding: "6px 8px", cursor: "pointer", fontSize: 12,
				borderBottom: "1px solid rgba(128,128,128,.15)",
				background: active ? "rgba(90,140,255,.18)" : "transparent",
				whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
			});
			const toolbarStyle = {
				display: "flex", gap: 6, alignItems: "center",
			};
			const rowStyle = {
				display: "flex", gap: 8, height: "100%", minHeight: 0,
			};
			return react.createElement("div", { style: panelStyle },
				react.createElement("div", { style: toolbarStyle },
					react.createElement("button", { style: { ...buttonStyle, alignSelf: "auto", padding: "3px 10px" }, onClick: createNote }, t("notes.new")),
					react.createElement("button", { style: { ...buttonStyle, alignSelf: "auto", padding: "3px 10px" }, onClick: deleteNote, disabled: !activeId }, t("notes.delete")),
					// 2.3: manual list toggle.
					react.createElement("button", {
						style: { ...buttonStyle, alignSelf: "auto", padding: "3px 10px" },
						onClick: () => setShowList(!showList),
						title: showList ? t("notes.hideList") : t("notes.showList"),
					}, showList ? t("notes.hideList") : t("notes.showList")),
					status && react.createElement("span", { style: { fontSize: 11, opacity: 0.6 } }, status),
				),
				react.createElement("div", { style: rowStyle },
					showList && react.createElement("div", { style: sidebarStyle },
						notes.length === 0
							? react.createElement("div", { style: { padding: 8, fontSize: 12, opacity: 0.6 } }, t("notes.empty"))
							: notes.map((n) => react.createElement("div", {
								key: n.id,
								style: itemStyle(n.id === activeId),
								onClick: () => select(n.id),
								title: n.title,
							}, n.title || t("notes.untitled"))),
					),
					showList && react.createElement("div", { style: splitterStyle, onMouseDown: startSplitDrag }),
					react.createElement("textarea", {
						style: { ...inputStyle, flex: 1, resize: "none", lineHeight: 1.5 },
						placeholder: t("notes.placeholder"),
						value: text,
						onChange,
						disabled: !activeId || loading,
					}),
				),
			);
		}

		// ---- panel hand-off --------------------------------------------------
		// The merged bundle owns the right-Sidebar tab types and pairs two panels
		// per tab (see src/composite), so this fragment registers no seat.
		const inject = ["locale"];

		function apply(ctx) {
			activeLocale = undefined;
			ctx.effect(() => ctx.locale.register(NS, { zh, en }), "terminal-notes: dictionaries");
			// Locale probe: the panels take no props, so bind once and reuse the
			// plain t() in components.
			try {
				const locale = ctx.get("locale");
				if (locale && typeof locale.bind === "function") {
					const bound = locale.bind(NS);
					const probe = bound("terminal.run");
					if (probe === zh["terminal.run"]) activeLocale = "zh";
					else if (probe === en["terminal.run"]) activeLocale = "en";
				}
			} catch { /* keep zh default */ }
			panels.terminal = { Component: TerminalPanel, ns: NS, titleKey: "terminal.title", t };
			panels.notes = { Component: NotesPanel, ns: NS, titleKey: "notes.title", t };
		}
		return { apply, inject };
	}

	// ---- composite (merged from client.js) ----
	function composite(react, react_jsx_runtime, panels) {
//#region lib/types/client/pairs.js
		/** This fragment's own copy namespace (the pair titles and the divider hint). */
		const NS = "minimal-ui-panels";
		const zh = {
			"pair.artifactsTerminal": "产物 + 终端",
			"pair.artifactsTerminal.hint": "上：产物，下：终端",
			"pair.memoryNotes": "长期记忆 + 记事本",
			"pair.memoryNotes.hint": "上：长期记忆，下：记事本",
			"divider.hint": "上下拖动调整比例，双击恢复 50/50"
		};
		const en = {
			"pair.artifactsTerminal": "Artifacts + Terminal",
			"pair.artifactsTerminal.hint": "Top: artifacts, bottom: terminal",
			"pair.memoryNotes": "Memory + Notes",
			"pair.memoryNotes.hint": "Top: memory, bottom: notes",
			"divider.hint": "Drag to resize, double-click for 50/50"
		};
		/**
		 * The shipped pairings. `top`/`bottom` key into the `panels` registry;
		 * reordering or regrouping the panels is a change to this array alone.
		 */
		const PAIRS = [
			{
				id: "dsh-minimal-ui-panels/artifacts-terminal",
				kind: "artifacts-terminal",
				order: 10,
				top: "artifacts",
				bottom: "terminal",
				titleKey: "pair.artifactsTerminal",
				hintKey: "pair.artifactsTerminal.hint"
			},
			{
				id: "dsh-minimal-ui-panels/memory-notes",
				kind: "memory-notes",
				order: 20,
				top: "longTermMemory",
				bottom: "notes",
				titleKey: "pair.memoryNotes",
				hintKey: "pair.memoryNotes.hint"
			}
		];
		//#endregion
		//#region lib/types/client/ratio.js
		/** Where a pairing's remembered split lives, one key per tab type id. */
		const RATIO_PREFIX = "dsh-minimal-ui-panels:pair-ratio:";
		/** Keep both halves usable: the divider may never reach an edge. */
		const MIN_RATIO = 0.15;
		const MAX_RATIO = 0.85;
		/**
		 * Read a pairing's remembered split.
		 * @param id - the pairing's tab type id.
		 * @returns the top half's share, clamped to the usable band; 0.5 when unset.
		 */
		function readRatio(id) {
			try {
				const raw = localStorage.getItem(RATIO_PREFIX + id);
				const value = raw === null ? NaN : Number(raw);
				return Number.isFinite(value) && value >= MIN_RATIO && value <= MAX_RATIO ? value : 0.5;
			} catch {
				return 0.5;
			}
		}
		/**
		 * Remember a pairing's split. Failures are ignored: a pane that cannot
		 * persist still works, it just forgets on the next boot.
		 * @param id - the pairing's tab type id.
		 * @param value - the top half's share.
		 */
		function writeRatio(id, value) {
			try {
				localStorage.setItem(RATIO_PREFIX + id, String(value));
			} catch { /* ignore */ }
		}
		//#endregion
		//#region lib/types/client/PairBody.js
		/** One half's box: it must be allowed to shrink, or the panels cannot scroll. */
		function halfStyle(share) {
			return {
				flex: `${share} 1 0%`,
				minHeight: 0,
				minWidth: 0,
				display: "flex",
				flexDirection: "column",
				overflow: "hidden"
			};
		}
		/** The title row this file draws in place of the panel's own chrome. */
		const headerStyle = {
			flex: "0 0 auto",
			display: "flex",
			alignItems: "center",
			padding: "4px 10px",
			fontSize: 12,
			fontWeight: 600,
			lineHeight: "18px",
			color: "var(--dsw-alias-label-secondary,#555)",
			borderBottom: "1px solid var(--dsw-alias-border-l1,#ececec)"
		};
		/** The draggable separator between the two halves. */
		const dividerStyle = {
			flex: "0 0 auto",
			height: 7,
			cursor: "row-resize",
			display: "flex",
			alignItems: "center",
			justifyContent: "center",
			borderTop: "1px solid var(--dsw-alias-border-l1,#ececec)",
			borderBottom: "1px solid var(--dsw-alias-border-l1,#ececec)",
			background: "var(--dsw-alias-bg-base,#fff)"
		};
		/** The divider's grip: a short bar rather than a full-width rule. */
		const gripStyle = {
			width: 28,
			height: 2,
			borderRadius: 1,
			background: "var(--dsw-alias-border-l2,#d8d8d8)"
		};
		/** The box each panel gets inside its half. */
		const panelBoxStyle = {
			flex: "1 1 auto",
			minHeight: 0,
			display: "flex",
			flexDirection: "column",
			overflow: "hidden"
		};
		/**
		 * Build the tab body for one pairing.
		 *
		 * The two panels stack vertically, not side by side: a Sidebar pane is a
		 * narrow column, so a vertical split is the only arrangement that leaves
		 * both halves legible — and it is what lets two panes show four panels.
		 * @param pair - one entry of {@link PAIRS}.
		 * @returns the component the `sidebar.right.pane.tab` seat renders.
		 */
		function makePairBody(pair) {
			return function PairBody(props) {
				const { sessionId, useSessions, useWorkspaces, t } = props;
				const boxRef = react.useRef(null);
				const draggingRef = react.useRef(false);
				const [ratio, setRatio] = react.useState(() => readRatio(pair.id));
				const ratioRef = react.useRef(ratio);
				ratioRef.current = ratio;
				react.useEffect(() => {
					const onMove = (event) => {
						const box = boxRef.current;
						if (draggingRef.current !== true || box === null) return;
						const rect = box.getBoundingClientRect();
						if (rect.height <= 0) return;
						const next = (event.clientY - rect.top) / rect.height;
						setRatio(Math.min(MAX_RATIO, Math.max(MIN_RATIO, next)));
					};
					const onUp = () => {
						if (draggingRef.current !== true) return;
						draggingRef.current = false;
						document.body.style.userSelect = "";
						writeRatio(pair.id, ratioRef.current);
					};
					window.addEventListener("mousemove", onMove);
					window.addEventListener("mouseup", onUp);
					return () => {
						window.removeEventListener("mousemove", onMove);
						window.removeEventListener("mouseup", onUp);
					};
				}, []);
				const top = panels[pair.top];
				const bottom = panels[pair.bottom];
				// A panel missing from the registry means the merge order broke
				// (composite applied before its sources). Render nothing rather
				// than throwing inside the seat.
				if (top === void 0 || bottom === void 0) return null;
				const halfProps = { sessionId, useSessions, useWorkspaces, embedded: true };
				const half = (panel, share) => react.createElement("div", { style: halfStyle(share) },
					react.createElement("div", { style: headerStyle }, panel.t(panel.titleKey)),
					react.createElement("div", { style: panelBoxStyle },
						react.createElement(panel.Component, Object.assign({}, halfProps, { t: panel.t }))
					)
				);
				return react.createElement("div", {
					ref: boxRef,
					style: { display: "flex", flexDirection: "column", height: "100%", minHeight: 0, minWidth: 0 }
				},
					half(top, ratio),
					react.createElement("div", {
						style: dividerStyle,
						title: t("divider.hint"),
						role: "separator",
						"aria-orientation": "horizontal",
						onMouseDown: (event) => {
							event.preventDefault();
							draggingRef.current = true;
							document.body.style.userSelect = "none";
						},
						onDoubleClick: () => {
							setRatio(0.5);
							writeRatio(pair.id, 0.5);
						}
					}, react.createElement("div", { style: gripStyle })),
					half(bottom, 1 - ratio)
				);
			};
		}
		//#endregion
		//#region lib/types/client/apply.js
		/** Required services: the slot registry, the locale seat, and the tab-type registry. */
		const inject = ["slots", "locale", "sidebarRightTabs"];
		/**
		 * Register one pairing as a right-Sidebar tab type.
		 *
		 * A page type carries no address to be opened by, so the `guide` entry is
		 * what makes it reachable: the strip's add control opens the guide page,
		 * whose capsules call `openTab(kind)`.
		 * @param ctx - client context (slots / locale / sidebarRightTabs).
		 * @param pair - one entry of {@link PAIRS}.
		 * @param t - this fragment's namespace-bound translator.
		 */
		function mountPair(ctx, pair, t) {
			ctx.effect(() => ctx.sidebarRightTabs.register({
				id: pair.id,
				kind: pair.kind,
				priority: "extension",
				title: () => t(pair.titleKey),
				guide: [{
					order: pair.order,
					title: () => t(pair.titleKey),
					description: () => t(pair.hintKey)
				}]
			}), `${pair.id}: tab type`);
			ctx.effect(() => ctx.slots.inject("sidebar.right.pane.tab", () => ctx.slots.register({
				name: "sidebar.right.pane.tab",
				key: pair.id,
				locale: NS
			}, makePairBody(pair))), `${pair.id}: tab body`);
		}
		/**
		 * Client plugin body: the dictionaries, then one tab type per pairing.
		 *
		 * MUST run after the three panel fragments: their `apply` fills the
		 * `panels` registry this file renders from. `scripts/merge-client.mjs`
		 * keeps that order.
		 * @param ctx - client root context.
		 */
		function apply(ctx) {
			ctx.effect(() => ctx.locale.register(NS, { zh, en }), "minimal-ui-panels: dictionaries");
			const t = ctx.locale.bind(NS);
			for (const pair of PAIRS) mountPair(ctx, pair, t);
		}
		//#endregion
		return { apply, inject };
	}

		function apply(ctx) {
			const panels = {};
			artifacts(react, react_jsx_runtime, panels).apply(ctx);
			ltm(react, react_jsx_runtime, panels).apply(ctx);
			terminalNotes(react, react_jsx_runtime, panels).apply(ctx);
			composite(react, react_jsx_runtime, panels).apply(ctx);
		}

		const inject = ["slots", "locale", "sidebarRightTabs"];
		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});
