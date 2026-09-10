/**
 * dsh-minimal-ui-panels — composite tab bodies (browser half).
 *
 * The merged bundle registers ONE tab type per *pairing* of panels instead of
 * one per panel. A pairing stacks its two panels vertically with a draggable
 * divider between them, so two Sidebar panes side by side show all four panels
 * at once — which is the whole point of pairing: four separate types could only
 * ever show two on screen, and switching between them was the cost.
 *
 * This fragment owns every right-Sidebar registration for the bundle; the three
 * panel sources (`src/artifacts`, `src/long-term-memory`, `src/terminal-notes`)
 * contribute nothing but their component, their locale namespace and a bound
 * translator, through the `panels` registry that `scripts/merge-client.mjs`
 * passes into every merged factory as its third argument:
 *
 *   panels.artifacts      = { Component, ns, titleKey, t }   (src/artifacts)
 *   panels.longTermMemory = { Component, ns, titleKey, t }   (src/long-term-memory)
 *   panels.terminal       = { Component, ns, titleKey, t }   (src/terminal-notes)
 *   panels.notes          = { Component, ns, titleKey, t }   (src/terminal-notes)
 *
 * The panels render with `embedded: true`: this file draws the title row for
 * each half, so a panel must not add chrome of its own. No `closeDetails` is
 * passed either — the tab strip owns the close control, and handing the panels
 * a close action would draw a second ✕ per half.
 */
window.__ModuleLoader__.load({
	id: "dsh-minimal-ui-panels-composite",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react = require("react");
		let react_jsx_runtime = require("react/jsx-runtime");
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
		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});
