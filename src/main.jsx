import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'
import { initAnalytics } from './services/analytics.js'
import { startSession } from './services/session.js'
import { registerServiceWorker } from './services/pwa.js'

// Privacy-conscious, anonymous-only analytics. No-op until a real token
// is configured (see src/services/analytics.js).
initAnalytics()

// Anonymous session + install tracking — answers "are people coming
// back" and "how long do they use it" without identifying anyone.
// Emits install_first_seen / session_start / session_heartbeat /
// session_end through the same track() seam. See src/services/session.js.
startSession()

// Install the service worker so the app loads offline and is
// installable as a PWA. No-op during `vite dev` (the plugin only
// emits the SW for production builds).
registerServiceWorker()

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
