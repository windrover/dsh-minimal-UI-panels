#!/usr/bin/env node
/**
 * Contract test for the merged browser half.
 *
 * The precheck's stage 3 only proves the bundle loads and exports a callable
 * `apply`; it never runs `apply`. This test actually does, against a mock
 * client context, and pins the contract that DSH 0.1.5's right Sidebar
 * imposes on a tab type:
 *
 *   - the bundle id must equal the package name (`client-modules` asserts
 *     `factories.has(row.id)` after loading /plugins/<name>/client.js, so a
 *     case mismatch silently drops the whole browser half from the boot graph);
 *   - `exports.inject` must be short service ids;
 *   - every panel must register a tab type with a unique id/kind, a
 *     non-empty title thunk, and a guide entry (a page type has no address,
 *     so the guide is its only way in);
 *   - the body must register at `sidebar.right.pane.tab` under that same id,
 *     and the panel's own ✕ must close its tab rather than a removed column.
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
  useState: (value) => [value, () => {}],
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

// The real shell has both seats mounted, so flush every injection.
for (const injection of injections) injection.cb()

// ---- the four panel tab types ---------------------------------------------
const EXPECTED = [
  { kind: 'artifacts', id: `${PKG_NAME}/artifacts`, order: 10 },
  { kind: 'long-term-memory', id: `${PKG_NAME}/long-term-memory`, order: 20 },
  { kind: 'terminal', id: `${PKG_NAME}/terminal`, order: 30 },
  { kind: 'notes', id: `${PKG_NAME}/notes`, order: 40 },
]
assert.equal(tabTypes.length, EXPECTED.length, `expected ${EXPECTED.length} tab types, got ${tabTypes.length}`)
assert.equal(
  new Set(tabTypes.map((type) => type.id)).size,
  tabTypes.length,
  'tab type ids must be unique (sidebarRightTabs.register throws on a duplicate id)',
)
assert.equal(
  new Set(tabTypes.map((type) => type.kind)).size,
  tabTypes.length,
  'tab kinds must be unique',
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
  'every type must wait on the sidebar.right.pane.tab seat',
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
  'the long-term-memory settings card must still register',
)

// ---- the body wrapper: embedded chrome, and ✕ closes its own tab -----------
const artifactsBody = bodies.find((r) => r.options.key === `${PKG_NAME}/artifacts`)
let closed = 0
const element = artifactsBody.Component({
  useTabInfo: () => ({ tab: { id: 'tab-1', actions: { close: () => { closed += 1 } } } }),
  sessionId: 'session-1',
  useSessions: () => {},
  useWorkspaces: () => {},
  t: (key) => key,
})
assert.ok(element && element.props, 'the tab body must render its panel')
assert.equal(element.props.embedded, true, 'the panel must be embedded (the tab strip is the chrome)')
assert.equal(element.props.sessionId, 'session-1', 'the body must forward the session id to the panel')
assert.equal(typeof element.props.closeDetails, 'function', 'the panel keeps its own close control')
element.props.closeDetails()
assert.equal(closed, 1, 'the panel ✕ must close its own tab (the details column no longer exists)')

console.log(`✅ client contract OK — ${tabTypes.length} tab types: ${EXPECTED.map((t) => t.kind).join(', ')}`)
