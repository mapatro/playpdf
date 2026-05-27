// PWA registration + install prompt helper.
//
// vite-plugin-pwa generates the service worker and a virtual module
// `virtual:pwa-register` that we import to wire it up. The plugin's
// `registerType: 'autoUpdate'` means new deploys silently swap in
// without bothering the user — fine for a PDF editor.
//
// We expose a tiny event-emitter for the install prompt so the React
// header can show / hide its Install button at the right moments.

import { registerSW } from 'virtual:pwa-register'

let deferredPrompt = null
let installed = false
const subscribers = new Set()

function emit() {
  for (const cb of subscribers) {
    try {
      cb({ canInstall: !!deferredPrompt && !installed, installed })
    } catch (err) {
      console.warn('pwa subscriber threw:', err)
    }
  }
}

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    // Hold the event so we can fire it on user click. The browser
    // already prevents the auto-prompt; we'd rather show our own
    // button so it's discoverable.
    e.preventDefault()
    deferredPrompt = e
    emit()
  })
  window.addEventListener('appinstalled', () => {
    deferredPrompt = null
    installed = true
    emit()
  })
  // Treat standalone-launched windows as already installed (so the
  // header doesn't keep nagging once the user opened the app from
  // their Start menu / Dock).
  const standalone =
    window.matchMedia?.('(display-mode: standalone)').matches ||
    window.navigator.standalone === true
  if (standalone) installed = true
}

export function subscribeInstall(cb) {
  subscribers.add(cb)
  // Fire immediately with current state so consumers don't flash.
  cb({ canInstall: !!deferredPrompt && !installed, installed })
  return () => subscribers.delete(cb)
}

/**
 * Trigger the browser's native install prompt. Resolves when the user
 * has answered (accepted or dismissed). Safe to call without an
 * available prompt — it just no-ops.
 */
export async function promptInstall() {
  if (!deferredPrompt) return { outcome: 'unavailable' }
  const e = deferredPrompt
  deferredPrompt = null
  emit()
  try {
    await e.prompt()
    const choice = await e.userChoice
    if (choice.outcome === 'accepted') {
      installed = true
      emit()
    }
    return choice
  } catch (err) {
    console.warn('install prompt failed:', err)
    return { outcome: 'error', error: err }
  }
}

/**
 * Register the service worker. Called once from main.jsx. Returns the
 * updater callback (unused for autoUpdate mode but kept for future
 * use if we want a "Reload to update" toast).
 */
export function registerServiceWorker() {
  return registerSW({
    immediate: true,
    onRegisterError(err) {
      console.warn('PWA SW registration failed:', err)
    },
  })
}
