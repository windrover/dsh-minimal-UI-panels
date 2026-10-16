#!/usr/bin/env node
/**
 * The artifact-layout contract: one conversation → one stable, readable folder,
 * with a fixed type layer inside.
 *
 * What this pins down (and why each matters):
 *
 *  - the folder name carries LOCAL start date + title slug + **8-char session
 *    id**, so a conversation is findable by date, by title, or by id;
 *  - the date is the session's start day, NOT the wall-clock day of each write
 *    and NOT UTC — the old rule (`new Date().toISOString()` on every write) put
 *    one conversation in one folder per day it was reopened, and shifted the day
 *    by one for every write between 00:00 and 08:00 in UTC+8;
 *  - an existing folder for the session is reused, including folders the OLD
 *    plugin wrote as `<date>-<full-session-id>`, so upgrading never forks or
 *    scatters an in-flight conversation;
 *  - a delegated session nests under its parent (`<parent>/subagents/<…>`);
 *  - `artifacts_list` defaults to this conversation's folder, so "what did this
 *    conversation produce" needs no arguments;
 *  - nothing is pre-created: the folder appears only when something is written.
 *
 * Run: node test/artifacts-naming.test.mjs
 */
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import assert from 'node:assert/strict'

const paths = await import('../lib/host/artifact-paths.js')
const mod = await import('../lib/host/artifacts.js')

const { artifactFolderName, artifactPromptText, findSessionFolder, localDay, resolveArtifactDir, slugifyTitle, subagentFolderName } = paths

const ID = 'session-5e53a9f9-aa19-4748-8ad9-c00bebddf0fd'
const BARE = '5e53a9f9-aa19-4748-8ad9-c00bebddf0fd'
const ID8 = '5e53a9f9'

// A fixed instant whose LOCAL calendar day we derive the same way a reader would.
const START = new Date(2026, 9, 16, 9, 30, 0).getTime() // 2026-10-16 09:30 local
const START_DAY = localDay(START)

const workspace = mkdtempSync(join(tmpdir(), 'artifacts-naming-'))
const sessionsRoot = join(workspace, 'sessions')
// scanWorkspace reports the canonical path, and macOS /var is a symlink to /private/var.
const canon = realpathSync(workspace)

try {
  // ── 1. local day, and the old UTC bug stays fixed ─────────────────────────
  assert.equal(localDay(START), START_DAY, 'localDay must render the local calendar day')
  // 2026-10-16 01:30 local is still 2026-10-16 locally; toISOString() would say 2026-10-15.
  const earlyMorning = new Date(2026, 9, 16, 1, 30, 0)
  assert.equal(localDay(earlyMorning.getTime()), '2026-10-16', 'a 01:30 local start must not be dated a day earlier')
  assert.equal(localDay(Number.NaN), undefined)
  console.log('ok  folder date is the LOCAL start day (UTC off-by-one fixed)')

  // ── 2. slug rules ─────────────────────────────────────────────────────────
  assert.equal(slugifyTitle('字体库 清点 / Arial'), '字体库-清点-Arial')
  assert.equal(slugifyTitle('a\\b:c*d?e"f<g>h|i'), 'a-b-c-d-e-f-g-h-i')
  assert.equal(slugifyTitle('   '), '')
  assert.equal(slugifyTitle('/:'), '')
  assert.equal(slugifyTitle('.hidden.'), 'hidden')
  assert.equal([...slugifyTitle('很长的标题'.repeat(10))].length, 24, 'slug is capped by code points')
  assert.equal(slugifyTitle('😀'.repeat(30)).includes('\uFFFD'), false, 'surrogate pairs are never split')
  console.log('ok  titles become readable, path-safe, length-bounded slugs')

  // ── 3. the folder name ────────────────────────────────────────────────────
  const name = artifactFolderName({ createdAt: START, title: '字体库清点', id: ID })
  assert.equal(name, `${START_DAY}-字体库清点-${ID8}`)
  assert.equal(artifactFolderName({ createdAt: START, title: undefined, id: ID }), `${START_DAY}-${ID8}`, 'no title yet → date + id8')
  assert.equal(artifactFolderName({ createdAt: Number.NaN, title: 'X', id: BARE, now: START }), `${START_DAY}-X-${ID8}`, 'missing createdAt falls back to now')
  assert.equal(subagentFolderName({ title: '字体子任务', id: 'session-abc12345-ffff' }), '字体子任务-abc12345')
  console.log('ok  folder name is <local-start-date>-<title-slug>-<session-id8>')

  // ── 4. reuse beats recompute (new shape AND the legacy shape) ─────────────
  mkdirSync(join(sessionsRoot, `2026-10-12-${BARE}`), { recursive: true }) // what the OLD plugin wrote
  mkdirSync(join(sessionsRoot, 'not-a-session'), { recursive: true })
  writeFileSync(join(sessionsRoot, 'stray.md'), '# stray\n')
  assert.equal(findSessionFolder(sessionsRoot, ID), `2026-10-12-${BARE}`, 'a legacy folder is reused, not duplicated')
  assert.equal(findSessionFolder(sessionsRoot, 'session-deadbeefff-0000-0000-0000-000000000000'), undefined)
  assert.equal(findSessionFolder(join(workspace, 'missing'), ID), undefined, 'a missing sessions/ is not an error')
  const reused = resolveArtifactDir({ sessionsRoot, session: { id: ID, header: { createdAt: START, cwd: workspace } }, title: '新标题' })
  assert.deepEqual(reused, { rel: `sessions/2026-10-12-${BARE}`, name: `2026-10-12-${BARE}`, reused: true })
  console.log('ok  an existing folder for the session is reused (legacy names included)')

  // ── 5. delegation nests under its parent ──────────────────────────────────
  const parentId = 'session-1234abcd-0000-0000-0000-000000000000'
  const parent = { id: parentId, header: { createdAt: START, cwd: workspace } }
  const parentFolder = join(sessionsRoot, '2026-10-15-父会话-1234abcd')
  mkdirSync(parentFolder, { recursive: true })
  const childId = 'session-abcdef12-3456-7890-abcd-ef1234567890'
  const child = { id: childId, header: { createdAt: START, cwd: workspace, origin: 'subagent', parentSession: parentId } }
  const childDir = resolveArtifactDir({ sessionsRoot, session: child, title: '子任务' })
  assert.equal(childDir.rel, `sessions/2026-10-15-父会话-1234abcd/subagents/子任务-abcdef12`)
  // Re-resolving after the child has written reuses its nested folder.
  mkdirSync(join(workspace, childDir.rel), { recursive: true })
  writeFileSync(join(workspace, childDir.rel, 'x.txt'), 'x\n')
  assert.equal(resolveArtifactDir({ sessionsRoot, session: child, title: '子任务' }).rel, childDir.rel, 'the nested folder is reused')
  // No parent folder anywhere → the child still gets a usable top-level folder.
  const orphan = resolveArtifactDir({
    sessionsRoot,
    session: { id: 'session-99999999-0000-0000-0000-000000000000', header: { createdAt: START, cwd: workspace, origin: 'subagent', parentSession: 'session-11111111-0000-0000-0000-000000000000' } },
    title: '孤儿'
  })
  assert.equal(orphan.rel, `sessions/${START_DAY}-孤儿-99999999`)
  console.log('ok  delegated sessions nest under their parent, with a working fallback')

  // ── 6. the prompt text is actionable ──────────────────────────────────────
  const fresh = resolveArtifactDir({ sessionsRoot, session: { id: 'session-77777777-0000-0000-0000-000000000000', header: { createdAt: START, cwd: workspace } }, title: '新会话' })
  const freshText = artifactPromptText({ dir: fresh, id: 'session-77777777-0000-0000-0000-000000000000' })
  assert.match(freshText, new RegExp(`sessions/${START_DAY}-新会话-77777777`), 'the exact target folder is named')
  assert.match(freshText, /mkdir -p/, 'the agent is told to create it')
  for (const sub of paths.ARTIFACT_TYPE_DIRS) assert.match(freshText, new RegExp(`${sub}/`), `type layer names ${sub}/`)
  assert.match(freshText, /README\.md/, 'the index file is required')
  assert.match(freshText, /NOT in the workspace root/, 'the workspace root is excluded')
  const reusedText = artifactPromptText({ dir: reused, id: ID })
  assert.match(reusedText, /already exists/)
  assert.match(reusedText, /never create a second folder/i)
  console.log('ok  the prompt text names the exact folder, the type layer and the index file')

  // ── 7. wiring: the section, and the tool default ──────────────────────────
  const promptSections = []
  let registeredTool
  const stubCtx = {
    on: () => {},
    effect: (fn) => { try { return fn() } catch { return undefined } },
    tools: { register: (tool) => { registeredTool = tool } },
    webServer: { register: () => {} },
    systemPrompt: { section: (section) => promptSections.push(section) },
    workspaceRegistry: { list: () => [{ path: workspace }] },
    logger: { warn: () => {}, info: () => {}, debug: () => {}, error: () => {} },
    get: (name) => (name === 'sessionTitle' ? { get: () => ({ title: '会话标题' }) } : undefined)
  }
  mod.apply(stubCtx, {})

  const section = promptSections.find((s) => s?.name === 'tool:artifacts-session-dir')
  assert.ok(section, 'the artifact-directory section is registered')

  const liveSession = { id: 'session-bbbbbbbb-1111-2222-3333-444444444444', header: { createdAt: START, cwd: workspace } }
  const liveText = section.text({ agent: { session: liveSession } })
  assert.match(liveText, /会话标题/, 'the session title reaches the folder name')
  const ownDir = join(workspace, `sessions/${START_DAY}-会话标题-bbbbbbbb`)
  assert.match(liveText, new RegExp(`sessions/${START_DAY}-会话标题-bbbbbbbb`))

  // No artifact folder yet → the tool scans the workspace root.
  const before = await registeredTool.execute({}, { agent: { session: liveSession } })
  assert.equal(before.dir, canon, 'before anything is written the tool falls back to the workspace root')
  assert.ok(before.files.some((f) => f.name === 'stray.md'), 'the workspace-root scan sees the root-level file')

  // Once the conversation has a folder, the tool answers from it.
  mkdirSync(join(ownDir, 'data'), { recursive: true })
  writeFileSync(join(ownDir, 'data', 'DIN分类表.csv'), 'a,b\n1,2\n')
  const after = await registeredTool.execute({}, { agent: { session: liveSession } })
  assert.equal(after.dir, realpathSync(ownDir), 'artifacts_list defaults to this conversation\'s folder')
  assert.equal(after.scanned, 1)
  assert.equal(after.byType.data, 1)
  console.log('ok  artifacts_list defaults to this conversation\'s artifact folder')

  // ── 8. nothing is pre-created by resolving ────────────────────────────────
  const untouched = resolveArtifactDir({ sessionsRoot, session: { id: 'session-cccccccc-1111-2222-3333-444444444444', header: { createdAt: START, cwd: workspace } }, title: '空会话' })
  assert.equal(untouched.reused, false)
  const { existsSync } = await import('node:fs')
  assert.equal(existsSync(join(workspace, untouched.rel)), false, 'resolving a folder must not create it')
  console.log('ok  resolving a folder creates nothing (lazy creation preserved)')

  console.log('\nall artifact-naming checks passed')
} finally {
  rmSync(workspace, { recursive: true, force: true })
}
