// y-websocket server with JWT auth and role-based permissions
// All WebSocket connections must include ?token=<jwt>
// Permissions (owner/editor/viewer) are enforced server-side on every edit

import { createServer } from 'http'
import { WebSocketServer } from 'ws'
import { setupWSConnection } from 'y-websocket/bin/utils'
import jwt from 'jsonwebtoken'
import { parse, resolve } from 'url'
import { existsSync, readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname } from 'path'
import { initPersistence } from './persistence.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

const PORT = process.env.PORT || 1234
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-in-production'

// Message type 0 = sync (edit), 1 = awareness
const messageSync = 0

// ─── Permission helpers ─────────────────────────────────────────────────────────

// Load rooms.json from the auth server's directory
function loadRooms() {
  const roomsFile = resolve(__dirname, '..', 'auth-server', 'rooms.json')
  if (!existsSync(roomsFile)) return {}
  try {
    return JSON.parse(readFileSync(roomsFile, 'utf8'))
  } catch {
    return {}
  }
}

function canEdit(doc, username) {
  if (!username || !doc.permissions) return false
  const role = doc.permissions[username]
  return role === 'owner' || role === 'editor'
}

// ─── HTTP server + WebSocket setup ────────────────────────────────────────────
const server = createServer()

const wss = new WebSocketServer({ noServer: true })

wss.on('connection', (ws, req) => {
  // setupWSConnection sets up doc, awareness, ping, sync — call it first
  setupWSConnection(ws, req)

  // Get the message listener that setupWSConnection just added
  const originalListener = ws.listeners('message')[ws.listeners('message').length - 1]

  const username = ws.username
  const doc = ws.doc

  if (username && doc) {
    // Load permissions from rooms.json (source of truth)
    const rooms = loadRooms()
    const roomMeta = rooms[doc.name]

    if (roomMeta?.permissions) {
      // Attach permissions from the room registry to the doc
      doc.permissions = { ...roomMeta.permissions }
    } else {
      // No permissions found — deny all edits until owner sets them
      doc.permissions = {}
    }

    // If user has no role in this room, deny access entirely
    if (!doc.permissions[username]) {
      console.log(`[permission] ACCESS DENIED — ${username} has no role in room ${doc.name}`)
      ws.close(4401, 'Access denied — not a member of this room')
      return
    }

    // Wrap message handler to drop edit messages from viewers
    ws.removeAllListeners('message')
    ws.on('message', (message) => {
      const isEditMessage = message instanceof ArrayBuffer && new Uint8Array(message)[0] === messageSync

      if (isEditMessage && !canEdit(doc, username)) {
        console.log(`[permission] EDIT DENIED — ${username} (${doc.permissions[username]}) tried to edit room ${doc.name}`)
        return // Drop silently
      }

      originalListener.call(ws, message)
    })
  }
})

wss.on('upgrade', (request, socket, head) => {
  const urlParsed = parse(request.url, true)
  const { token } = urlParsed.query

  if (!token) {
    socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n')
    socket.destroy()
    return
  }

  let username
  try {
    const payload = jwt.verify(token, JWT_SECRET)
    username = payload.username
  } catch {
    socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n')
    socket.destroy()
    return
  }

  wss.handleUpgrade(request, socket, head, (ws) => {
    ws.username = username
    wss.emit('connection', ws, request)
  })
})

server.on('upgrade', (request, socket, head) => {
  wss.emit('upgrade', request, socket, head)
})

server.listen(PORT, () => {
  initPersistence()
  console.log(`y-websocket server running on ws://localhost:${PORT}`)
  console.log(`Clients must connect with ?token=<jwt>`)
})
