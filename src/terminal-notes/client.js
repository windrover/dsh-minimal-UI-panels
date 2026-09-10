/**
 * dsh-terminal-notes — Browser half.
 *
 * Registers two panels into the dsh-details-tabs container's keyed child slot
 * (`details.tabs.item`): a bash terminal and a multi-note scratchpad. When the
 * container plugin is absent the panels fall back to owning the plain
 * `details` slot directly, mirroring dsh-artifacts-panel's adaptive mounting.
 *
 * Host communication goes through the harness web server routes (see the
 * host half header for the full route table).
 *
 * Panel chrome: the container renders each panel with `embedded: true`; both
 * panels then hide their own title bar (the container chip is the title).
 */
window.__ModuleLoader__.load({
	id: "dsh-terminal-notes",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let React = require("react");

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
			const [cmd, setCmd] = React.useState("");
			const [output, setOutput] = React.useState("");
			const [running, setRunning] = React.useState(false);
			const [error, setError] = React.useState("");
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
			return React.createElement("div", { style: termWrap },
				React.createElement("div", { style: { display: "flex", gap: 6 } },
					React.createElement("input", {
						style: { ...termInput, flex: 1 },
						placeholder: t("terminal.placeholder"),
						value: cmd,
						onChange: (e) => setCmd(e.target.value),
						onKeyDown: (e) => { if (e.key === "Enter") run(); },
						disabled: running,
					}),
					React.createElement("button", {
						style: { ...termInput, cursor: running ? "default" : "pointer", flex: "0 0 auto" },
						onClick: run, disabled: running,
					}, running ? t("terminal.running") : t("terminal.run")),
				),
				error && React.createElement("div", { style: { color: "#ff6b6b" } },
					t("terminal.error") + ": " + error),
				output !== "" && React.createElement("pre", { style: termOutput }, output),
				output === "" && !error && React.createElement("div", { style: hintStyle },
					React.createElement("div", { style: { fontWeight: 600, marginBottom: 4, color: "#aab4c2" } },
						t("terminal.hintsTitle")),
					hints.map((h, i) => React.createElement("div", { key: i }, h)),
				),
			);
		}

		// ---- notes panel (multi-note, Apple Notes style) ----------------------
		function NotesPanel() {
			const [notes, setNotes] = React.useState([]);       // [{id,title,updatedAt}]
			const [activeId, setActiveId] = React.useState(null);
			const [text, setText] = React.useState("");
			const [status, setStatus] = React.useState("");
			const [loading, setLoading] = React.useState(true);
			// 2.1/2.3: list visibility — default shown; after opening a note or
			// creating one it collapses so the content gets the full width.
			const [showList, setShowList] = React.useState(true);
			// 2.2: list width — narrower default (120px), user-draggable.
			const [listWidth, setListWidth] = React.useState(120);
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
			React.useEffect(() => {
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
			return React.createElement("div", { style: panelStyle },
				React.createElement("div", { style: toolbarStyle },
					React.createElement("button", { style: { ...buttonStyle, alignSelf: "auto", padding: "3px 10px" }, onClick: createNote }, t("notes.new")),
					React.createElement("button", { style: { ...buttonStyle, alignSelf: "auto", padding: "3px 10px" }, onClick: deleteNote, disabled: !activeId }, t("notes.delete")),
					// 2.3: manual list toggle.
					React.createElement("button", {
						style: { ...buttonStyle, alignSelf: "auto", padding: "3px 10px" },
						onClick: () => setShowList(!showList),
						title: showList ? t("notes.hideList") : t("notes.showList"),
					}, showList ? t("notes.hideList") : t("notes.showList")),
					status && React.createElement("span", { style: { fontSize: 11, opacity: 0.6 } }, status),
				),
				React.createElement("div", { style: rowStyle },
					showList && React.createElement("div", { style: sidebarStyle },
						notes.length === 0
							? React.createElement("div", { style: { padding: 8, fontSize: 12, opacity: 0.6 } }, t("notes.empty"))
							: notes.map((n) => React.createElement("div", {
								key: n.id,
								style: itemStyle(n.id === activeId),
								onClick: () => select(n.id),
								title: n.title,
							}, n.title || t("notes.untitled"))),
					),
					showList && React.createElement("div", { style: splitterStyle, onMouseDown: startSplitDrag }),
					React.createElement("textarea", {
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

		exports.apply = apply;
		exports.inject = inject;
		exports.TerminalPanel = TerminalPanel;
		exports.NotesPanel = NotesPanel;
		return module.exports;
	}
});
