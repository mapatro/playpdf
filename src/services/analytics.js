// Privacy-first analytics abstraction.
//
// We use Cloudflare Web Analytics (cookieless, no personal data, no
// fingerprinting). This module is intentionally a thin seam so the
// implementation can be swapped later without touching feature code.
//
// IMPORTANT: We NEVER send file names, file contents, or anything that
// could identify a user. Only coarse, anonymous, bucketed counters.

// Cloudflare Web Analytics beacon token for pdf.patroventure.com.
// This is a public, client-exposed token by design (not a secret).
const CF_BEACON_TOKEN = '907fd415727248609669e4bd1a944511'

const isDev = import.meta.env.DEV
const isPlaceholderToken = CF_BEACON_TOKEN === 'REPLACE_ME'

/**
 * Inject the Cloudflare Web Analytics beacon.
 * No-op (with a dev log) while the token is still the placeholder or in dev.
 */
export function initAnalytics() {
  if (isPlaceholderToken) {
    if (isDev) {
      console.debug(
        '[analytics] beacon NOT injected: CF_BEACON_TOKEN is still the placeholder.',
      )
    }
    return
  }

  if (isDev) {
    console.debug('[analytics] dev mode: skipping beacon injection.')
    return
  }

  if (document.querySelector('script[data-cf-beacon]')) return

  const script = document.createElement('script')
  script.defer = true
  script.src = 'https://static.cloudflareinsights.com/beacon.min.js'
  script.setAttribute(
    'data-cf-beacon',
    JSON.stringify({ token: CF_BEACON_TOKEN }),
  )
  document.head.appendChild(script)
}

/**
 * Track an anonymous custom event.
 *
 * In dev (or with the placeholder token) this is a console.debug no-op.
 * The structure below is where a real custom-event call to a beacon or
 * privacy-respecting backend would be dropped in later.
 *
 * @param {string} eventName  e.g. 'merge'
 * @param {object} [props]    ONLY anonymous, bucketed values. Never file
 *                            names or contents.
 */
export function track(eventName, props = {}) {
  if (isDev || isPlaceholderToken) {
    console.debug('[analytics] track', eventName, props)
    return
  }

  // Real beacon custom-event integration goes here. Cloudflare Web
  // Analytics does not currently support arbitrary custom events on the
  // free tier; when a custom-event endpoint exists, send it like:
  //
  //   navigator.sendBeacon('/api/event', JSON.stringify({ eventName, props }))
  //
  // Kept as a structured seam on purpose.
}

/**
 * Bucket a byte count into a coarse range label so we never transmit
 * precise file sizes.
 * @param {number} bytes
 * @returns {string}
 */
export function bytesBucket(bytes) {
  const mb = bytes / (1024 * 1024)
  if (mb < 1) return '<1MB'
  if (mb < 5) return '1-5MB'
  if (mb < 20) return '5-20MB'
  if (mb < 50) return '20-50MB'
  return '50MB+'
}
