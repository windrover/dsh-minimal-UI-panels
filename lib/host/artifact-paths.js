/**
 * dsh-artifacts-panel — per-session artifact layout (pure helpers).
 *
 * One conversation owns exactly one folder under `<workspace>/sessions/`, so a
 * conversation's products can be located from the path alone:
 *
 *   <workspace>/sessions/<YYYY-MM-DD>-<title-slug>-<session-id8>/   one conversation
 *       README.md            index: what this conversation was about + every artifact
 *       docs/   data/   images/   scripts/   media/   misc/          fixed type layer
 *
 * Design constraints that shaped this module:
 *
 *  - **Local date, session start.** The folder date is the day the conversation
 *    STARTED, in the machine's local time — not the wall-clock day of each write
 *    and not UTC. The previous rule used `new Date().toISOString()` (UTC) at every
 *    write, so one conversation scattered across one folder per day it was
 *    reopened and the date was off by one during 00:00–08:00 in UTC+8. Locating a
 *    conversation by structure requires the folder to be stable for its lifetime.
 *
 *  - **Reuse over recompute.** `findSessionFolder()` finds an existing folder
 *    whose name contains this session's 8-character id prefix, so (a) a title that
 *    appears or changes later never moves the folder, and (b) folders created by
 *    OLDER versions of this plugin (`<date>-<full-session-id>`) keep being used
 *    instead of a second folder appearing for the same conversation.
 *
 *  - **Subagents nest.** A delegated session writes under its parent's folder
 *    (`<parent>/subagents/<slug>-<id8>/`) so one conversation's products stay in
 *    one place. When the parent folder cannot be resolved the child falls back to
 *    the top level rather than failing.
 *
 * Nothing here creates directories: the folder appears when the agent writes into
 * it, which is what keeps question-only sessions from leaving empty folders
 * behind (see test/artifacts-no-empty-dirs.test.mjs).
 *
 * @module dsh-minimal-ui-panels/artifact-paths
 */
import { readdirSync } from 'node:fs'
import { join } from 'node:path'

/** The fixed inner type layer; every artifact goes into exactly one of these. */
export const ARTIFACT_TYPE_DIRS = ['docs', 'data', 'images', 'scripts', 'media', 'misc']

/** Subfolder holding sessions delegated by this one. */
export const SUBAGENT_DIR = 'subagents'

/** Index file every artifact folder carries. */
export const INDEX_FILE = 'README.md'

/** Characters that break paths, globs, or shell quoting in a folder name. */
const HOSTILE = /[/\\:*?"<>|#%{}^~[\]`;$&!'\u0000-\u001f\u007f]/g

/** Strip the `session-` prefix once, so callers can pass either spelling. */
export function bareSessionId(id) {
  return String(id ?? '').replace(/^session-/, '')
}

/** Zero-padded two-digit number. */
const pad2 = (value) => String(value).padStart(2, '0')

/**
 * Format an epoch-ms instant as `YYYY-MM-DD` in LOCAL time.
 * @param epochMs - epoch milliseconds; a non-finite value yields `undefined`.
 * @returns the local calendar day, or `undefined` when the input is not a usable instant.
 */
export function localDay(epochMs) {
  if (!Number.isFinite(epochMs)) return undefined
  const date = new Date(epochMs)
  if (Number.isNaN(date.getTime())) return undefined
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`
}

/**
 * Turn a session title into one readable, filesystem-safe folder segment.
 * CJK and other letters survive; path/glob/shell metacharacters become `-`;
 * whitespace runs collapse to a single `-`; the result is bounded by code points
 * (never split a character) and never starts or ends with `-` or `.`.
 * @param title - raw session title.
 * @param maxChars - maximum code points kept.
 * @returns the slug, or `''` when nothing usable remains.
 */
export function slugifyTitle(title, maxChars = 24) {
  if (typeof title !== 'string') return ''
  const cleaned = title
    .normalize('NFC')
    .replace(HOSTILE, ' ')
    .replace(/\s+/g, '-')
    .replace(/^[-.]+/, '')
    .replace(/[-.]+$/, '')
  if (cleaned === '') return ''
  const cut = [...cleaned].slice(0, Math.max(1, maxChars)).join('')
  return cut.replace(/[-.]+$/, '')
}

/**
 * Folder name for one conversation: `<YYYY-MM-DD>-<slug>-<id8>`.
 * The date is the conversation's start day in local time; the id8 is the first
 * 8 characters of the session id, which is the stable key the reuse scan matches.
 * @param options - `createdAt` (epoch ms; falls back to `now`), `title`, `id`, `now`.
 * @returns the folder name (never absolute, never containing a separator).
 */
export function artifactFolderName({ createdAt, title, id, now = Date.now() } = {}) {
  const bare = bareSessionId(id)
  const short = bare.slice(0, 8)
  const day = localDay(createdAt) ?? localDay(now)
  return [day, slugifyTitle(title), short].filter((part) => part !== undefined && part !== '').join('-')
}

/**
 * Folder name for a delegated session, placed inside its parent's folder.
 * Date is omitted on purpose: the parent folder already carries the day.
 * @param options - `title`, `id`.
 * @returns the folder name for `<parent>/subagents/`.
 */
export function subagentFolderName({ title, id } = {}) {
  const bare = bareSessionId(id)
  const short = bare.slice(0, 8)
  return [slugifyTitle(title), short].filter((part) => part !== '').join('-') || 'subagent'
}

/**
 * Direct subdirectories of one directory, symlinks excluded.
 * @param dir - directory to list.
 * @returns directory entries, or `[]` when the directory is absent/unreadable.
 */
export function listSubdirs(dir) {
  try {
    return readdirSync(dir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && !entry.isSymbolicLink())
      .map((entry) => entry.name)
  } catch {
    return []
  }
}

/**
 * Find the folder already owned by one session inside `sessions/`.
 * Matches on the 8-character id prefix anywhere in the name, which covers both
 * this plugin's `<date>-<slug>-<id8>` and the older `<date>-<full-session-id>`.
 * @param sessionsRoot - `<workspace>/sessions`.
 * @param id - session id, with or without the `session-` prefix.
 * @returns the existing folder name, or `undefined`.
 */
export function findSessionFolder(sessionsRoot, id, { includeSubagentDirs = false } = {}) {
  const short = bareSessionId(id).slice(0, 8)
  if (short.length < 8) return undefined
  const names = listSubdirs(sessionsRoot)
  const direct = names.find((name) => name.includes(short))
  if (direct !== undefined) return direct
  if (!includeSubagentDirs) return undefined
  // A second write may already have gone into `<parent>/subagents/<...-id8>/`.
  for (const name of names) {
    const nested = listSubdirs(join(sessionsRoot, name, SUBAGENT_DIR)).find((child) => child.includes(short))
    if (nested !== undefined) return `${name}/${SUBAGENT_DIR}/${nested}`
  }
  return undefined
}

/**
 * Resolve where one session's artifacts belong, without touching the filesystem
 * beyond the reuse scan.
 * @param options - `sessionsRoot` (`<workspace>/sessions`, required), `session`
 *   ({ id, header: { createdAt, cwd, origin, parentSession } }), `title`.
 * @returns `{ rel, name, reused }` where `rel` is workspace-relative, or
 *   `undefined` when there is no session id to key on.
 */
export function resolveArtifactDir({ sessionsRoot, session, title } = {}) {
  const bare = bareSessionId(session?.id)
  if (bare === '') return undefined
  const header = session?.header ?? {}

  if (typeof sessionsRoot === 'string' && sessionsRoot !== '') {
    const existing = findSessionFolder(sessionsRoot, bare, { includeSubagentDirs: true })
    if (existing !== undefined) {
      const name = existing.split('/').at(-1)
      return { rel: `sessions/${existing}`, name, reused: true }
    }
  }

  const name = artifactFolderName({ createdAt: header.createdAt, title, id: bare })
  const parentId = bareSessionId(header.parentSession)
  if (header.origin === 'subagent' && parentId !== '' && typeof sessionsRoot === 'string' && sessionsRoot !== '') {
    const parent = listSubdirs(sessionsRoot).find((entry) => entry.includes(parentId.slice(0, 8)))
    if (parent !== undefined) {
      const child = subagentFolderName({ title, id: bare })
      return { rel: `sessions/${parent}/${SUBAGENT_DIR}/${child}`, name: child, reused: false, parent }
    }
  }
  return { rel: `sessions/${name}`, name, reused: false }
}

/**
 * The system-prompt section text for one session's artifact folder.
 * Kept as a pure function so the wording and the folder name are testable
 * without a running host.
 * @param options - `dir` (from {@link resolveArtifactDir}), `id`.
 * @returns the prompt text for the `tool:artifacts-session-dir` section.
 */
export function artifactPromptText({ dir, id } = {}) {
  const rel = dir?.rel ?? ''
  if (rel === '') {
    return (
      'Session artifact directory: write this session\'s output files into a single per-session ' +
      'folder under `sessions/` in the workspace root, NOT into the workspace root itself ' +
      '(create it with `mkdir -p`).'
    )
  }
  const lead = dir.reused
    ? `Session artifact directory: this conversation's output files belong in \`${rel}\`, which already exists — keep writing there (older sessions used \`<date>-<full-session-id>\`; never create a second folder for the same conversation).`
    : `Session artifact directory: this conversation's output files belong in \`${rel}\` under the workspace root, NOT in the workspace root itself — create it with \`mkdir -p\`. The name is <local-start-date>-<title-slug>-<session-id8> (id ${bareSessionId(id).slice(0, 8)}), so a conversation can be found by date, by title, or by id.`
  return (
    `${lead}\n` +
    `Inside that folder keep this fixed layout, by artifact type: ` +
    `${ARTIFACT_TYPE_DIRS[0]}/ (md, txt, pdf, docx, pptx), ${ARTIFACT_TYPE_DIRS[1]}/ (csv, tsv, xlsx, json, yaml, sqlite), ` +
    `${ARTIFACT_TYPE_DIRS[2]}/ (png, jpg, webp, svg, gif), ${ARTIFACT_TYPE_DIRS[3]}/ (py, sh, js, mjs, ts, ipynb), ` +
    `${ARTIFACT_TYPE_DIRS[4]}/ (mp4, mov, mp3, wav), ${ARTIFACT_TYPE_DIRS[5]}/ (anything else, plus scratch).\n` +
    `Name files descriptively (\`DIN分类表.csv\`, \`fix-cmap.py\`) — never \`output.png\` or \`final.csv\` — and keep ` +
    `\`${INDEX_FILE}\` in the folder updated: one line naming this conversation, then one bullet per artifact saying what it is.`
  )
}
