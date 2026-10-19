/*
 * dsh-minimal-ui-panels — host/ltm 的共享层。
 *
 * 从 1925 行的 ltm.js 里按「改动原因」抽出：作用域/注入模式的词汇表与校验、
 * 结果上限钳制、记录渲染。这些都是纯的东西——不碰 IO、不碰 ctx、不持状态，
 * 所以既能被 ltm.js 用，也能被拆出去的 recall 用，而不会形成环。
 */
export const DEFAULT_RECALL_LIMIT = 5
/** Hard cap on a single tool's recall/list result count. */

export const MAX_RESULTS = 25
/** Bounds the per-assembly injected digest so it never dominates a request. */

export const DEFAULT_MAX_INJECTED_CHARS = 2400
/** How many recent memories each scope may contribute to the injected digest. */

export const DEFAULT_TIMELINE_INJECTED_SPLIT = 4
/** Prompt-section order; tool guidance lives in the 100–199 band. */

export const TOOL_GUIDANCE_ORDER = 118
/** Dynamic-context order; after other runtime-context rows (100–119). */

export const CONTEXT_ORDER = 130

/** Scope precedence for injection and "all" scans: user profile first. */

export const SCOPE_PRIORITY = ['user', 'global', 'workspace']

export const SCOPES = new Set(SCOPE_PRIORITY)

/** How the plugin injects memory each assembly. */

export const INJECT_MODES = new Set(['recent', 'full', 'off'])

/** Coerce legacy boolean config (`injectContext: true/false`) into a mode. */

export function normalizeInjectMode(value) {
  if (value === undefined || value === true) return 'recent'
  if (value === false) return 'off'
  if (INJECT_MODES.has(value)) return value
  throw new Error(`invalid injectContext mode "${value}" (expected "recent", "full", or "off")`)
}


export function assertScope(scope) {
  if (scope === undefined) return undefined
  if (!SCOPES.has(scope)) {
    throw new Error(`invalid memory scope "${scope}" (expected "user", "global", or "workspace")`)
  }
  return scope
}

/**
 * Resolve the workspace root for a session. `ctx.session.header.cwd` is the
 * immutable workspace-write boundary; the configured root is the fallback for
 * agentless calls or sessions without a cwd.
 *
 * The session's `header.cwd` is authoritative for an in-session call. But the
 * memory panel is a Web UI that also reaches these routes over plain HTTP,
 * where there is no agent initiator and `session` is `undefined` — so `cwd` is
 * empty. The old fallback was `process.cwd()`, which is the directory the dsh
 * web process was launched from (e.g. the user's home), NOT the registered
 * workspace. That made the workspace scope read a file that does not exist and
 * report an empty list. When there is no session, resolve from the workspace
 * registry instead: the registered workspace whose path is the longest prefix
 * of `process.cwd()` (the process runs inside one), else the first registered
 * workspace. `config.workspaceRoot` and `process.cwd()` remain only as a last
 * resort when the registry is unavailable.
 */

export function clampLimit(limit, maxResults) {
  if (!Number.isInteger(limit) || limit < 1) return DEFAULT_RECALL_LIMIT
  return Math.min(limit, maxResults)
}

/**
 * Describe one memory record compactly for the model: id, scope, tags, and the
 * content (which is left as-is, not quoted).
 */

export function describeRecord(record, score) {
  if (record === null || typeof record !== 'object') return '- (invalid record)'
  const tags = Array.isArray(record.tags) && record.tags.length > 0 ? ` [${record.tags.join(', ')}]` : ''
  const scoreText = typeof score === 'number' && score > 0 ? ` (score ${score.toFixed(2)})` : ''
  const stale = record.superseded === true ? ' [SUPERSEDED]' : ''
  return `- ${record.id} [${record.scope}]${tags}${stale}: ${record.content}${scoreText}`
}

/** A stable, bounded render of a set of ranked records. */

export function renderRecords(records, heading) {
  if (records.length === 0) return `${heading}: none.`
  // Accept both wrapped `{ record, score }` (memory_list) and flat recall items
  // `{ id, scope, content, tags, score }` (memory_recall).
  const rows = records.map((r) => {
    if (r === null || typeof r !== 'object') return '- (invalid record)'
    if ('record' in r) return describeRecord(r.record, r.score)
    return describeRecord(r, r.score)
  })
  return `${heading}:\n${rows.join('\n')}`
}

/** Human-readable heading for a scope in the injected digest. */

export function scopeLabel(scope) {
  switch (scope) {
    case 'user': return 'User profile memory'
    case 'global': return 'Global memory'
    case 'workspace': return 'Workspace memory'
    default: return `${scope} memory`
  }
}

/**
 * Build the per-assembly recent-memory digest for one scope, bounded by a
 * character budget. Recency is `updatedAt`; no retrieval is performed, so this
 * is deterministic and cheap.
 */
