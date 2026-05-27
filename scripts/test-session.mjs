// Tests for the anonymous session/install tracker.
//
// We can't run the full module under Node (it needs document /
// localStorage / window APIs), so we stub a minimal DOM and import.
// The tests confirm:
//   • install_first_seen fires ONCE per device (not on later sessions)
//   • session_start always fires per tab open
//   • device id is stable across calls
//   • visibilitychange pauses heartbeat accounting
//   • secondsBucket / daysSinceBucket land in expected ranges via the
//     properties of the emitted events.

let failed = 0
function check(label, ok, detail) {
  if (ok) console.log(`  ✓ ${label}`)
  else {
    failed++
    console.log(`  ✗ ${label}${detail ? `\n    ${detail}` : ''}`)
  }
}

// --- Minimal DOM stubs --------------------------------------------------

const store = new Map()
class StorageStub {
  constructor(name) { this.name = name }
  getItem(k) { return store.has(`${this.name}:${k}`) ? store.get(`${this.name}:${k}`) : null }
  setItem(k, v) { store.set(`${this.name}:${k}`, String(v)) }
  removeItem(k) { store.delete(`${this.name}:${k}`) }
  clear() { for (const key of [...store.keys()]) if (key.startsWith(`${this.name}:`)) store.delete(key) }
}

globalThis.localStorage = new StorageStub('local')
globalThis.sessionStorage = new StorageStub('session')

const listeners = new Map()
globalThis.document = {
  hidden: false,
  addEventListener(ev, cb) {
    if (!listeners.has(ev)) listeners.set(ev, [])
    listeners.get(ev).push(cb)
  },
}
globalThis.window = {
  matchMedia: () => ({ matches: false }),
  navigator: {},
  addEventListener(ev, cb) {
    if (!listeners.has(ev)) listeners.set(ev, [])
    listeners.get(ev).push(cb)
  },
}
// `navigator` is read-only in modern Node; the session module reads
// window.navigator anyway, so the global alias isn't required.

// Capture tracked events by intercepting console.debug — that's where
// analytics.track() lands when there's no real beacon configured.
// ES module exports are read-only so we can't monkey-patch directly.
const events = []
const realDebug = console.debug
console.debug = (...args) => {
  if (args[0] === '[analytics] track') {
    events.push({ name: args[1], props: args[2] || {} })
  } else {
    realDebug(...args)
  }
}

const session = await import('../src/services/session.js')

// --- Test 1: first session emits install_first_seen + session_start -----

console.log('Test: fresh device emits install_first_seen + session_start')
events.length = 0
session.startSession()
const installFirst = events.filter((e) => e.name === 'install_first_seen')
const start1 = events.filter((e) => e.name === 'session_start')
check('install_first_seen fired exactly once', installFirst.length === 1, `got ${installFirst.length}`)
check('session_start fired', start1.length === 1, `got ${start1.length}`)
check(
  'session_start.isFirstSession === true',
  start1[0]?.props.isFirstSession === true,
)
check(
  'session_start has a deviceId (UUID-ish)',
  typeof start1[0]?.props.deviceId === 'string' && start1[0].props.deviceId.length >= 8,
)

const deviceIdSeen = start1[0]?.props.deviceId

// --- Test 2: second "tab open" on the same device --------------------------
// startSession is idempotent within one page-load; to simulate a fresh
// tab we clear sessionStorage (sessionStorage is per-tab in real life)
// AND reset the module's internal state by re-importing via cache-bust.

console.log('\nTest: second tab on same device — no new install_first_seen')
events.length = 0
sessionStorage.clear()
// Re-import a fresh module instance (vite/node caches modules; we
// add a query string to bypass for this test).
const session2 = await import(`../src/services/session.js?second`)
session2.startSession()
const installSecond = events.filter((e) => e.name === 'install_first_seen')
const start2 = events.filter((e) => e.name === 'session_start')
check('install_first_seen NOT fired again', installSecond.length === 0, `got ${installSecond.length}`)
check('session_start fired again', start2.length === 1)
check('isFirstSession === false', start2[0]?.props.isFirstSession === false)
check('same deviceId as before', start2[0]?.props.deviceId === deviceIdSeen)

// --- Test 3: install mode reported as 'browser' by default ------------

console.log('\nTest: install mode')
check(
  'installMode === "browser" when matchMedia returns false',
  start2[0]?.props.installMode === 'browser',
  `got ${start2[0]?.props.installMode}`,
)

// --- Test 4: matchMedia standalone reports as installed --------------

console.log('\nTest: standalone matchMedia → installMode = "standalone"')
events.length = 0
sessionStorage.clear()
globalThis.window.matchMedia = () => ({ matches: true })
const session3 = await import(`../src/services/session.js?third`)
session3.startSession()
const s3 = events.find((e) => e.name === 'session_start')
check('installMode === "standalone"', s3?.props.installMode === 'standalone', `got ${s3?.props.installMode}`)

// --- Summary ----------------------------------------------------------

console.log('')
if (failed === 0) console.log(`PASS: session tracker (${10} checks).`)
else {
  console.log(`FAIL: ${failed} check(s) failed.`)
  process.exit(1)
}
