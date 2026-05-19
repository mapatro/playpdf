import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'
import { initAnalytics } from './services/analytics.js'

// Privacy-conscious, anonymous-only analytics. No-op until a real token
// is configured (see src/services/analytics.js).
initAnalytics()

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
