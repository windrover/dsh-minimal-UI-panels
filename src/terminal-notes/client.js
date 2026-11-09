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
			"terminal.cancel": "终止",
			"terminal.cancelled": "已手动终止",
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
			"notes.captureSelection": "收录选区",
			"capture.add": "添加到记事本",
			"capture.addSelection": "添加到记事本（选中内容）",
			"capture.addWhole": "添加到记事本（整条消息）",
			"capture.addWholeShort": "添加到记事本",
			"capture.confirmTitle": "添加到记事本？",
			"capture.confirmWhole": "整条消息",
			"capture.confirmSelection": "选中内容",
			"capture.confirmChars": "{count} 字符",
			"capture.confirmPreview": "预览（保存的是完整内容）",
			"capture.confirmSave": "保存到记事本",
			"capture.cancel": "取消",
			"capture.copy": "复制",
			"capture.added": "已添加到记事本",
			"capture.failed": "添加失败",
			"capture.empty": "没有可添加的内容",
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
			"terminal.cancel": "Stop",
			"terminal.cancelled": "Stopped by you",
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
			"notes.captureSelection": "Add selection",
			"capture.add": "Add to Notes",
			"capture.addSelection": "Add to Notes (selection)",
			"capture.addWhole": "Add to Notes (whole message)",
			"capture.addWholeShort": "Add to Notes",
			"capture.confirmTitle": "Add to Notes?",
			"capture.confirmWhole": "Whole message",
			"capture.confirmSelection": "Selection",
			"capture.confirmChars": "{count} characters",
			"capture.confirmPreview": "Preview (the full text is saved)",
			"capture.confirmSave": "Save to Notes",
			"capture.cancel": "Cancel",
			"capture.copy": "Copy",
			"capture.added": "Added to Notes",
			"capture.failed": "Could not add to Notes",
			"capture.empty": "Nothing to add",
			"terminal.title": "Terminal",
			"tab.terminalDescription": "Run shell commands in the session workspace",
			"terminal.hintsTitle": "Common commands:",
			"notes.title": "Notes",
			"tab.notesDescription": "Scratch notes, saved automatically",
		};
		const dict = (locale) => (locale === "en" ? en : zh);
		let activeLocale = undefined;
		/**
		 * Namespace-bound translator, bound in apply(). Resolving the language at
		 * CALL time is what makes it correct: a one-shot probe taken during
		 * apply() reads the locale service's default, because the user's
		 * preference has not been applied yet — so a deployment preferring zh was
		 * pinned to English for the life of the process, while the panels that
		 * call `ctx.locale.bind()` during render (artifacts, memory) came out
		 * right. `activeLocale` stays as the fallback for a context with no
		 * locale service at all.
		 */
		let boundT = null;
		const t = (key) => (boundT ? boundT(key) : (dict(activeLocale)[key] ?? key));

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

		// ---- conversation → notes capture (right-click a message) ------------
		/**
		 * Every message row in the conversation is wrapped in an element carrying
		 * `data-chat-node-key` (the core chat UI's own attribute), so capture does
		 * not need a private slot or a fragile CSS-module class name. Only the
		 * three node kinds that hold conversation text are eligible: the user
		 * bubble, a steering message, and one assistant step. Footers, tool cards
		 * and turn notices are deliberately excluded.
		 */
		const CAPTURE_NODE_KEYS = new Set(["user", "steering", "assistant-step"]);
		/** Whole-message captures always confirm; long selections confirm too. */
		const CAPTURE_CONFIRM_CHARS = 2000;
		/** How much of the excerpt the confirmation shows (the full text is saved). */
		const CAPTURE_PREVIEW_CHARS = 1200;
		/** Fired after a note is appended so every open Notes panel refreshes. */
		const NOTES_CHANGED_EVENT = "dsh-minimal-ui-panels:notes-changed";
		let captureMenu = null;
		let captureDialog = null;
		/** The message text an official text-interaction is about to offer. */
		let pendingWholeMessage = "";
		/** The element under the last right-button press (keyboard menus have none). */
		let lastRightClickTarget = null;
		/** Set once the host's uiConversation service owns the text interaction. */
		let officialCapture = false;

		/**
		 * One scoped stylesheet, using the host's own design tokens where they
		 * exist. Inline styles did not survive the host's floating-surface layout
		 * (the action wrapped one character per line and the dialog rendered at
		 * page scale), so the visual language is expressed here instead.
		 */
		const CAPTURE_CSS = `
.dsh-notes-capture-action{corner-shape:round;background:var(--dsw-alias-button-floating-fill,rgba(255,255,255,.96));--dsw-elevation-stroke-color:var(--dsw-alias-border-l3,rgba(0,0,0,.12));box-shadow:var(--dsw-elevation-panel,0 4px 16px rgba(0,0,0,.12));color:var(--dsw-alias-label-primary,#18181b);font:var(--dsw-font-xs-13,13px/1.4 -apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC",sans-serif);cursor:pointer;border:none;border-radius:999px;padding:5px 10px;white-space:nowrap}
.dsh-notes-capture-overlay{position:fixed;inset:0;z-index:2147483000;display:flex;align-items:center;justify-content:center;padding:16px;background:rgba(15,23,42,.35)}
.dsh-notes-capture-card{width:400px;max-width:calc(100vw - 32px);max-height:min(70vh,560px);display:flex;flex-direction:column;gap:8px;padding:14px;border-radius:12px;background:var(--dsw-alias-bg-popup,#fff);color:var(--dsw-alias-label-primary,#18181b);border:1px solid var(--dsw-alias-border-l2,rgba(0,0,0,.08));box-shadow:var(--dsw-elevation-panel,0 12px 32px rgba(0,0,0,.18));font:13px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC",sans-serif;box-sizing:border-box}
.dsh-notes-capture-card *{box-sizing:border-box}
.dsh-notes-capture-title{font-size:14px;font-weight:600;line-height:1.4}
.dsh-notes-capture-meta{font-size:12px;line-height:1.4;opacity:.62}
.dsh-notes-capture-preview{max-height:200px;overflow:auto;white-space:pre-wrap;word-break:break-word;padding:8px 10px;border-radius:8px;background:var(--dsw-alias-bg-l2,#f6f7f9);border:1px solid var(--dsw-alias-border-l2,rgba(0,0,0,.06));font-size:12px;line-height:1.45}
.dsh-notes-capture-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:2px}
.dsh-notes-capture-btn{font:inherit;font-size:13px;line-height:1.4;padding:5px 12px;border-radius:8px;cursor:pointer;border:1px solid transparent}
.dsh-notes-capture-btn--cancel{background:transparent;border-color:var(--dsw-alias-border-l2,rgba(0,0,0,.15));color:inherit}
.dsh-notes-capture-btn--save{background:var(--dsw-alias-button-primary-fill,#2563eb);color:var(--dsw-alias-label-on-primary,#fff);border-color:transparent}
`.trim();

		/** Install the scoped sheet once; a duplicate call is a no-op. */
		function ensureCaptureStyles() {
			if (typeof document === "undefined") return;
			if (document.querySelector("style[data-notes-capture]") !== null) return;
			const tag = document.createElement("style");
			tag.dataset.notesCapture = "";
			tag.textContent = CAPTURE_CSS;
			document.head.appendChild(tag);
		}

		/** Plain-text copy of one chat node, skipping buttons/icons and keeping block breaks. */
		function readableTextOf(node) {
			let out = "";
			const walk = (parent) => {
				for (const child of parent.childNodes) {
					if (child.nodeType === 3) { out += child.nodeValue; continue; }
					if (child.nodeType !== 1) continue;
					if (child.matches("button, [role='button'], svg, [aria-hidden='true']")) continue;
					if (child.tagName === "BR") { out += "\n"; continue; }
					const block = /^(DIV|P|LI|UL|OL|H[1-6]|PRE|BLOCKQUOTE|TABLE|TR|SECTION)$/.test(child.tagName);
					if (block && out !== "" && !out.endsWith("\n")) out += "\n";
					walk(child);
					if (block && !out.endsWith("\n")) out += "\n";
				}
			};
			walk(node);
			return out.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
		}

		/** The selected text when the selection sits inside `node`, else "". */
		function selectedTextWithin(node) {
			try {
				const selection = window.getSelection();
				if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return "";
				if (!node.contains(selection.anchorNode) || !node.contains(selection.focusNode)) return "";
				return selection.toString().trim();
			} catch {
				return "";
			}
		}

		function closeCaptureMenu() {
			if (captureMenu === null) return;
			if (typeof captureMenu._cleanup === "function") captureMenu._cleanup();
			captureMenu.remove();
			captureMenu = null;
		}

		function showCaptureToast(message) {
			const toast = document.createElement("div");
			toast.textContent = message;
			toast.setAttribute("role", "status");
			toast.style.cssText = [
				"position:fixed", "left:50%", "bottom:32px", "transform:translateX(-50%)",
				"padding:8px 14px", "borderRadius:8px", "zIndex:2147483000",
				"background:rgba(24,24,27,.92)", "color:#fff", "fontSize:12.5px",
				"fontFamily:inherit", "pointerEvents:none", "opacity:1",
				"transition:opacity .3s ease", "boxShadow:0 6px 24px rgba(0,0,0,.25)",
			].join(";");
			document.body.appendChild(toast);
			setTimeout(() => { toast.style.opacity = "0"; }, 1400);
			setTimeout(() => toast.remove(), 1800);
		}

		/** POST the excerpt; falls back to create+save on a host without the route. */
		async function appendConversationNote(text) {
			const clean = String(text ?? "").trim();
			if (clean === "") { showCaptureToast(t("capture.empty")); return; }
			try {
				const res = await fetch("/api/terminal-notes/note-append", {
					method: "POST",
					headers: { "content-type": "application/json" },
					body: JSON.stringify({ text: clean }),
				});
				let data;
				if (res.status === 404) {
					// An older host process predates the atomic route (the 404 body is
					// HTML, not JSON): two calls still capture the text, just without
					// create+fill atomicity.
					const created = await fetch("/api/terminal-notes/notes", { method: "POST" }).then((r) => r.json());
					if (!created.ok) throw new Error(created.error || "create failed");
					data = await fetch("/api/terminal-notes/note", {
						method: "POST",
						headers: { "content-type": "application/json" },
						body: JSON.stringify({ id: created.id, text: clean }),
					}).then((r) => r.json());
				} else {
					data = await res.json();
				}
				if (!data.ok) throw new Error(data.error || "append failed");
				window.dispatchEvent(new CustomEvent(NOTES_CHANGED_EVENT));
				showCaptureToast(t("capture.added"));
			} catch {
				showCaptureToast(t("capture.failed"));
			}
		}

		/** The whole message text under a right-click target, in preference order. */
		function wholeMessageTextAt(target) {
			if (!(target instanceof Element)) return "";
			// 0.2.2+ marks the exact rendered text surface; it is the cleanest source.
			const surface = target.closest("[data-text-interaction-source]");
			if (surface !== null) {
				const text = readableTextOf(surface);
				if (text !== "") return text;
			}
			const node = target.closest("[data-chat-node-key]");
			if (node !== null && CAPTURE_NODE_KEYS.has(node.getAttribute("data-chat-node-key"))) return readableTextOf(node);
			const row = closestRow(target);
			return row === null ? "" : readableTextOf(row);
		}

		/** Remember which element a right-button press landed on. */
		function installRightClickTracker() {
			if (typeof window === "undefined" || typeof window.addEventListener !== "function") return () => {};
			const onPointerDown = (event) => {
				if (event.button === 2) lastRightClickTarget = event.target;
			};
			window.addEventListener("pointerdown", onPointerDown, true);
			return () => window.removeEventListener("pointerdown", onPointerDown, true);
		}

		/** Take the pending whole-message text without leaking it to the next pill. */
		function takePendingWholeMessage() {
			const text = pendingWholeMessage;
			pendingWholeMessage = "";
			return text;
		}

		/**
		 * DSH 0.2.2+ text-interaction handler.
		 *
		 * Quote owns selections (it registers first), so this handler only claims a
		 * right-click with **no selection** and offers the whole message. Using the
		 * host's own gesture is what makes the action appear in the same floating
		 * pill as "引用文本" instead of fighting it with a second context menu.
		 */
		function handleTextInteraction(request) {
			if (request.trigger !== "contextmenu" || request.hasSelection) return;
			const text = wholeMessageTextAt(lastRightClickTarget);
			if (text === "") return;
			pendingWholeMessage = text;
			request.preventDefault();
			request.open();
		}

		/** The action rendered inside the host's floating text-interaction pill. */
		function NotesCaptureAction({ dismiss, t }) {
			return React.createElement("button", {
				type: "button",
				className: "dsh-notes-capture-action",
				onPointerDown: (event) => event.preventDefault(),
				onClick: () => {
					const text = takePendingWholeMessage();
					dismiss();
					if (text !== "") requestCapture(text, "whole");
				},
			}, t("capture.addWholeShort"));
		}

		/**
		 * Register with the host's text-interaction service when it exists.
		 * Older hosts (no uiConversation) keep the custom context menu instead.
		 * @returns whether the official integration is active.
		 */
		function registerOfficialCapture(conversation, hostCtx) {
			if (officialCapture) return true;
			if (conversation === undefined || conversation === null) return false;
			if (typeof conversation.interactions?.register !== "function") return false;
			officialCapture = true;
			hostCtx.effect(() => conversation.interactions.register({
				id: "notes-capture",
				onInteraction: handleTextInteraction,
			}), "terminal-notes: text interaction");
			if (hostCtx.slots?.inject !== undefined && hostCtx.slots?.register !== undefined) {
				hostCtx.effect(() => hostCtx.slots.inject("conversation.chat.text-interaction", () => hostCtx.slots.register({
					name: "conversation.chat.text-interaction",
					key: "notes-capture",
					locale: NS,
				}, NotesCaptureAction)), "terminal-notes: text-interaction action");
			}
			return true;
		}

		/** Decide whether this capture needs a confirmation preview first. */
		function requestCapture(text, source) {
			const clean = String(text ?? "").trim();
			if (clean === "") { showCaptureToast(t("capture.empty")); return; }
			if (source === "whole" || clean.length > CAPTURE_CONFIRM_CHARS) {
				openCaptureConfirm(clean, source);
				return;
			}
			void appendConversationNote(clean);
		}

		function closeCaptureConfirm() {
			if (captureDialog === null) return;
			if (typeof captureDialog._cleanup === "function") captureDialog._cleanup();
			captureDialog.remove();
			captureDialog = null;
		}

		/**
		 * Confirm a whole-message (or very long) capture before writing it.
		 * A reply can be thousands of characters; showing the size and a preview
		 * is what makes "save the whole message" an informed action.
		 */
		function openCaptureConfirm(text, source) {
			closeCaptureConfirm();
			const overlay = document.createElement("div");
			overlay.setAttribute("role", "dialog");
			overlay.setAttribute("aria-modal", "true");
			overlay.className = "dsh-notes-capture-overlay";
			const card = document.createElement("div");
			card.className = "dsh-notes-capture-card";
			const title = document.createElement("div");
			title.className = "dsh-notes-capture-title";
			title.textContent = t("capture.confirmTitle");
			const meta = document.createElement("div");
			meta.className = "dsh-notes-capture-meta";
			meta.textContent = `${source === "whole" ? t("capture.confirmWhole") : t("capture.confirmSelection")} · ${t("capture.confirmChars", { count: text.length })}`;
			const previewLabel = document.createElement("div");
			previewLabel.className = "dsh-notes-capture-meta";
			previewLabel.textContent = t("capture.confirmPreview");
			const preview = document.createElement("div");
			preview.className = "dsh-notes-capture-preview";
			preview.textContent = text.length > CAPTURE_PREVIEW_CHARS
				? `${text.slice(0, CAPTURE_PREVIEW_CHARS)}\n… (${t("capture.confirmChars", { count: text.length })})`
				: text;
			const actions = document.createElement("div");
			actions.className = "dsh-notes-capture-actions";
			const cancel = document.createElement("button");
			cancel.type = "button";
			cancel.className = "dsh-notes-capture-btn dsh-notes-capture-btn--cancel";
			cancel.textContent = t("capture.cancel");
			const save = document.createElement("button");
			save.type = "button";
			save.className = "dsh-notes-capture-btn dsh-notes-capture-btn--save";
			save.textContent = t("capture.confirmSave");
			cancel.addEventListener("click", () => closeCaptureConfirm());
			save.addEventListener("click", () => { closeCaptureConfirm(); void appendConversationNote(text); });
			overlay.addEventListener("click", (event) => { if (event.target === overlay) closeCaptureConfirm(); });
			const onKeyDown = (event) => { if (event.key === "Escape") closeCaptureConfirm(); };
			document.addEventListener("keydown", onKeyDown, true);
			overlay._cleanup = () => document.removeEventListener("keydown", onKeyDown, true);
			actions.append(cancel, save);
			card.append(title, meta, previewLabel, preview, actions);
			overlay.appendChild(card);
			document.body.appendChild(overlay);
			captureDialog = overlay;
			save.focus();
		}

		/** Menu at the cursor: add the excerpt, plus copy as a courtesy. */
		function openCaptureMenu(x, y, node, forcedText) {
			closeCaptureMenu();
			const selected = forcedText !== undefined ? forcedText : (node === null ? "" : selectedTextWithin(node));
			const source = selected !== "" ? "selection" : "whole";
			const payload = selected !== "" ? selected : (node === null ? "" : readableTextOf(node));
			if (payload === "") return;
			console.info("[notes-capture] menu", payload.length);
			const menu = document.createElement("div");
			menu.setAttribute("role", "menu");
			menu.style.cssText = [
				"position:fixed", "zIndex:2147483000", "minWidth:168px",
				"padding:4px", "borderRadius:8px", "border:1px solid rgba(0,0,0,.12)",
				"background:#fff", "color:#18181b", "fontSize:13px", "fontFamily:inherit",
				"boxShadow:0 8px 28px rgba(0,0,0,.18)",
			].join(";");
			const item = (label, onClick) => {
				const button = document.createElement("button");
				button.type = "button";
				button.setAttribute("role", "menuitem");
				button.textContent = label;
				button.style.cssText = [
					"display:block", "width:100%", "textAlign:left", "padding:6px 10px",
					"border:0", "borderRadius:6px", "background:transparent", "color:inherit",
					"font:inherit", "cursor:pointer",
				].join(";");
				button.addEventListener("mouseenter", () => { button.style.background = "rgba(0,0,0,.06)"; });
				button.addEventListener("mouseleave", () => { button.style.background = "transparent"; });
				button.addEventListener("click", (event) => {
					event.preventDefault();
					event.stopPropagation();
					closeCaptureMenu();
					onClick();
				});
				menu.appendChild(button);
			};
			item(t(source === "selection" ? "capture.addSelection" : "capture.addWhole"), () => {
				requestCapture(payload, source);
			});
			item(t("capture.copy"), () => {
				try { void navigator.clipboard?.writeText(payload); } catch { /* clipboard unavailable */ }
			});
			document.body.appendChild(menu);
			const rect = menu.getBoundingClientRect();
			menu.style.left = `${Math.max(8, Math.min(x, window.innerWidth - rect.width - 8))}px`;
			menu.style.top = `${Math.max(8, Math.min(y, window.innerHeight - rect.height - 8))}px`;
			const onPointerDown = (event) => { if (!menu.contains(event.target)) closeCaptureMenu(); };
			const onKeyDown = (event) => { if (event.key === "Escape") closeCaptureMenu(); };
			const onDismiss = () => closeCaptureMenu();
			setTimeout(() => {
				document.addEventListener("pointerdown", onPointerDown, true);
				document.addEventListener("keydown", onKeyDown, true);
				window.addEventListener("scroll", onDismiss, true);
				window.addEventListener("resize", onDismiss);
			}, 0);
			menu._cleanup = () => {
				document.removeEventListener("pointerdown", onPointerDown, true);
				document.removeEventListener("keydown", onKeyDown, true);
				window.removeEventListener("scroll", onDismiss, true);
				window.removeEventListener("resize", onDismiss);
			};
			captureMenu = menu;
		}

		/** The chat container's own attributes, used when a node key is unavailable. */
		const CHAT_AREA_SELECTOR = "[data-chat-flow], [data-chat-turn], [data-chat-node-key]";
		/** CSS-module classes keep their local name, so these survive hashing. */
		const ROW_FALLBACK_SELECTORS = ['[class*="flowItem"]', '[class*="bubble"]', '[class*="userStack"]'];

		/** The nearest message-shaped row when no node key is available. */
		function closestRow(target) {
			for (const selector of ROW_FALLBACK_SELECTORS) {
				const row = target.closest(selector);
				if (row !== null) return row;
			}
			return null;
		}

		/**
		 * Install the contextmenu handler on `window` in the capture phase, so a
		 * later handler on an inner container cannot stop it first. Disposal
		 * removes the listener and any open menu.
		 */
		function installConversationCapture() {
			// The contract test loads this bundle in a bare VM with no DOM; the
			// capture menu is browser-only and must not block registration there.
			if (typeof document === "undefined") return () => {};
			const onContextMenu = (event) => {
				const target = event.target;
				if (!(target instanceof Element)) return;
				// Inputs keep their native menu (paste, spell-check, emoji).
				if (target.closest("input, textarea, [contenteditable='true'], [role='textbox']") !== null) return;
				const node = target.closest("[data-chat-node-key]");
				const inChat = node !== null || target.closest(CHAT_AREA_SELECTOR) !== null;
				const selection = window.getSelection === undefined ? null : window.getSelection();
				const selected = selection !== null && !selection.isCollapsed ? selection.toString().trim() : "";
				if (node !== null && CAPTURE_NODE_KEYS.has(node.getAttribute("data-chat-node-key"))) {
					if (readableTextOf(node) === "") return;
					event.preventDefault();
					openCaptureMenu(event.clientX, event.clientY, node);
					return;
				}
				// Some surfaces render a row without a node key. A CSS-module class
				// keeps its local name in the scoped output, so "flowItem" still
				// identifies the row; readableTextOf strips the action chrome.
				const row = node === null ? closestRow(target) : null;
				if (row !== null) {
					const text = readableTextOf(row);
					if (text !== "") {
						event.preventDefault();
						openCaptureMenu(event.clientX, event.clientY, row);
						return;
					}
				}
				// Fallback for a chat surface whose node attribute is missing or
				// renamed: with a selection inside the conversation, capture it.
				if (inChat && selected !== "") {
					event.preventDefault();
					openCaptureMenu(event.clientX, event.clientY, null, selected);
					return;
				}
				if (inChat) console.info("[notes-capture] no message row under", target.className);
			};
			window.addEventListener("contextmenu", onContextMenu, true);
			console.info("[notes-capture] installed");
			return () => {
				window.removeEventListener("contextmenu", onContextMenu, true);
				closeCaptureMenu();
			};
		}

		// ---- terminal panel ---------------------------------------------------
		// Styled as a small dark terminal: dark background, monospace text.
		function TerminalPanel() {
			const [cmd, setCmd] = React.useState("");
			const [output, setOutput] = React.useState("");
			const [running, setRunning] = React.useState(false);
			const [error, setError] = React.useState("");
			// The id of the command in flight. A request/response pair cannot
			// cancel itself — the handle to kill only exists inside the host's
			// handler for that one request — so the run is named here and a second
			// request addresses it by name.
			const runIdRef = React.useRef(null);
			const run = async () => {
				const line = cmd.trim();
				if (!line || running) return;
				const runId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
				runIdRef.current = runId;
				setRunning(true);
				setError("");
				setOutput("");
				try {
					const res = await fetch("/api/terminal-notes/exec", {
						method: "POST",
						headers: { "content-type": "application/json" },
						body: JSON.stringify({ command: line, runId }),
					});
					const data = await res.json();
					if (!data.ok) {
						// A stopped or timed-out command may still have printed
						// something useful; keep it under the error instead of
						// throwing it away. `error` is a code, not prose, so the
						// message can be localized here.
						setOutput(data.output || "");
						if (data.error === "timeout") {
							setError(t("terminal.timeout") + ` (${Math.round((data.timeoutMs ?? 0) / 1000)}s)`);
						} else if (data.error === "cancelled") {
							setError(t("terminal.cancelled"));
						} else {
							setError(data.error || "unknown error");
						}
					} else {
						const suffix = data.code == null ? "" : `\n[${t("terminal.exit")} ${data.code}]`;
						setOutput((data.output || "") + suffix);
					}
				} catch (err) {
					setError(String(err?.message ?? err));
				} finally {
					runIdRef.current = null;
					setRunning(false);
				}
			};
			/**
			 * Stop the command in flight. The exec request stays open and answers
			 * with the `cancelled` result, so `run()` still owns the state
			 * updates — this only asks the host to terminate the child.
			 */
			const cancel = async () => {
				const runId = runIdRef.current;
				if (runId === null || !running) return;
				try {
					await fetch("/api/terminal-notes/exec-cancel", {
						method: "POST",
						headers: { "content-type": "application/json" },
						body: JSON.stringify({ runId }),
					});
				} catch { /* the run will report its own outcome */ }
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
					// Only while something is running: the way out of a long
					// command without waiting for the deadline.
					running && React.createElement("button", {
						style: { ...termInput, cursor: "pointer", flex: "0 0 auto", borderColor: "#7a3b3b", color: "#ffb3b3" },
						onClick: cancel,
					}, t("terminal.cancel")),
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
			// List visibility is user-controlled: shown by default, toggled only by
			// the toolbar button. Selecting a note must NOT collapse it — clicking
			// through several notes is the common case.
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
			const select = async (id) => {
				setActiveId(id);
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
			// A message captured from the conversation becomes a new note elsewhere
			// in the app; only the list needs refreshing, never the open note.
			React.useEffect(() => {
				const onNotesChanged = async () => {
					try {
						const res = await fetch("/api/terminal-notes/notes");
						const data = await res.json();
						if (data.ok) setNotes(data.notes || []);
					} catch { /* ignore */ }
				};
				window.addEventListener(NOTES_CHANGED_EVENT, onNotesChanged);
				return () => window.removeEventListener(NOTES_CHANGED_EVENT, onNotesChanged);
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
			/** A visible entry point that does not depend on the chat DOM. */
			const captureSelection = () => {
				const selection = window.getSelection === undefined ? null : window.getSelection();
				const text = selection === null ? "" : selection.toString().trim();
				if (text === "") {
					setStatus(t("capture.empty"));
					setTimeout(() => setStatus(""), 1500);
					return;
				}
				void appendConversationNote(text);
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
				React.createElement("button", { style: { ...buttonStyle, alignSelf: "auto", padding: "3px 10px" }, onClick: captureSelection }, t("notes.captureSelection")),
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
			ctx.effect(() => ensureCaptureStyles(), "terminal-notes: capture styles");
			ctx.effect(() => installRightClickTracker(), "terminal-notes: right-click tracker");
			const conversation = typeof ctx.get === "function" ? ctx.get("uiConversation") : undefined;
			if (registerOfficialCapture(conversation, ctx)) {
				// The host's pill owns the gesture; no second context menu.
			} else {
				ctx.effect(() => installConversationCapture(), "terminal-notes: conversation capture");
				// The service may mount after this fragment; switch over when it does.
				if (typeof ctx.inject === "function") {
					try {
						ctx.inject(["uiConversation"], (sub) => {
							registerOfficialCapture(sub.uiConversation ?? sub.get?.("uiConversation"), sub);
						});
					} catch { /* older host without scoped injection */ }
				}
			}
			// The panels take no props, so they share this module-scoped t. Binding
			// it is what makes the language correct; the probe below is kept only
			// for a context with no locale service, and it runs too early to be
			// trusted on its own (see the note on `boundT`).
			try {
				const locale = ctx.get("locale");
				if (locale && typeof locale.bind === "function") {
					const bound = locale.bind(NS);
					boundT = bound;
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
