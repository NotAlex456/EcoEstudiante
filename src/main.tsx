import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { applyAccessibility } from './lib/settings'
import { registerServiceWorker } from './pwa'
import './index.css'
import './app.css'

applyAccessibility()
registerServiceWorker()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
