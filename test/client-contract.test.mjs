#!/usr/bin/env node
/**
 * Contract test for the merged browser half.
 *
 * The precheck's stage 3 only proves the bundle loads and exports a callable
 * `apply`; it never runs `apply`. This test actually does, against a mock
 * client context, and pins the contract DSH 0.1.5's right Sidebar imposes plus
 * this bundle's own shape:
 *
 *   - the bundle id must equal the package name (`client-modules` asserts
 *     `factories.has(row.id)` after loading /plugins/<name>/client.js, so a
 *     case mismatch silently drops the whole browser half from the boot graph);
 *   - `exports.inject` must be short service ids;
 *   - one tab type per PAIRING (not per panel), each with a unique id/kind, a
 *     non-empty title thunk, and exactly one guide entry — a page type has no
 *     address, so the guide is its only way in;
 *   - each body registers at `sidebar.right.pane.tab` under that same id and
 *     renders BOTH of its panels with `embedded: true` (the composite draws the
 *     per-half title, so a panel must not add chrome of its own) and with the
 *     panel's own translator rather than the composite's;
 *   - the long-term-memory Settings card survives the regrouping.
 *
 * Run: node test/client-contract.test.mjs   (the precheck runs it with --tests)
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'
import assert from 'node:assert/strict'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const PKG_NAME = 'dsh-minimal-ui-panels'

// ---- a react stub that records createElement calls -------------------------
const react = {
  createElement: (type, props, ...children) => ({ type, props: props ?? {}, children }),
  // React calls a function initializer, so the stub must too: the composite's
  // remembered-split read hangs off one.
  useState: (value) => [typeof value === 'function' ? value() : value, () => {}],
  useEffect: () => {},
  useRef: (value) => ({ current: value }),
  useCallback: (fn) => fn,
  useMemo: (fn) => fn(),
  useSyncExternalStore: () => {},
  Fragment: Symbol('Fragment'),
}
const react_jsx_runtime = {
  jsx: react.createElement,
  jsxs: react.createElement,
  Fragment: react.Fragment,
}
const requireStub = (spec) => {
  if (spec === 'react') return react
  if (spec === 'react/jsx-runtime') return react_jsx_runtime
  throw new Error(`unexpected require(${JSON.stringify(spec)})`)
}

// ---- load the bundle exactly the way the browser loader does ---------------
let registration = null
vm.runInNewContext(
  readFileSync(join(ROOT, 'lib', 'client.js'), 'utf8'),
  { window: { __ModuleLoader__: { load: (reg) => { registration = reg } } }, console },
  { filename: 'lib/client.js' },
)

assert.ok(registration, 'the bundle must call window.__ModuleLoader__.load')
assert.equal(
  registration.id,
  PKG_NAME,
  'the bundle id must equal package.json name — client-modules looks the factory up by the resolved package name',
)

const bundle = registration.factory(requireStub)
assert.equal(typeof bundle.apply, 'function', 'exports.apply must be a function (a default export loses inject)')
// Copy out of the vm realm: arrays there have a different Array prototype, so
// deepStrictEqual on the raw value fails on the prototype even when equal.
assert.deepEqual(
  [...bundle.inject],
  ['slots', 'locale', 'sidebarRightTabs'],
  'exports.inject must be short service ids',
)

// ---- run apply(ctx) against a mock context --------------------------------
const tabTypes = []
const slotRegistrations = []
const injections = []
const dicts = {}

const localeService = {
  register: (ns, d) => { dicts[ns] = d },
  bind: (ns) => (key) => dicts[ns]?.zh?.[key] ?? key,
}
const ctx = {
  effect: (cb) => { const d = cb(); return typeof d === 'function' ? d : () => {} },
  get: (name) => (name === 'locale' ? localeService : undefined),
  locale: localeService,
  slots: {
    inject: (key, cb) => { injections.push({ key, cb }); return () => {} },
    register: (options, Component) => { slotRegistrations.push({ options, Component }); return () => {} },
  },
  sidebarRightTabs: {
    register: (definition) => { tabTypes.push(definition); return () => {} },
  },
}

bundle.apply(ctx)

// The real shell mounts both seats, so flush every injection.
for (const injection of injections) injection.cb()

// ---- the pairings ----------------------------------------------------------
const EXPECTED = [
  { kind: 'artifacts-terminal', id: `${PKG_NAME}/artifacts-terminal`, order: 10, halves: ['产物面板', '终端'] },
  { kind: 'memory-notes', id: `${PKG_NAME}/memory-notes`, order: 20, halves: ['长期记忆', '记事本'] },
]
assert.equal(tabTypes.length, EXPECTED.length, `expected ${EXPECTED.length} composite tab types, got ${tabTypes.length}`)
assert.equal(
  new Set(tabTypes.map((type) => type.kind)).size,
  tabTypes.length,
  'tab kind must be unique per pairing (a collision throws in sidebarRightTabs.register)',
)
assert.ok(
  !tabTypes.some((type) => ['artifacts', 'long-term-memory', 'terminal', 'notes'].includes(type.kind)),
  'the per-panel kinds must be gone: the pairings replaced them',
)

for (const expected of EXPECTED) {
  const type = tabTypes.find((candidate) => candidate.kind === expected.kind)
  assert.ok(type, `no tab type registered for kind "${expected.kind}"`)
  assert.equal(type.id, expected.id, `kind "${expected.kind}" must register under its own type id`)
  assert.equal(type.priority, 'extension', `type "${type.id}" must stay in the extension band`)
  assert.equal(typeof type.title, 'function', `type "${type.id}" needs a title thunk`)
  const title = type.title()
  assert.ok(typeof title === 'string' && title.length > 0, `type "${type.id}" title thunk must resolve to copy`)
  assert.ok(Array.isArray(type.guide) && type.guide.length === 1, `type "${type.id}" must contribute exactly one guide entry`)
  const [guide] = type.guide
  assert.equal(guide.order, expected.order, `type "${type.id}" guide order`)
  assert.equal(typeof guide.title, 'function')
  assert.equal(typeof guide.description, 'function')
  assert.ok(guide.title().length > 0, `type "${type.id}" guide title must resolve to copy`)
  assert.ok(guide.description().length > 0, `type "${type.id}" guide description must resolve to copy`)
}

// ---- the bodies ------------------------------------------------------------
const bodies = slotRegistrations.filter((r) => r.options.name === 'sidebar.right.pane.tab')
assert.equal(
  injections.filter((i) => i.key === 'sidebar.right.pane.tab').length,
  EXPECTED.length,
  'every pairing must wait on the sidebar.right.pane.tab seat',
)
assert.equal(bodies.length, EXPECTED.length, `expected ${EXPECTED.length} tab bodies`)
for (const expected of EXPECTED) {
  const body = bodies.find((r) => r.options.key === expected.id)
  assert.ok(body, `no body registered for tab type "${expected.id}"`)
  assert.equal(typeof body.Component, 'function', `body "${expected.id}" must be a component`)
  assert.ok(body.options.locale, `body "${expected.id}" must declare its locale namespace`)
}

// The memory panel still ships its Settings → Plugins card.
assert.ok(
  slotRegistrations.some((r) => r.options.name === 'settings.plugin.item'),
  'the long-term-memory settings card must survive the regrouping',
)

// ---- the body wrapper: two embedded halves, each with its own translator ---
/** Collect every string child in a rendered element tree. */
function collectText(node, out = []) {
  if (typeof node === 'string') { out.push(node); return out }
  if (node === null || typeof node !== 'object') return out
  for (const child of node.children ?? []) collectText(child, out)
  return out
}
/** Collect every element whose type is a component rather than a host tag. */
function collectComponents(node, out = []) {
  if (node === null || typeof node !== 'object') return out
  if (typeof node.type === 'function') out.push(node)
  for (const child of node.children ?? []) collectComponents(child, out)
  return out
}
/** Does the tree contain an element carrying this role? */
function hasRole(node, role) {
  if (node === null || typeof node !== 'object') return false
  if (node.props?.role === role) return true
  return (node.children ?? []).some((child) => hasRole(child, role))
}

for (const expected of EXPECTED) {
  const body = bodies.find((r) => r.options.key === expected.id)
  const element = body.Component({
    useTabInfo: () => ({ tab: { id: 'tab-1', actions: { close: () => {} } } }),
    sessionId: 'session-1',
    useSessions: () => {},
    useWorkspaces: () => {},
    t: (key) => `composite:${key}`,
  })
  assert.ok(element && element.props, `body "${expected.id}" must render`)

  const text = collectText(element)
  for (const half of expected.halves) {
    assert.ok(
      text.includes(half),
      `body "${expected.id}" must draw the title of its "${half}" half (saw: ${JSON.stringify(text)})`,
    )
  }

  const components = collectComponents(element)
  assert.equal(components.length, 2, `body "${expected.id}" must seat exactly two panels, got ${components.length}`)
  for (const panel of components) {
    assert.equal(panel.props.embedded, true, `body "${expected.id}": a panel must be embedded (the composite draws the title)`)
    assert.equal(panel.props.sessionId, 'session-1', `body "${expected.id}": the session id must reach the panel`)
    assert.equal(panel.props.closeDetails, undefined, `body "${expected.id}": no closeDetails — the strip owns the ✕`)
    assert.equal(typeof panel.props.t, 'function', `body "${expected.id}": the panel needs its own translator`)
  }
  assert.equal(
    new Set(components.map((panel) => panel.props.t)).size,
    2,
    `body "${expected.id}": the two halves must use their own translators, not the composite's`,
  )

  assert.ok(hasRole(element, 'separator'), `body "${expected.id}" must render a draggable divider`)
}

console.log(`✅ client contract OK — ${tabTypes.length} composite tab types: ${EXPECTED.map((t) => t.kind).join(', ')}`)
