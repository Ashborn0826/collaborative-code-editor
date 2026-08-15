import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import './index.css'

// StrictMode disabled: in dev mode it double-mounts components, which
// tears down and recreates the WebSocketProvider rapidly and causes
// "WebSocket closed before connection established" errors.
ReactDOM.createRoot(document.getElementById('root')!).render(
  <BrowserRouter>
    <App />
  </BrowserRouter>
)
