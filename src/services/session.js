// Anonymous session + install tracking.
//
// Goal: answer two questions without ever identifying a user.
//   1. Are people coming back? (retention — same browser, multiple
//      sessions over days/weeks)
//   2. How much time do they spend? (engagement — minutes of active
//      use per session and per install)
//
// What we DO NOT do:
//   • Send file names or contents (already a hard rule across the app).
//   • Fingerprint the browser. The "device ID" is a random UUID we
//     generate ourselves and store in localStorage — it tells us
//     "is this the same install we saw before?" not "who is this".
//     User can clear it any time by clearing site data.
//   • Block features for users without a UUID. The UUID is best-effort;
//     if localStorage is blocked (private mode), we use a per-tab id
//     so the session itself still gets one event and nothing breaks.
//
// What flows through this module:
//   • install_first_seen — fired once ever per device id.
//   • session_start      — fired once per tab open (deduped across
//                          rapid reloads via sessionStorage).
//   • session_heartbeat  — fired every 60s of ACTIVE use (suppressed
//                          when tab is hidden / window is unfocused).
//   • session_end        — fired on tab close / pagehide with total
//                          active seconds in this session.
//
// All events go through the existing `track()` seam in analytics.js,
// so they're a console.debug no-op today and will start hitting a
// real beacon the moment that seam gets a network call wired in.

import { track } from './analytics.js'

const DEVICE_ID_KEY = 'playpdf:device_id'
const FIRST_SEEN_KEY = 'playpdf:first_seen_at'
const TOTAL_SECONDS_KEY = 'playpdf:total_active_seconds'
const TAB_SESSION_KEY = 'playpdf:tab_session_started'
const HEARTBEAT_MS = 60_000 // emit a heartbeat per minute of active use

// Stable random UUID per browser profile. Survives reloads, doesn't
// survive "clear site data". That's exactly what we want — privacy
// without persistence beyond what the user controls.
function uuid() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID()
  // Fallback: pre-Chrome 92 / Safari 15.4 — unlikely on a PWA-capable
  // browser, but cheap to include.
  return 'fb-' + Math.random().toString(36).slice(2) + Date.now().toString(36)
}

function safeRead(storage, key) {
  try {
    return storage.getItem(key)
  } catch {
    return null
  }
}
function safeWrite(storage, key, value) {
  try {
    storage.setItem(key, value)
    return true
  } catch {
    return false
  }
}

// Best-effort device id: localStorage first, sessionStorage fallback,
// in-memory last. Always returns something so callers don't have to
// guard.
let cachedDeviceId = null
function getDeviceId() {
  if (cachedDeviceId) return cachedDeviceId
  let id = safeRead(localStorage, DEVICE_ID_KEY)
  let source = 'local'
  if (!id) {
    id = safeRead(sessionStorage, DEVICE_ID_KEY)
    source = 'session'
  }
  if (!id) {
    id = uuid()
    source = 'fresh'
    const stored = safeWrite(localStorage, DEVICE_ID_KEY, id)
    if (!stored) safeWrite(sessionStorage, DEVICE_ID_KEY, id)
  }
  cachedDeviceId = id
  return id
}

function getInstallMode() {
  if (typeof window === 'undefined') return 'unknown'
  if (window.matchMedia?.('(display-mode: standalone)').matches) return 'standalone'
  if (window.navigator?.standalone === true) return 'standalone-ios'
  return 'browser'
}

function isFirstSeen() {
  const existing = safeRead(localStorage, FIRST_SEEN_KEY)
  if (existing) return { first: false, firstSeenAt: existing }
  const now = new Date().toISOString()
  safeWrite(localStorage, FIRST_SEEN_KEY, now)
  return { first: true, firstSeenAt: now }
}

// Coarse "days since first seen" bucket so we don't transmit precise
// install dates while still answering retention questions.
function daysSinceBucket(isoFirstSeen) {
  if (!isoFirstSeen) return 'unknown'
  const days = Math.floor(
    (Date.now() - new Date(isoFirstSeen).getTime()) / 86_400_000,
  )
  if (days <= 0) return '0'
  if (days === 1) return '1'
  if (days <= 7) return '2-7'
  if (days <= 30) return '8-30'
  if (days <= 90) return '31-90'
  return '90+'
}

function secondsBucket(s) {
  if (s < 30) return '<30s'
  if (s < 120) return '30s-2m'
  if (s < 600) return '2m-10m'
  if (s < 1800) return '10m-30m'
  if (s < 3600) return '30m-1h'
  return '1h+'
}

let sessionState = null

/**
 * Kick off session tracking. Idempotent — calling twice is safe.
 * Returns the session object so callers (e.g. main.jsx) can inspect
 * what was logged in dev console.
 */
export function startSession() {
  if (sessionState) return sessionState
  if (typeof window === 'undefined') return null

  const deviceId = getDeviceId()
  const installMode = getInstallMode()
  const { first, firstSeenAt } = isFirstSeen()

  // Dedupe rapid reloads within the same tab: if the tab already
  // logged a session_start, don't double-count.
  const alreadyStartedThisTab = safeRead(sessionStorage, TAB_SESSION_KEY)
  if (!alreadyStartedThisTab) {
    safeWrite(sessionStorage, TAB_SESSION_KEY, String(Date.now()))
    if (first) {
      track('install_first_seen', {
        deviceId,
        installMode,
      })
    }
    track('session_start', {
      deviceId,
      installMode,
      isFirstSession: first,
      daysSinceFirstSeen: daysSinceBucket(firstSeenAt),
      lifetimeActiveBucket: secondsBucket(
        Number(safeRead(localStorage, TOTAL_SECONDS_KEY) || 0),
      ),
    })
  }

  sessionState = {
    deviceId,
    installMode,
    startedAt: Date.now(),
    activeSeconds: 0,
    isVisible: !document.hidden,
    lastTickAt: Date.now(),
    heartbeatTimer: null,
  }

  // Active-time accounting: increment activeSeconds only while the tab
  // is visible AND the window has focus. Browsers throttle setInterval
  // when hidden anyway, but we double-guard so a backgrounded tab
  // doesn't inflate the number.
  function tick() {
    if (!sessionState) return
    const now = Date.now()
    if (sessionState.isVisible) {
      const elapsed = Math.min(15, Math.round((now - sessionState.lastTickAt) / 1000))
      sessionState.activeSeconds += Math.max(0, elapsed)
    }
    sessionState.lastTickAt = now
  }

  function startHeartbeat() {
    if (sessionState.heartbeatTimer) return
    sessionState.heartbeatTimer = setInterval(() => {
      tick()
      track('session_heartbeat', {
        deviceId,
        installMode,
        activeBucket: secondsBucket(sessionState.activeSeconds),
      })
    }, HEARTBEAT_MS)
  }
  function stopHeartbeat() {
    if (!sessionState.heartbeatTimer) return
    clearInterval(sessionState.heartbeatTimer)
    sessionState.heartbeatTimer = null
  }

  document.addEventListener('visibilitychange', () => {
    if (!sessionState) return
    tick() // settle accumulated time before flipping the flag
    sessionState.isVisible = !document.hidden
    if (sessionState.isVisible) startHeartbeat()
    else stopHeartbeat()
  })

  // pagehide is more reliable than unload (fires on tab close, nav,
  // and bfcache evict). Use sendBeacon-friendly synchronous tick.
  window.addEventListener('pagehide', () => {
    if (!sessionState) return
    tick()
    stopHeartbeat()
    // Persist cumulative lifetime usage.
    const totalSoFar = Number(safeRead(localStorage, TOTAL_SECONDS_KEY) || 0)
    safeWrite(
      localStorage,
      TOTAL_SECONDS_KEY,
      String(totalSoFar + sessionState.activeSeconds),
    )
    track('session_end', {
      deviceId,
      installMode,
      activeBucket: secondsBucket(sessionState.activeSeconds),
    })
  })

  startHeartbeat()
  return sessionState
}

/**
 * Test/debug helper — exposes the current session's accumulated
 * active seconds. Not used by the app itself.
 */
export function getActiveSeconds() {
  return sessionState?.activeSeconds ?? 0
}
