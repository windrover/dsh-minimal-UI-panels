#!/usr/bin/env node
/**
 * Behaviour test: the artifacts panel must come back from a preview to the
 * scroll offset it left, not to the top of a long directory.
 *
 * The report: opening a file (.md, an image) swaps the list for the preview
 * view, and pressing "返回列表" lands at the top again. The cause is
 * structural — the list and the preview are two different `dap-body`
 * containers, so switching unmounts the list's scroll box and the browser
 * drops its offset. The panel component itself never unmounts, which is why
 * every other piece of list state survived.
 *
 * This renders the real component with a minimal hook runtime (the panel uses
 * only useState / useEffect / useRef), drives an actual preview round trip
 * through its own state, and asserts the offset comes back. It also pins the
 * properties that make the fix correct rather than accidental:
 *
 *   - the restore runs in a LAYOUT effect, so it settles before the browser
 *     paints (a passive effect would flash the top and then jump);
 *   - a different directory drops the remembered offset instead of carrying it
 *     into a listing it never belonged to.
 *
 * To keep the assertions non-trivial, a fresh scroll box is seeded with a
 * sentinel offset (999) before the layout effects run: whatever ends up in it
 * was therefore written by an effect, and the value says which one.
 *
 * Run: node test/artifacts-scroll.test.mjs
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'
import assert from 'node:assert/strict'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

// ---- load the SOURCE fragment ---------------------------------------------
// It still exports its panel (`exports.ArtifactsPanel = ...`); the merge strips
// that line from the bundle, so the source is the addressable copy.
let registration = null
vm.runInNewContext(
  readFileSync(join(ROOT, 'src', 'artifacts', 'client.js'), 'utf8'),
  {
    window: { __ModuleLoader__: { load: (reg) => { registration = reg } } },
    console,
    AbortController,
    // The preview fetch must stay pending: resolving it would run more of the
    // panel than this test is about, and there is no server behind it here.
    fetch: () => new Promise(() => {}),
    setTimeout,
    clearTimeout,
  },
  { filename: 'src/artifacts/client.js' },
)

// ---- a minimal hook runtime -----------------------------------------------
/**
 * Per-hook slots plus dependency-aware effect collection.
 *
 * Refs are re-attached on every render, which models the pessimistic case the
 * bug is about: a scroll container that was just (re)mounted, starting at 0.
 * Layout effects are kept apart from passive ones so the test can run them in
 * React's order and tell the two apart.
 * @returns the hook set plus its bookkeeping.
 */
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
  const elements = (type, p, kids) => (kids === void 0
    ? { type, props: { ...(p ?? {}) } }
    : { type, props: { ...(p ?? {}), children: kids } })

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
    layoutEffects: () => layout,
    passiveEffects: () => passive,
    slotCount: () => slots.length,
    slot: (i) => slots[i],
    setSlot: (i, value) => { slots[i] = value },
  }
}

/** Children of an element, always as an array. */
function childrenOf(node) {
  const kids = node?.props?.children
  if (kids === void 0 || kids === null) return []
  return Array.isArray(kids) ? kids : [kids]
}
/** Every element in the tree satisfying a predicate. */
function findAll(node, predicate, out = []) {
  if (node === null || typeof node !== 'object') return out
  if (predicate(node)) out.push(node)
  for (const child of childrenOf(node)) findAll(child, predicate, out)
  return out
}
/** Attach a fresh fake DOM node to every ref, the way a remount would. */
function attachRefs(node) {
  if (node === null || typeof node !== 'object') return
  const ref = node.props?.ref
  if (ref !== void 0 && ref !== null && typeof ref === 'object') ref.current = { scrollTop: 0 }
  for (const child of childrenOf(node)) attachRefs(child)
}

// ---- wire the fragment up --------------------------------------------------
const hooks = createHooks()
const fragment = registration.factory((spec) => {
  if (spec === 'react') return hooks.react
  if (spec === 'react/jsx-runtime') return hooks.jsxRuntime
  throw new Error(`unexpected require(${JSON.stringify(spec)})`)
})
const ArtifactsPanel = fragment.ArtifactsPanel
assert.equal(typeof ArtifactsPanel, 'function', 'the fragment must export its panel for testing')

const PROPS = {
  sessionId: void 0,
  useSessions: () => void 0,
  useWorkspaces: () => [],
  t: (key) => key,
  embedded: true,
}

let tree = null
const render = () => { hooks.begin(); tree = ArtifactsPanel(PROPS); attachRefs(tree); return tree }
const runLayout = () => { for (const fn of hooks.layoutEffects()) fn() }
const runPassive = () => { for (const fn of hooks.passiveEffects()) fn() }
// Both views render a `dap-body`; only the list's records its offset, so that
// is what tells them apart.
const bodies = () => findAll(tree, (el) => el.props?.className === 'dap-body')
const listBody = () => bodies().find((el) => typeof el.props?.onScroll === 'function')
/** The list's scroll box with a sentinel seeded, so an effect must overwrite it. */
const seeded = (value) => {
  const body = listBody()
  body.props.ref.current.scrollTop = value
  return body.props.ref.current
}

// ---- 1. the list wires its offset up ---------------------------------------
// This render alone catches a temporal-dead-zone mistake in an effect's
// dependency array — a syntax check cannot see one, and neither can the precheck.
render()
runLayout()
runPassive()
assert.ok(listBody(), 'the list view must render a scroll body that records its offset')
const firstBody = listBody()
assert.equal(typeof firstBody.props.onScroll, 'function', 'the list body must record its scroll offset')
assert.ok(firstBody.props.ref, 'the list body must expose a ref so the offset can be re-applied')

// ---- 2. find the panel's own state slots, without hard-coding indexes ------
/** Find the slot whose set-to-value makes the panel render a probe. */
function findSlot(probeValue, matches) {
  for (let i = 0; i < hooks.slotCount(); i += 1) {
    const saved = hooks.slot(i)
    try {
      hooks.setSlot(i, probeValue)
      render()
      if (matches(tree)) { hooks.setSlot(i, saved); return i }
    } catch { /* this slot rejects the probe: not the one we want */ }
    hooks.setSlot(i, saved)
    render()
  }
  return -1
}
const SENTINEL_FILE = { path: '/tmp/readme.md', name: 'readme.md' }
const previewSlot = findSlot(SENTINEL_FILE, (t) => findAll(t, (el) => el.props?.title === 'panel.back').length > 0)
assert.ok(previewSlot >= 0, 'could not find the preview state slot')
assert.equal(hooks.slot(previewSlot), null, 'the preview state must start at null')

const DIR_PROBE = '/tmp/probe-dir'
const dirSlot = findSlot(DIR_PROBE, (t) => findAll(t, (el) => el.type === 'select' && el.props?.value === DIR_PROBE).length > 0)
assert.ok(dirSlot >= 0, 'could not find the directory state slot')
assert.ok(dirSlot !== previewSlot, 'the directory and preview states must be different slots')

// Settle on the plain list view again.
render()
runLayout()
runPassive()

// ---- 3. a preview round trip restores the offset ---------------------------
const SCROLLED_TO = 137
const before = listBody()
before.props.ref.current.scrollTop = SCROLLED_TO
before.props.onScroll({ currentTarget: before.props.ref.current })

hooks.setSlot(previewSlot, SENTINEL_FILE)
render()
// The preview fetch effect (passive) must not be what restores anything.
runPassive()
assert.equal(listBody(), void 0, 'the preview view must replace the list body')

hooks.setSlot(previewSlot, null)
render()
assert.ok(listBody(), 'returning from the preview must render the list body again')
const restored = seeded(999)
runLayout()
assert.equal(
  restored.scrollTop,
  SCROLLED_TO,
  'returning from a preview must restore the list offset in a LAYOUT effect (before paint)',
)

// ---- 4. a different directory drops the remembered offset ------------------
hooks.setSlot(dirSlot, DIR_PROBE)
render()
const afterDirChange = seeded(999)
runLayout()
assert.equal(afterDirChange.scrollTop, 0, 'a new directory must start at the top')

// ...and the stale offset must not come back on the next preview round trip.
hooks.setSlot(previewSlot, SENTINEL_FILE)
render()
hooks.setSlot(previewSlot, null)
render()
const afterReset = seeded(999)
runLayout()
assert.equal(afterReset.scrollTop, 0, 'a directory change must have dropped the remembered offset')

console.log(`✅ artifacts scroll OK — offset ${SCROLLED_TO} survives a preview round trip, and is dropped on a directory change`)
