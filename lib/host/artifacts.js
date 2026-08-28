/**
 * dsh-artifacts-panel — Host half.
 *
 * Registers two exact HTTP routes on the DSH web server:
 *
 *   POST /api/artifacts/scan   body: { "dir": "/abs/path" }
 *   GET  /api/artifacts/read   query: ?path=/abs/file (preview, size-bounded)
 *
 * `scan` recursively scans `dir` and returns one metadata row per file:
 * path, name, extension, type category, byte size, mtime (ms), and line
 * count (null for binary files and files above the size cap), plus `dirs`:
 * the absolute paths of the immediate, non-skipped subdirectories of `dir`
 * (for client-side drill-down). `read` returns the bounded text content of
 * one regular file (binary files are flagged, oversized text is truncated)
 * for the panel's preview drawer. The browser half fetches these routes and
 * does all grouping/sorting locally, so the wire stays small (metadata
 * only, never full file contents).
 *
 * Also registers the `artifacts_list` agent tool so the harness itself can
 * survey workspace artifacts (same scope rules as the routes).
 *
 * Safety: with `scope: workspace` (default) every route and the tool refuse
 * paths that are not inside a registered workspace. The workspace set is
 * read from the host workspaceRegistry at request/execution time.
 */
import { createReadStream, promises as fs } from "node:fs";
import { readFile, realpath } from "node:fs/promises";
import { basename, extname, join, sep } from "node:path";
import z from "@deepseek-ai/schemastery";
import { defineTool } from "@deepseek-ai/dsh-tools";

export const name = "dsh-artifacts-panel";

/** Services required for load ordering: the web server, the workspace registry, and the tool registry. */
export const inject = ["webServer", "workspaceRegistry", "tools"];

/** Plugin configuration (also declared in cordis.patch.yml). */
export const Config = z.object({
	scope: z.union([z.const("workspace"), z.const("any")]).default("workspace"),
	maxDepth: z.natural().default(8),
	maxFiles: z.natural().default(5000),
	maxLineFileSize: z.number().min(0).default(1048576),
	maxPreviewBytes: z.natural().default(262144),
	skipDirs: z.array(z.string()).default(["node_modules", ".git", ".svn", ".hg", "dist", "build", ".next", ".nuxt", ".turbo", ".cache", "__pycache__", ".venv", "venv", "target", "coverage", ".idea", ".vscode", ".DS_Store"])
});

/**
 * Map a file extension to a stable type category key. The browser half owns
 * the localized label for each key.
 * @param ext - lowercase extension without the leading dot.
 * @returns category key.
 */
function categorize(ext) {
	if (ext === "") return "other";
	if (["js", "ts", "jsx", "tsx", "mjs", "cjs", "py", "java", "c", "cpp", "h", "hpp", "cs", "go", "rs", "rb", "php", "swift", "kt", "scala", "sh", "bash", "zsh", "bat", "cmd", "ps1", "lua", "pl", "pm", "r"].includes(ext)) return "code";
	if (["md", "markdown", "mdx", "txt", "rst", "adoc", "pdf", "doc", "docx", "ppt", "pptx", "odt", "epub"].includes(ext)) return "docs";
	if (["json", "yaml", "yml", "toml", "ini", "conf", "cfg", "env", "properties"].includes(ext)) return "config";
	if (["csv", "tsv", "sql", "db", "sqlite", "sqlite3", "parquet", "arrow", "feather"].includes(ext)) return "data";
	if (["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp", "ico", "avif", "tiff"].includes(ext)) return "image";
	if (["mp3", "wav", "flac", "ogg", "m4a", "aac", "opus", "mp4", "webm", "mov", "mkv", "avi", "gifv"].includes(ext)) return "media";
	if (["css", "scss", "sass", "less", "html", "htm", "vue", "svelte", "jsx", "tsx"].includes(ext)) return "web";
	if (["zip", "tar", "gz", "bz2", "xz", "7z", "rar", "tgz", "zst"].includes(ext)) return "archive";
	return "other";
}

/** Extension → MIME for binary image preview (data URLs). */
const IMAGE_MIME = {
	png: "image/png",
	jpg: "image/jpeg",
	jpeg: "image/jpeg",
	gif: "image/gif",
	webp: "image/webp",
	bmp: "image/bmp",
	ico: "image/x-icon",
	avif: "image/avif",
	tiff: "image/tiff",
	tif: "image/tiff",
};

/** Preview cap for images (bytes): 4 MiB — a full photo, still bounded. */
const IMAGE_PREVIEW_MAX_BYTES = 4 * 1024 * 1024;

/** Extension → MIME for the streaming video preview route. */
const VIDEO_MIME = {
	mp4: "video/mp4",
	m4v: "video/mp4",
	webm: "video/webm",
	ogv: "video/ogg",
};

/**
 * Parse an HTTP Range header ("bytes=start-end", "bytes=start-",
 * "bytes=-suffix") against a file size. Returns { start, end } or null when
 * absent / malformed / unsatisfiable (caller then serves a 200 full body).
 */
function parseRange(header, size) {
	if (typeof header !== "string") return null;
	const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
	if (!match) return null;
	const [, startRaw, endRaw] = match;
	if (startRaw === "" && endRaw === "") return null;
	if (startRaw === "") {
		const suffix = Number(endRaw);
		if (!Number.isFinite(suffix) || suffix <= 0) return null;
		return { start: Math.max(0, size - suffix), end: size - 1 };
	}
	const start = Number(startRaw);
	if (!Number.isFinite(start) || start < 0 || start >= size) return null;
	const end = endRaw === "" ? size - 1 : Math.min(Number(endRaw), size - 1);
	return { start, end: Math.max(start, end) };
}

/**
 * Probe for binary content: a NUL byte or a non-whitespace control character
 * in the first 8 KiB means binary. Tab/newline/carriage-return/form-feed are
 * legitimately present in text; every other C0 control and DEL is not.
 * @param buffer - the first bytes of the file.
 * @returns true when the file looks binary.
 */
function isBinary(buffer) {
	const end = Math.min(buffer.length, 8192);
	for (let index = 0; index < end; index += 1) {
		const byte = buffer[index];
		if (byte === 0) return true;
		if (byte < 32 && byte !== 9 && byte !== 10 && byte !== 13 && byte !== 12) return true;
		if (byte === 127) return true;
	}
	return false;
}

/**
 * Count lines in a text buffer. Cheap and deterministic: newline count,
 * +1 when the content is non-empty and does not end with a newline.
 * @param text - decoded file content.
 * @returns line count.
 */
function countLines(text) {
	let lines = 0;
	for (let index = 0; index < text.length; index += 1) if (text.charCodeAt(index) === 10) lines += 1;
	if (text.length > 0 && text.charCodeAt(text.length - 1) !== 10) lines += 1;
	return lines;
}

/**
 * Scan one regular file into an artifact row.
 * @param filePath - absolute file path.
 * @param cfg - resolved plugin config.
 * @returns the artifact row.
 */
async function scanFile(filePath, cfg) {
	const stat = await fs.stat(filePath);
	const ext = extname(filePath).toLowerCase().replace(/^\./, "");
	const name = basename(filePath);
	let lines = null;
	if (stat.size <= cfg.maxLineFileSize) {
		try {
			const buffer = await readFile(filePath);
			if (!isBinary(buffer.subarray(0, 8192))) lines = countLines(buffer.toString("utf8"));
		} catch {
			lines = null;
		}
	}
	return {
		path: filePath,
		name,
		ext,
		category: categorize(ext),
		size: stat.size,
		mtimeMs: stat.mtimeMs,
		lines
	};
}

/**
 * Resolve the canonical allowed roots for the configured scope.
 * @param ctx - plugin context (workspaceRegistry available in the web profile).
 * @returns canonical workspace root paths; empty array in "any" scope.
 */
async function workspaceRoots(ctx) {
	const registry = ctx.workspaceRegistry;
	if (registry === void 0) return [];
	try {
		const roots = [];
		for (const workspace of registry.list()) {
			try {
				roots.push(await realpath(workspace.path));
			} catch {
				/* a disappeared workspace directory is not a scan root */
			}
		}
		return roots;
	} catch {
		return [];
	}
}

/**
 * Canonicalize allowed roots, dropping disappeared ones.
 * @param roots - raw allowed root paths.
 * @returns canonical root paths; empty when no roots or all disappeared.
 */
async function canonicalRootsOf(roots) {
	if (roots.length === 0) return [];
	return (await Promise.all(roots.map((root) => realpath(root).catch(() => null)))).filter((root) => root !== null);
}

/**
 * Throw a 403 when a canonical path is outside every allowed root.
 * @param canonical - canonical path to check.
 * @param allowedRoots - canonical allowed roots (empty = no restriction).
 * @param label - noun used in the error message ("directory" / "path").
 */
function assertInsideRoots(canonical, allowedRoots, label) {
	if (allowedRoots.length > 0 && !allowedRoots.some((root) => canonical === root || canonical.startsWith(root + sep))) {
		const error = new Error(`${label} is outside the registered workspaces: ${canonical}`);
		error.status = 403;
		throw error;
	}
}

/**
 * Canonicalize a directory path, resolving a missing directory to a 404.
 * @param dir - absolute directory path.
 * @returns the canonical path.
 */
async function canonicalDir(dir) {
	try {
		return await realpath(dir);
	} catch {
		const error = new Error(`directory not found: ${dir}`);
		error.status = 404;
		throw error;
	}
}

/**
 * Scan a directory recursively into artifact rows.
 * @param dir - absolute directory to scan.
 * @param cfg - resolved plugin config.
 * @param roots - canonical allowed roots (empty = no restriction).
 * @returns scan result.
 */
async function scanWorkspace(dir, cfg, roots) {
	const canonical = await canonicalDir(dir);
	const allowedRoots = await canonicalRootsOf(roots);
	assertInsideRoots(canonical, allowedRoots, "directory");
	const files = [];
	const dirs = [];
	let scanned = 0;
	let skipped = 0;
	let limitReached = false;
	const pending = [{ path: canonical, depth: 0 }];
	while (pending.length > 0) {
		if (scanned >= cfg.maxFiles) {
			limitReached = true;
			break;
		}
		const { path, depth } = pending.pop();
		let entries;
		try {
			entries = await fs.readdir(path, { withFileTypes: true });
		} catch {
			skipped += 1;
			continue;
		}
		for (const entry of entries) {
			if (scanned >= cfg.maxFiles) {
				limitReached = true;
				break;
			}
			if (entry.isSymbolicLink()) {
				skipped += 1;
				continue;
			}
			const childPath = join(path, entry.name);
			if (entry.isDirectory()) {
				if (cfg.skipDirs.includes(entry.name)) {
					skipped += 1;
					continue;
				}
				// Immediate subdirectories of the scanned root (depth 0) are
				// reported for client-side drill-down navigation.
				if (depth === 0) dirs.push(childPath);
				if (depth + 1 <= cfg.maxDepth) pending.push({ path: childPath, depth: depth + 1 });
				continue;
			}
			if (!entry.isFile()) {
				skipped += 1;
				continue;
			}
			try {
				files.push(await scanFile(childPath, cfg));
			} catch {
				skipped += 1;
			}
			scanned += 1;
		}
	}
	return {
		dir: canonical,
		scanned: files.length,
		skipped,
		limitReached,
		files,
		dirs
	};
}

/**
 * Read one regular file's content for the preview drawer. Bounded to
 * `cfg.maxPreviewBytes`; binary files are flagged (never decoded) and
 * oversized text is truncated with a flag. Scope enforcement mirrors the
 * scan route (403 outside registered workspaces).
 * @param filePath - absolute file path to preview.
 * @param cfg - resolved plugin config.
 * @param roots - canonical allowed roots (empty = no restriction).
 * @returns preview metadata: path/name/size/mtime plus binary|truncated|text.
 */
async function readArtifactFile(filePath, cfg, roots) {
	let canonical;
	try {
		canonical = await realpath(filePath);
	} catch {
		const error = new Error(`file not found: ${filePath}`);
		error.status = 404;
		throw error;
	}
	const allowedRoots = await canonicalRootsOf(roots);
	assertInsideRoots(canonical, allowedRoots, "path");
	const stat = await fs.stat(canonical);
	if (!stat.isFile()) {
		const error = new Error(`not a regular file: ${canonical}`);
		error.status = 400;
		throw error;
	}
	// Images get a much larger preview cap than text: a 256KB photo is
	// unreadable and a truncated PNG often fails to decode entirely. Other
	// files keep maxPreviewBytes.
	const ext = extname(canonical).slice(1).toLowerCase();
	const imageCap = IMAGE_MIME[ext] !== undefined;
	const cap = imageCap ? Math.max(cfg.maxPreviewBytes, IMAGE_PREVIEW_MAX_BYTES) : cfg.maxPreviewBytes;
	const limit = Math.min(cap, stat.size);
	const handle = await fs.open(canonical, "r");
	try {
		const buffer = Buffer.allocUnsafe(limit);
		const { bytesRead } = await handle.read(buffer, 0, limit, 0);
		const truncated = stat.size > cap;
		const base = { path: canonical, name: basename(canonical), size: stat.size, mtimeMs: stat.mtimeMs };
		if (isBinary(buffer.subarray(0, Math.min(bytesRead, 8192)))) {
			// Binary images come back as a bounded base64 data URL so the
			// browser can render <img> instead of a "cannot preview" message.
			const mime = IMAGE_MIME[ext];
			if (mime !== undefined) {
				return {
					...base,
					binary: true,
					image: true,
					mime,
					dataUrl: `data:${mime};base64,${buffer.subarray(0, bytesRead).toString("base64")}`,
					truncated,
					text: null,
				};
			}
			return { ...base, binary: true, truncated, text: null };
		}
		let text = buffer.subarray(0, bytesRead).toString("utf8");
		// The size cap may have cut a multibyte character mid-sequence; drop
		// the resulting trailing U+FFFD replacement characters.
		if (truncated) {
			while (text.length > 0 && text.charCodeAt(text.length - 1) === 0xfffd) text = text.slice(0, -1);
		}
		return { ...base, binary: false, truncated, text };
	} finally {
		await handle.close();
	}
}

/**
 * Send a JSON response.
 * @param res - node http response.
 * @param status - HTTP status.
 * @param value - JSON-serializable body.
 */
function sendJson(res, status, value) {
	const body = JSON.stringify(value);
	res.writeHead(status, {
		"content-type": "application/json; charset=utf-8",
		"cache-control": "no-store",
		"content-length": Buffer.byteLength(body)
	});
	res.end(body);
}

/**
 * Read a JSON request body (bounded to 1 MiB).
 * @param req - node http request.
 * @returns parsed body.
 */
async function readJson(req) {
	let body = "";
	let total = 0;
	for await (const chunk of req) {
		total += chunk.length;
		if (total > 1048576) throw new Error("request body too large");
		body += chunk;
	}
	if (body === "") return {};
	return JSON.parse(body);
}

/**
 * Plugin body: register the scan + preview routes on the web server and the
 * `artifacts_list` agent tool on the tool registry.
 * @param ctx - plugin context carrying webServer, workspaceRegistry, and tools.
 * @param config - validated plugin config.
 */
function apply(ctx, config) {
	const cfg = Config(config ?? {});
	const rootsFor = () => cfg.scope === "any" ? [] : workspaceRoots(ctx);
	ctx.effect(() => ctx.webServer.register({
		kind: "exact",
		path: "/api/artifacts/scan",
		handler: async (req, res) => {
			if (req.method !== "POST") {
				sendJson(res, 405, { error: "method not allowed" });
				return;
			}
			let payload;
			try {
				payload = await readJson(req);
			} catch (error) {
				sendJson(res, 400, { error: `bad request: ${String(error?.message ?? error)}` });
				return;
			}
			const dir = typeof payload?.dir === "string" ? payload.dir.trim() : "";
			if (dir === "") {
				sendJson(res, 400, { error: "missing dir" });
				return;
			}
			try {
				const result = await scanWorkspace(dir, cfg, await rootsFor());
				sendJson(res, 200, result);
			} catch (error) {
				sendJson(res, Number(error?.status) > 0 ? error.status : 500, {
					error: String(error?.message ?? error)
				});
			}
		}
	}), "artifacts-panel: scan route");
	ctx.effect(() => ctx.webServer.register({
		kind: "exact",
		path: "/api/artifacts/read",
		handler: async (req, res) => {
			if (req.method !== "GET") {
				sendJson(res, 405, { error: "method not allowed" });
				return;
			}
			const filePath = (new URL(req.url ?? "/", "http://x").searchParams.get("path") ?? "").trim();
			if (filePath === "") {
				sendJson(res, 400, { error: "missing path" });
				return;
			}
			try {
				const result = await readArtifactFile(filePath, cfg, await rootsFor());
				sendJson(res, 200, result);
			} catch (error) {
				sendJson(res, Number(error?.status) > 0 ? error.status : 500, {
					error: String(error?.message ?? error)
				});
			}
		}
	}), "artifacts-panel: read route");
	// Streaming media route for the video preview drawer: Range requests so
	// the browser <video> can seek; scope enforcement mirrors the read route.
	ctx.effect(() => ctx.webServer.register({
		kind: "exact",
		path: "/api/artifacts/media",
		handler: async (req, res) => {
			if (req.method !== "GET") {
				sendJson(res, 405, { error: "method not allowed" });
				return;
			}
			const filePath = (new URL(req.url ?? "/", "http://x").searchParams.get("path") ?? "").trim();
			if (filePath === "") {
				sendJson(res, 400, { error: "missing path" });
				return;
			}
			let canonical;
			try {
				canonical = await realpath(filePath);
			} catch {
				sendJson(res, 404, { error: `file not found: ${filePath}` });
				return;
			}
			try {
				const allowedRoots = await canonicalRootsOf(await rootsFor());
				assertInsideRoots(canonical, allowedRoots, "path");
			} catch (error) {
				sendJson(res, Number(error?.status) > 0 ? error.status : 500, { error: String(error?.message ?? error) });
				return;
			}
			const ext = extname(canonical).slice(1).toLowerCase();
			const mime = VIDEO_MIME[ext];
			if (mime === undefined) {
				sendJson(res, 415, { error: `unsupported media type: ${ext}` });
				return;
			}
			let stat;
			try {
				stat = await fs.stat(canonical);
			} catch {
				sendJson(res, 404, { error: "file not found" });
				return;
			}
			if (!stat.isFile()) {
				sendJson(res, 400, { error: "not a regular file" });
				return;
			}
			const range = parseRange(req.headers?.range, stat.size);
			const start = range?.start ?? 0;
			const end = range?.end ?? stat.size - 1;
			res.writeHead(range === null ? 200 : 206, {
				"content-type": mime,
				"accept-ranges": "bytes",
				"content-length": String(end - start + 1),
				...(range === null ? {} : { "content-range": `bytes ${start}-${end}/${stat.size}` }),
			});
			const stream = createReadStream(canonical, { start, end });
			stream.on("error", () => {
				try { res.destroy(); } catch { /* ignore */ }
			});
			stream.pipe(res);
		}
	}), "artifacts-panel: media route");
	ctx.effect(() => ctx.tools.register(defineTool({
		name: "artifacts_list",
		description: "List and summarize artifact files (agent-generated files) in a workspace directory. Scans a directory respecting the artifacts panel's scope and skip rules, optionally filters by a case-insensitive name substring, and returns the matching file count, total size, counts per type, and the 50 largest files with their paths, sizes, and line counts. Use it to survey what the workspace produced without reading file contents.",
		parameters: {
			dir: {
				type: "string",
				description: "Absolute directory to scan; defaults to the calling session's workspace (cwd) when omitted."
			},
			pattern: {
				type: "string",
				description: "Case-insensitive substring matched against file name and path."
			},
			maxFiles: {
				type: "integer",
				description: "Scan cap (default 200; clamped to the plugin maxFiles config)."
			}
		},
		output: {
			schema: {
				type: "object",
				additionalProperties: false,
				properties: {
					dir: { type: "string", required: true },
					scanned: { type: "integer", required: true },
					totalSize: { type: "integer", required: true },
					limitReached: { type: "boolean", required: true },
					byType: {
						type: "object",
						additionalProperties: false,
						required: true,
						properties: {
							code: { type: "integer", required: true },
							docs: { type: "integer", required: true },
							config: { type: "integer", required: true },
							data: { type: "integer", required: true },
							image: { type: "integer", required: true },
							media: { type: "integer", required: true },
							web: { type: "integer", required: true },
							archive: { type: "integer", required: true },
							other: { type: "integer", required: true }
						}
					},
					files: {
						type: "array",
						required: true,
						items: {
							type: "object",
							additionalProperties: false,
							properties: {
								name: { type: "string", required: true },
								path: { type: "string", required: true },
								category: { type: "string", required: true },
								size: { type: "integer", required: true },
								lines: { required: true, oneOf: [{ type: "integer" }, { type: "null" }] },
								mtimeMs: { type: "integer", required: true }
							}
						}
					}
				}
			},
			render: (_args, value) => [{
				type: "text",
				text: `Artifacts in ${value.dir}: ${value.scanned} files, ${value.totalSize} bytes total`
			}]
		},
		async execute(args, exec) {
			const dir = (args.dir ?? exec.agent?.session?.header?.cwd ?? "").trim();
			if (dir === "") throw new Error("artifacts_list: no dir given and no session workspace (cwd) available");
			const effectiveMax = Math.max(1, Math.min(args.maxFiles ?? 200, cfg.maxFiles));
			const result = await scanWorkspace(dir, Config({ ...cfg, maxFiles: effectiveMax }), await rootsFor());
			const pattern = (args.pattern ?? "").toLowerCase();
			const matches = pattern === "" ? result.files : result.files.filter((file) => file.name.toLowerCase().includes(pattern) || file.path.toLowerCase().includes(pattern));
			const byType = {
				code: 0,
				docs: 0,
				config: 0,
				data: 0,
				image: 0,
				media: 0,
				web: 0,
				archive: 0,
				other: 0
			};
			for (const file of matches) byType[file.category] = (byType[file.category] ?? 0) + 1;
			const largest = [...matches].sort((a, b) => b.size - a.size).slice(0, 50).map((file) => ({
				name: file.name,
				path: file.path,
				category: file.category,
				size: file.size,
				lines: file.lines,
				mtimeMs: file.mtimeMs
			}));
			return {
				dir: result.dir,
				scanned: matches.length,
				totalSize: matches.reduce((sum, file) => sum + (file.size ?? 0), 0),
				limitReached: result.limitReached,
				byType,
				files: largest
			};
		}
	})), "artifacts-panel: artifacts_list tool");
}

export { apply, categorize, countLines, isBinary, readArtifactFile, scanFile, scanWorkspace, workspaceRoots };
