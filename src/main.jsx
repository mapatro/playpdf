import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'
import { initAnalytics } from './services/analytics.js'
import { registerServiceWorker } from './services/pwa.js'

// Privacy-conscious, anonymous-only analytics. No-op until a real token
// is configured (see src/services/analytics.js).
initAnalytics()

// Install the service worker so the app loads offline and is
// installable as a PWA. No-op during `vite dev` (the plugin only
// emits the SW for production builds).
registerServiceWorker()

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
