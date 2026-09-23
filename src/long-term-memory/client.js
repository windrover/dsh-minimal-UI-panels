/**
 * dsh-long-term-memory — Browser half.
 *
 * Provides two client surfaces:
 *   1. A memory management panel in the right details column (`details` slot,
 *      priority -2, shadowing the shipped tool-details panel and
 *      artifacts-panel's -1 — lowest priority renders): list, search,
 *      add, edit, delete, export, and import memories across all scopes by
 *      calling the host routes `/api/memory/*`.
 *   2. A settings card in the native plugin settings page
 *      (`settings.plugin.item`, entryKey "long-term-memory"): basic switches
 *      (auto-summarize, LLM compression, injection mode, write approval,
 *      char limit) read/written through `/api/memory/settings` — rendered in
 *      the same place DSH's Settings → Plugins page shows plugin cards.
 *
 * The bundle is hand-written in the `__ModuleLoader__.load` format (same as
 * the shipped client plugins): plain React.createElement (no JSX build step),
 * `ctx.slots.inject` to mount, `ctx.locale.register` for dictionaries.
 */
window.__ModuleLoader__.load({
	id: "dsh-long-term-memory",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react = require("react");
		let react_jsx_runtime = require("react/jsx-runtime");

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
			"settings.autoSummarizeDesc": "每轮对话结束后用 LLM 蒸馏值得长期记住的事实（额外模型调用）。｜ 让 AI 自己把聊天里的重要内容自动存进记忆，不用你手动记。",
			"settings.compressWithLLM": "LLM 压缩",
			"settings.compressWithLLMDesc": "超限时用 LLM 精炼压缩（关闭则用纯规则压缩）。｜ 记忆快装满时，让 AI 把旧内容压得更短，留地方存新的。",
			"settings.injectContext": "上下文注入",
			"settings.injectContextDesc": "决定每次对话时把多少记忆塞进上下文。recent=只放最新的，full=全放，off=完全不自动注入。｜ 控制 AI 每次开口前，能想起你多少往事。",
			"settings.requireApproval": "写入审批",
			"settings.requireApprovalDesc": "开启后，AI 想新存记忆时会先放进待确认队列，等你批准才真正写入。｜ 给记忆加一道把关，AI 不能偷偷往里乱塞东西。",
			"settings.charLimit": "字符预算",
			"settings.charLimitDesc": "记忆库总容量上限（字符数），到顶后会按规则压缩。｜ 给记忆本子定个最大页数，写满了就整理旧内容。",
			"settings.saved": "已保存",
			"settings.semanticRecall": "语义召回（查询扩展）",
			"settings.semanticRecallDesc": "召回前让 LLM 把查询扩展成同义/改写变体再 BM25 合并，能抓回改写过的记忆（额外模型调用）。｜ 你换个说法问，AI 也能想起同一件事。",
			"settings.semanticRerank": "语义重排",
			"settings.semanticRerankDesc": "对 BM25 候选让 LLM 打 0–3 相关性分再排序，提升噪声库的精度（额外模型调用）。｜ AI 把翻出来的旧记忆按相关程度重新排个序，最贴题的放最前。",
			"settings.semanticVectorRecall": "本地向量召回",
			"settings.semanticVectorRecallDesc": "离线哈希向量（余弦）检索与 BM25 用 RRF 融合，抓回同义/改写匹配；零模型调用、零 API、不改 BM25 基线。｜ 在电脑本地再算一遍相似度，把意思相近但用词不同的记忆也捞出来，不联网、不花钱。",
			"settings.semanticDedupThreshold": "写入语义去重阈值",
			"settings.semanticDedupThresholdDesc": "autoSummarize 落库前，与既有记忆相似度≥此值则跳过，避免重复堆积（0=关闭，仅精确去重）。｜ 超过这个相似度就当成「已经记过了」直接跳过，免得同一件事记好多遍。",
			"settings.autoConsolidate": "主动整合",
			"settings.autoConsolidateDesc": "空闲期把近似重复/重叠记忆合并成更少更凝练的条目，避免库只增不减（需开启 LLM 压缩）。｜ AI 闲下来时，把零碎的同类记忆并成一条清爽的，笔记不越堆越乱。",
			"settings.consolidateIntervalMs": "整合间隔（毫秒）",
			"settings.consolidateIntervalMsDesc": "距离上次整合超过这么久，就触发一次整理（0=不按时间触发）。｜ 设定「多久大扫除一次记忆」的间隔。",
			"settings.consolidateMaxEntries": "整合触发条数",
			"settings.consolidateMaxEntriesDesc": "记忆条数超过这个数就触发一次整合。｜ 记忆攒到多少条，就自动归拢合并一次。",
			"settings.autoApproveAfterMs": "待确认自动放行（毫秒）",
			"settings.autoApproveAfterMsDesc": "开启写入审批后，autoSummarize 蒸馏的事实先进待确认队列；超过此时长未处理则自动落库（0=永不自动）。｜ 你一直没空看，超过这个时间就自动放行，不用手动批。",
			"panel.pending": "待确认",
			"panel.pendingEmpty": "队列为空",
			"panel.pendingApprove": "批准",
			"panel.pendingReject": "拒绝",
			"panel.pendingAutoIn": "自动放行倒计时",
			"panel.health": "健康度",
			"panel.healthLive": "有效记忆",
			"panel.healthUsage": "字符占用",
			"panel.healthDup": "近重复",
			"panel.healthSuperseded": "已更正",
			"panel.healthPending": "待确认",
			"panel.healthVec": "向量覆盖率",
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
			"settings.autoSummarizeDesc": "Distill durable facts with the LLM after each finished turn (extra model call). | the AI jots down the important bits from your chat into memory on its own — no manual note-taking.",
			"settings.compressWithLLM": "LLM compression",
			"settings.compressWithLLMDesc": "Refine with the LLM when over budget (off = rule-based compression). | when memory gets full, the AI shrinks old entries to make room for new ones.",
			"settings.injectContext": "Context injection",
			"settings.injectContextDesc": "How much memory to feed in before each reply. recent = latest only, full = everything, off = never auto-inject. | how much of your past the AI can recall each time it answers.",
			"settings.requireApproval": "Write approval",
			"settings.requireApprovalDesc": "When on, new memories go to a pending queue and only commit after you approve. | a gate so the AI can't quietly stuff junk into memory without your OK.",
			"settings.charLimit": "Char budget",
			"settings.charLimitDesc": "Total memory capacity in characters; over the cap it compresses by rule. | the max size of the memory notebook — old stuff gets tidied when it fills up.",
			"settings.saved": "Saved",
			"settings.semanticRecall": "Semantic recall (query expansion)",
			"settings.semanticRecallDesc": "Before recall, ask the LLM to expand the query into paraphrase/synonym variants and BM25-merge them — catches rewritten memories (extra model call). | word your question differently and the AI still remembers the same thing.",
			"settings.semanticRerank": "Semantic rerank",
			"settings.semanticRerankDesc": "Have the LLM score BM25 candidates 0–3 and re-rank — improves precision on noisy stores (extra model call). | the AI re-sorts the recalled memories by relevance, best match first.",
			"settings.semanticVectorRecall": "Local vector recall",
			"settings.semanticVectorRecallDesc": "Offline hash-vector (cosine) search, RRF-fused with BM25 — catches synonym/paraphrase matches with no model call and no API (adds one local pass per recall). | it also scores similarity locally, pulling out memories that mean the same even if the words differ — no internet, no cost.",
			"settings.semanticDedupThreshold": "Write dedup threshold",
			"settings.semanticDedupThresholdDesc": "On autoSummarize write, skip a fact whose Jaccard similarity to an existing memory ≥ this — avoids duplicate buildup (0 = off, exact dedup only). | above this similarity it treats it as 'already noted' and skips it, so the same thing isn't saved many times.",
			"settings.autoConsolidate": "Auto-consolidation",
			"settings.autoConsolidateDesc": "In idle, merge near-duplicate/overlapping memories into fewer, concise entries so the store stops growing dirty (needs LLM compression on). | when idle, the AI merges scattered similar notes into one tidy entry so things don't pile up.",
			"settings.consolidateIntervalMs": "Consolidation interval (ms)",
			"settings.consolidateIntervalMsDesc": "Trigger a cleanup once this long has passed since the last one (0 = don't trigger by time). | set how often memory gets a 'spring clean'.",
			"settings.consolidateMaxEntries": "Consolidation trigger count",
			"settings.consolidateMaxEntriesDesc": "Trigger consolidation once the memory count exceeds this. | when memory reaches this many entries, merge them down automatically.",
			"settings.autoApproveAfterMs": "Pending auto-approve (ms)",
			"settings.autoApproveAfterMsDesc": "With write approval on, autoSummarize facts wait in a pending queue; older than this are auto-committed (0 = never). | if you never get to it, after this long it auto-approves without a manual click.",
			"panel.pending": "Pending",
			"panel.pendingEmpty": "Queue is empty",
			"panel.pendingApprove": "Approve",
			"panel.pendingReject": "Reject",
			"panel.pendingAutoIn": "Auto-approve in",
			"panel.health": "Health",
			"panel.healthLive": "Live memories",
			"panel.healthUsage": "Chars used",
			"panel.healthDup": "Near-dupes",
			"panel.healthSuperseded": "Superseded",
			"panel.healthPending": "Pending",
			"panel.healthVec": "Vector coverage",
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
			const [vectorRecall, setVectorRecall] = react.useState(false); // 健康度条展示用（来自 /api/memory/settings）
			const [editing, setEditing] = react.useState(null); // null | { id?, scope, content, tags }
			const [importOpen, setImportOpen] = react.useState(false);
			const [importText, setImportText] = react.useState("");
			const [notice, setNotice] = react.useState(null);
			const [pending, setPending] = react.useState([]); // 待确认队列
			const [showPending, setShowPending] = react.useState(false);

			const load = react.useCallback(async () => {
				try {
					setLoading(true);
					const data = await apiGet(`/api/memory/list?scope=${scopeFilter}`);
					setRecords(data.results || []);
					const settings = await apiGet("/api/memory/settings");
					setUsage(data.results.reduce((s, r) => s + (r.content?.length || 0), 0));
					setLimit(settings.charLimit || 0);
					setVectorRecall(!!settings.semanticVectorRecall);
					try {
						const pd = await apiGet("/api/memory/pending");
						setPending(pd.items || []);
					} catch { /* pending 路由不可用时忽略 */ }
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

			// ── 待确认队列：批准 / 拒绝 ───────────────────────────────────────
			const resolvePending = react.useCallback(async (id, action) => {
				try {
					await apiPost("/api/memory/pending", { id, action });
					await load();
				} catch (e) {
					setError(String(e.message || e));
				}
			}, [load]);

			// ── 健康度（从已有 list + pending 推导，无需新接口）──────────────────
			const allRecords = records || [];
			const liveRecords = allRecords.filter((r) => r.superseded !== true);
			const supersededCount = allRecords.length - liveRecords.length;
			// 近似重复：任意两条 live 记忆 Jaccard 相似度 ≥ 0.6 即算一对近重复。
			function jaccard(a, b) {
				const ta = new Set((a.content || "").split(/\s+/).filter(Boolean));
				const tb = new Set((b.content || "").split(/\s+/).filter(Boolean));
				if (ta.size === 0 || tb.size === 0) return 0;
				let inter = 0;
				for (const w of ta) if (tb.has(w)) inter += 1;
				return inter / (ta.size + tb.size - inter);
			}
			let dupPairs = 0;
			for (let i = 0; i < liveRecords.length; i++) {
				for (let j = i + 1; j < liveRecords.length; j++) {
					if (jaccard(liveRecords[i], liveRecords[j]) >= 0.6) dupPairs += 1;
				}
			}
			const health = {
				live: liveRecords.length,
				usage,
				limit: limit || 0,
				dupPairs,
				superseded: supersededCount,
				pending: pending.length,
			};

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
				react.createElement("button", { onClick: () => setShowPending(!showPending), style: { ...btnStyle, background: showPending ? "rgba(60,200,120,.2)" : pending.length ? "rgba(220,160,40,.25)" : undefined } }, `${t("panel.pending")}${pending.length ? ` (${pending.length})` : ""}`),
				usage > 0 && react.createElement("span", { style: { fontSize: 11, opacity: .6, marginLeft: "auto" } }, t("panel.usage", { used: usage, limit })),
			);

			// 待确认队列视图（与列表互斥展示）。
			const pendingView = showPending && react.createElement("div", { style: { border: "1px solid rgba(220,160,40,.4)", padding: 8, marginBottom: 8, borderRadius: 6 } },
				react.createElement("div", { style: { fontWeight: 700, marginBottom: 6 } }, t("panel.pending")),
				pending.length === 0
					? react.createElement("div", { style: { opacity: .6 } }, t("panel.pendingEmpty"))
					: pending.map((it) =>
						react.createElement("div", { key: it.id, style: { borderBottom: "1px solid rgba(128,128,128,.2)", padding: "6px 0" } },
							react.createElement("div", { style: { display: "flex", gap: 6, alignItems: "center", fontSize: 11, opacity: .6 } },
								react.createElement("span", null, t(`scope.${it.scope === "user" ? "user" : it.scope === "global" ? "global" : "workspace"}`)),
								it.autoApproveInMs != null && react.createElement("span", null, `${t("panel.pendingAutoIn")}: ${Math.ceil(it.autoApproveInMs / 60000)}m`),
							),
							react.createElement("div", { style: { marginTop: 2, whiteSpace: "pre-wrap" } }, it.content),
							(it.tags && it.tags.length > 0) && react.createElement("div", { style: { fontSize: 11, color: "var(--dsw-alias-label-tertiary, #a4a4a4)" } }, it.tags.map((tag) => `#${tag}`).join(" ")),
							react.createElement("div", { style: { marginTop: 4, display: "flex", gap: 6 } },
								react.createElement("button", { onClick: () => resolvePending(it.id, "approve"), style: { ...btnStyle, color: "#3a9" } }, t("panel.pendingApprove")),
								react.createElement("button", { onClick: () => resolvePending(it.id, "reject"), style: { ...btnStyle, color: "#c33" } }, t("panel.pendingReject")),
							),
						)
					),
			);

			// 健康度条：有效记忆 / 字符占用 / 近重复 / 已更正 / 待确认。
			const healthStrip = react.createElement("div", { style: { display: "flex", gap: 10, flexWrap: "wrap", fontSize: 11, opacity: .75, marginBottom: 8 } },
				react.createElement("span", null, `${t("panel.healthLive")}: ${health.live}`),
				react.createElement("span", null, `${t("panel.healthUsage")}: ${health.usage}/${health.limit || "?"}`),
				react.createElement("span", { style: health.dupPairs > 0 ? { color: "#c93" } : undefined }, `${t("panel.healthDup")}: ${health.dupPairs}`),
				react.createElement("span", { style: health.superseded > 0 ? { color: "#b8860b" } : undefined }, `${t("panel.healthSuperseded")}: ${health.superseded}`),
				health.pending > 0 && react.createElement("span", { style: { color: "#da4" } }, `${t("panel.healthPending")}: ${health.pending}`),
				react.createElement("span", { style: vectorRecall ? { color: "#6c9" } : { opacity: .5 } }, `${t("panel.healthVec")}: ${vectorRecall ? "on" : "off"}`),
			);

			const body = showSettings
				? react.createElement(SettingsCard, null)
				: react.createElement("div", null,
					editor,
					importRow,
					pendingView,
					healthStrip,
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
			const [saveErr, setSaveErr] = react.useState(null);
			const [tip, setTip] = react.useState(null); // { text, x, y } | null
			react.useEffect(() => {
				apiGet("/api/memory/settings").then(setCfg).catch((e) => setCfg({ error: String(e) }));
			}, []);
			if (!cfg) return react.createElement("div", null, t("panel.loading"));
			if (cfg.error) return react.createElement("div", null, String(cfg.error));
			const set = (patch) => setCfg({ ...cfg, ...patch });
			const save = async () => {
				try {
					await apiPost("/api/memory/settings", cfg);
					setSaveErr(null);
					setNotice(true);
					setTimeout(() => setNotice(false), 1500);
				} catch (e) {
					setSaveErr(String(e?.message || e));
					setTimeout(() => setSaveErr(null), 4000);
				}
			};
			// Compact inline row: label (hover → tooltip) on the left, control on the right.
			const row = (label, desc, control) => react.createElement("div", {
					style: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "3px 0", borderBottom: "1px solid rgba(128,128,128,.12)" },
				},
				react.createElement("span", {
					style: { fontSize: 13, cursor: desc ? "help" : "default", borderBottom: desc ? "1px dotted rgba(128,128,128,.6)" : "none" },
					onMouseEnter: (e) => desc && setTip({ text: desc, x: e.clientX, y: e.clientY }),
					onMouseMove: (e) => desc && setTip((p) => (p ? { ...p, x: e.clientX, y: e.clientY } : p)),
					onMouseLeave: () => setTip(null),
				}, label),
				react.createElement("span", null, control),
			);
			const tooltip = tip && react.createElement("div", {
				style: {
					position: "fixed", left: Math.min(tip.x + 14, (typeof window !== "undefined" ? window.innerWidth : 1280) - 320),
					top: Math.min(tip.y + 14, (typeof window !== "undefined" ? window.innerHeight : 800) - 120),
					maxWidth: 300, padding: "8px 10px", borderRadius: 6, fontSize: 12, lineHeight: 1.5,
					background: "rgba(20,22,28,.96)", color: "#e8e8ea", border: "1px solid rgba(128,128,128,.35)",
					boxShadow: "0 6px 20px rgba(0,0,0,.4)", zIndex: 9999, pointerEvents: "none", whiteSpace: "pre-wrap",
				},
			}, (() => {
				const sep = tip.text.indexOf("｜") >= 0 ? "｜" : tip.text.indexOf(" | ") >= 0 ? " | " : null;
				if (!sep) return tip.text;
				const parts = tip.text.split(sep);
				return react.createElement(react.Fragment, null,
					react.createElement("div", { style: { marginBottom: 4 } }, parts[0].trim()),
					react.createElement("div", { style: { opacity: .8, borderTop: "1px solid rgba(128,128,128,.3)", paddingTop: 4 } }, parts[1].trim()),
				);
			})());
			return react.createElement("div", { style: { padding: 12 } },
				react.createElement("div", { style: { fontWeight: 700, marginBottom: 8 } }, t("settings.title")),
				notice && react.createElement("div", { style: { color: "#3a9", marginBottom: 6 } }, t("settings.saved")),
				saveErr && react.createElement("div", { style: { color: "#e66", marginBottom: 6, fontSize: 12 } }, "保存失败：" + saveErr),
				row(t("settings.autoSummarize"), t("settings.autoSummarizeDesc"),
					react.createElement("input", { type: "checkbox", checked: !!cfg.autoSummarize, onChange: (e) => set({ autoSummarize: e.target.checked }) })),
				row(t("settings.compressWithLLM"), t("settings.compressWithLLMDesc"),
					react.createElement("input", { type: "checkbox", checked: !!cfg.compressWithLLM, onChange: (e) => set({ compressWithLLM: e.target.checked }) })),
				row(t("settings.injectContext"), t("settings.injectContextDesc"),
					react.createElement("select", { value: cfg.injectContext || "recent", onChange: (e) => set({ injectContext: e.target.value }) },
						react.createElement("option", { value: "recent" }, "recent"),
						react.createElement("option", { value: "full" }, "full"),
						react.createElement("option", { value: "off" }, "off"),
					)),
				row(t("settings.requireApproval"), t("settings.requireApprovalDesc"),
					react.createElement("input", { type: "checkbox", checked: !!cfg.requireApprovalForWrite, onChange: (e) => set({ requireApprovalForWrite: e.target.checked }) })),
				row(t("settings.semanticRecall"), t("settings.semanticRecallDesc"),
					react.createElement("input", { type: "checkbox", checked: !!cfg.semanticRecall, onChange: (e) => set({ semanticRecall: e.target.checked }) })),
				row(t("settings.semanticRerank"), t("settings.semanticRerankDesc"),
					react.createElement("input", { type: "checkbox", checked: !!cfg.semanticRerank, onChange: (e) => set({ semanticRerank: e.target.checked }) })),
				row(t("settings.semanticVectorRecall"), t("settings.semanticVectorRecallDesc"),
					react.createElement("input", { type: "checkbox", checked: !!cfg.semanticVectorRecall, onChange: (e) => set({ semanticVectorRecall: e.target.checked }) })),
				row(t("settings.semanticDedupThreshold"), t("settings.semanticDedupThresholdDesc"),
					react.createElement("input", { type: "number", min: 0, max: 1, step: 0.05, value: cfg.semanticDedupThreshold ?? 0, onChange: (e) => set({ semanticDedupThreshold: Math.min(1, Math.max(0, Number(e.target.value))) }) })),
				row(t("settings.autoConsolidate"), t("settings.autoConsolidateDesc"),
					react.createElement("input", { type: "checkbox", checked: !!cfg.autoConsolidate, onChange: (e) => set({ autoConsolidate: e.target.checked }) })),
				row(t("settings.consolidateIntervalMs"), t("settings.consolidateIntervalMsDesc"),
					react.createElement("input", { type: "number", min: 0, step: 3600000, value: cfg.consolidateIntervalMs || 0, onChange: (e) => set({ consolidateIntervalMs: Number(e.target.value) }) })),
				row(t("settings.consolidateMaxEntries"), t("settings.consolidateMaxEntriesDesc"),
					react.createElement("input", { type: "number", min: 1, value: cfg.consolidateMaxEntries || 0, onChange: (e) => set({ consolidateMaxEntries: Number(e.target.value) }) })),
				row(t("settings.autoApproveAfterMs"), t("settings.autoApproveAfterMsDesc"),
					react.createElement("input", { type: "number", min: 0, step: 86400000, value: cfg.autoApproveAfterMs || 0, onChange: (e) => set({ autoApproveAfterMs: Number(e.target.value) }) })),
				row(t("settings.charLimit"), t("settings.charLimitDesc"),
					react.createElement("input", { type: "number", value: cfg.charLimit || 0, onChange: (e) => set({ charLimit: Number(e.target.value) }) })),
				react.createElement("button", { onClick: save, style: { ...btnStyle, marginTop: 10, background: "rgba(60,140,255,.2)", borderColor: "rgba(60,140,255,.4)" } }, t("panel.save")),
				tooltip,
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

		exports.apply = apply;
		exports.inject = inject;
		exports.renderContent = renderContent;
		return module.exports;
	}
});

//# sourceMappingURL=client.js.map
