#!/usr/bin/env node
/**
 * Behaviour test: the artifacts panel must open on THIS conversation's artifact
 * folder, not on the workspace root.
 *
 * Why it matters: the per-session folder is where the agent was told to write
 * (the `tool:artifacts-session-dir` prompt section), so it is the listing the
 * user almost always wants — but the panel used to default to `cwd`, which in a
 * DSH workspace is the root that holds every session folder, every plugin repo
 * and whatever else the workspace happens to carry.
 *
 * The panel must NOT re-derive the folder name in the browser: the host owns the
 * naming rule and the reuse scan, so the panel asks `/api/artifacts/session-dir`
 * instead. This test renders the real component with a minimal hook runtime and
 * a scripted fetch, and pins the four outcomes that matter:
 *
 *   1. folder exists   → the scan targets it, and the select offers it;
 *   2. folder absent   → the scan falls back to the workspace root (a scan of a
 *                        missing directory would be a 404, not an empty list);
 *   3. probe fails     → same fallback, so the panel keeps working on a host
 *                        that does not yet serve the route;
 *   4. a directory the user pinned themselves always wins, and no probe is sent.
 *
 * Run: node test/artifacts-session-default.test.mjs
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'
import assert from 'node:assert/strict'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const SOURCE = readFileSync(join(ROOT, 'src', 'artifacts', 'client.js'), 'utf8')

const SESSION_ID = 'session-bbbbbbbb-1111-2222-3333-444444444444'
const WORKSPACE = '/ws'
const SESSION_DIR = '/ws/sessions/2026-10-16-字体库清点-bbbbbbbb'
const PINNED = '/ws/somewhere-else'

/** A minimal hook runtime: deps-aware effects, slots, refs (as in the scroll test). */
function createHooks() {
  const slots = []
  const deps = []
  let cursor = 0
  let layout = []
  let passive = []
  const changed = (i, next) => {
    const prev = deps[i]
    deps[i] = next
    if (prev === void 0 || next === void 0) return true
    return next.length !== prev.length || next.some((value, k) => !Object.is(value, prev[k]))
  }
  const elements = (type, p, kids) => (kids === void 0 ? { type, props: { ...(p ?? {}) } } : { type, props: { ...(p ?? {}), children: kids } })
  const react = {
    createElement: (type, p, ...kids) => elements(type, p, kids.length > 0 ? kids : void 0),
    Fragment: Symbol('Fragment'),
    useState(initial) {
      const i = cursor++
      if (!(i in slots)) slots[i] = typeof initial === 'function' ? initial() : initial
      return [slots[i], (next) => { slots[i] = typeof next === 'function' ? next(slots[i]) : next }]
    },
    useRef(initial) {
      const i = cursor++
      if (!(i in slots)) slots[i] = { current: initial }
      return slots[i]
    },
    useEffect(fn, d) { const i = cursor++; if (changed(i, d)) passive.push(fn) },
    useLayoutEffect(fn, d) { const i = cursor++; if (changed(i, d)) layout.push(fn) },
    useCallback: (fn) => fn,
    useMemo: (fn) => fn(),
  }
  return {
    react,
    jsxRuntime: { jsx: react.createElement, jsxs: react.createElement, Fragment: react.Fragment },
    begin: () => { cursor = 0; layout = []; passive = [] },
    passiveEffects: () => passive,
  }
}

/**
 * Build one isolated panel run: a fresh VM context (so persisted prefs are read
 * fresh), a scripted fetch, and a render/flush pair the test drives by hand.
 * @param options - `prefs` (persisted panel prefs), `exists` (probe answer), `probeFails`.
 * @returns the driver: render/flush plus the recorded requests and the rendered tree.
 */
function setup({ prefs = null, exists = true, probeFails = false } = {}) {
  const requests = []
  let registration = null
  vm.runInNewContext(SOURCE, {
    window: {
      __ModuleLoader__: { load: (reg) => { registration = reg } },
      localStorage: {
        getItem: () => (prefs === null ? null : JSON.stringify(prefs)),
        setItem: () => {}
      }
    },
    console,
    AbortController,
    URLSearchParams,
    setTimeout,
    clearTimeout,
    // The auto-refresh interval is not what this test is about: a no-op timer
    // keeps the run deterministic and leaves no handle behind.
    setInterval: () => 0,
    clearInterval: () => {},
    fetch: (url, options) => {
      const target = String(url)
      const body = options?.body === void 0 ? null : JSON.parse(options.body)
      requests.push({ url: target, body })
      if (target.startsWith('/api/artifacts/session-dir')) {
        if (probeFails) return Promise.resolve({ ok: false, status: 404, json: async () => ({ error: 'not found' }) })
        return Promise.resolve({ ok: true, status: 200, json: async () => ({ dir: SESSION_DIR, exists, reused: false }) })
      }
      return Promise.resolve({ ok: true, status: 200, json: async () => ({ dir: body.dir, scanned: 0, skipped: 0, limitReached: false, files: [], dirs: [] }) })
    }
  }, { filename: 'src/artifacts/client.js' })

  const hooks = createHooks()
  const fragment = registration.factory((spec) => {
    if (spec === 'react') return hooks.react
    if (spec === 'react/jsx-runtime') return hooks.jsxRuntime
    throw new Error(`unexpected require(${JSON.stringify(spec)})`)
  })
  const ArtifactsPanel = fragment.ArtifactsPanel
  const props = {
    sessionId: SESSION_ID,
    useSessions: (select) => select({ byId: { [SESSION_ID]: { cwd: WORKSPACE } } }),
    useWorkspaces: () => [],
    t: (key) => key,
    embedded: true
  }
  let tree = null
  const render = () => { hooks.begin(); tree = ArtifactsPanel(props); return tree }
  const settle = async () => { for (let i = 0; i < 8; i += 1) await Promise.resolve() }
  // One "frame": run the effects the last render scheduled, let the promises
  // they started settle, then render again so the new state is visible.
  const flush = async () => {
    for (const fn of hooks.passiveEffects()) fn()
    await settle()
    render()
    for (const fn of hooks.passiveEffects()) fn()
    await settle()
    render()
    return tree
  }
  return {
    render,
    flush,
    requests,
    scans: () => requests.filter((r) => r.url === '/api/artifacts/scan'),
    probes: () => requests.filter((r) => r.url.startsWith('/api/artifacts/session-dir')),
    tree: () => tree,
    select: () => {
      const found = []
      const walk = (node) => {
        if (node === null || typeof node !== 'object') return
        if (node.type === 'select') found.push(node)
        const kids = node.props?.children
        for (const child of Array.isArray(kids) ? kids : kids === void 0 ? [] : [kids]) walk(child)
      }
      walk(tree)
      return found[0]
    }
  }
}

// ── 1. the folder exists: that is what the panel opens on ────────────────────
{
  const panel = setup({ exists: true })
  panel.render()
  await panel.flush()

  const probe = panel.probes()[0]
  assert.ok(probe, 'the panel must ask the host where this conversation writes')
  const query = new URL(`http://x${probe.url}`).searchParams
  assert.equal(query.get('sessionId'), SESSION_ID, 'the probe carries the session id')
  assert.equal(query.get('cwd'), WORKSPACE, 'the probe carries the workspace root the session reports')

  const scans = panel.scans()
  assert.ok(scans.length > 0, 'the panel must still scan')
  assert.equal(scans.at(-1).body.dir, SESSION_DIR, 'the scan must end up on this conversation\'s artifact folder')

  const select = panel.select()
  assert.equal(select.props.value, SESSION_DIR, 'the directory select shows the session folder')
  const sessionOption = select.props.children.find((option) => option?.props?.value === SESSION_DIR)
  assert.ok(sessionOption, 'the session folder is selectable')
  assert.equal(sessionOption.props.children, 'panel.sessionArtifacts')
  console.log('ok  the panel opens on this conversation\'s artifact folder')
}

// ── 2. no folder yet: fall back to the workspace root ────────────────────────
{
  const panel = setup({ exists: false })
  panel.render()
  await panel.flush()
  assert.equal(panel.scans().at(-1).body.dir, WORKSPACE, 'a session with no artifacts scans the workspace root')
  assert.equal(panel.select().props.value, WORKSPACE)
  assert.equal(
    panel.select().props.children.some((option) => option?.props?.value === SESSION_DIR),
    false,
    'a folder that does not exist is not offered (its scan would 404)',
  )
  console.log('ok  a conversation without artifacts still opens on the workspace root')
}

// ── 3. the probe is unavailable: the panel degrades instead of breaking ──────
{
  const panel = setup({ probeFails: true })
  panel.render()
  await panel.flush()
  assert.equal(panel.scans().at(-1).body.dir, WORKSPACE, 'a failing probe falls back to the workspace root')
  console.log('ok  a host without the session-dir route still gets a working panel')
}

// ── 4. a directory the user pinned wins, and nothing is probed ───────────────
{
  const panel = setup({ prefs: { dir: PINNED, groupBy: 'type', sortBy: 'mtime', sortDir: 'desc', auto: false } })
  panel.render()
  await panel.flush()
  assert.equal(panel.probes().length, 0, 'an explicit directory choice must not be second-guessed')
  assert.equal(panel.scans().at(-1).body.dir, PINNED, 'the pinned directory is what gets scanned')
  assert.equal(panel.select().props.value, PINNED)
  console.log('ok  an explicit directory choice is never overridden')
}

console.log('\n✅ artifacts session default OK — the panel opens on this conversation\'s folder, with honest fallbacks')
