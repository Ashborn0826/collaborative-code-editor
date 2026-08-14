// y-websocket server
// This relays Yjs document updates between connected clients.
// It doesn't understand the document content — just passes binary Yjs updates.

import { WebSocketServer } from 'ws'
import { setupWSConnection } from 'y-websocket/bin/utils'

const PORT = process.env.PORT || 1234

const wss = new WebSocketServer({ port: PORT })

wss.on('connection', (ws, req) => {
  // setupWSConnection handles room parsing from the URL path.
  // e.g. ws://localhost:1234/my-document-id → room "my-document-id"
  setupWSConnection(ws, req)
})

console.log(`y-websocket server running on ws://localhost:${PORT}`)
console.log(`Clients connect to: ws://localhost:${PORT}/{room-name}`)
