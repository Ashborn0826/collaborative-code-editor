// y-websocket server with JWT auth
// All WebSocket connections must include ?token=<jwt> — connections without a valid token are rejected

import { createServer } from 'http'
import { WebSocketServer } from 'ws'
import { setupWSConnection } from 'y-websocket/bin/utils'
import jwt from 'jsonwebtoken'
import { parse } from 'url'

const PORT = process.env.PORT || 1234
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-in-production'

// Create an HTTP server — the WebSocketServer needs it to receive upgrade events
const server = createServer()

const wss = new WebSocketServer({ noServer: true })

wss.on('connection', (ws, req) => {
  // Token already verified in the 'upgrade' handler
  setupWSConnection(ws, req)
})

wss.on('upgrade', (request, socket, head) => {
  const { token } = parse(request.url, true).query
  console.log('[upgrade] url:', request.url, '| token present:', !!token)

  if (!token) {
    console.log('[upgrade] REJECTED — no token')
    socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n')
    socket.destroy()
    return
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET)
    console.log('[upgrade] ACCEPTED — user:', payload.username)
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit('connection', ws, request)
    })
  } catch (err) {
    console.log('[upgrade] REJECTED — jwt error:', err.message)
    socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n')
    socket.destroy()
  }
})

// Attach upgrade handler to the HTTP server
server.on('upgrade', (request, socket, head) => {
  wss.emit('upgrade', request, socket, head)
})

server.listen(PORT, () => {
  console.log(`y-websocket server running on ws://localhost:${PORT}`)
  console.log(`Clients must connect with ?token=<jwt>`)
})
