// Persistence layer: snapshot Yjs document state to local filesystem
// Works out of the box — no external database required
// Snapshots stored as binary files in ./snapshots/ directory

import { setPersistence } from 'y-websocket/bin/utils'
import * as Y from 'yjs'
import { mkdirSync, existsSync, readFileSync, writeFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const SNAPSHOT_DIR = join(__dirname, 'snapshots')

// ─── Ensure snapshot directory exists ─────────────────────────────────────────
function ensureDir() {
  if (!existsSync(SNAPSHOT_DIR)) {
    mkdirSync(SNAPSHOT_DIR, { recursive: true })
  }
}

function snapshotPath(roomName) {
  return join(SNAPSHOT_DIR, `${roomName}.yjs`)
}

// ─── Load: read the binary snapshot and apply it to the ydoc ─────────────────
// Called by y-websocket when the first client connects to a room
async function loadSnapshot(roomName, ydoc) {
  const path = snapshotPath(roomName)
  if (!existsSync(path)) return
  try {
    const buf = readFileSync(path)
    Y.applyUpdate(ydoc, new Uint8Array(buf))
    console.log(`[persistence] restored snapshot for room ${roomName}`)
  } catch (err) {
    console.error(`[persistence] restore failed for ${roomName}:`, err.message)
  }
}

// ─── Save: serialize the current ydoc state and write to disk ─────────────────
// Called by y-websocket every ~30s (periodic) and when last client disconnects
async function saveSnapshot(roomName, ydoc) {
  ensureDir()
  const path = snapshotPath(roomName)
  try {
    const state = Y.encodeStateAsUpdate(ydoc)
    writeFileSync(path, Buffer.from(state))
    console.log(`[persistence] saved snapshot for room ${roomName}`)
  } catch (err) {
    console.error(`[persistence] snapshot failed for ${roomName}:`, err.message)
  }
}

// ─── Register with y-websocket ───────────────────────────────────────────────
// bindState: fires when first client connects to a room (loads last snapshot)
// writeState: fires every ~30s (periodic saves) and when last client disconnects
export function initPersistence() {
  ensureDir()
  console.log(`[persistence] snapshots directory: ${SNAPSHOT_DIR}`)

  setPersistence({
    bindState: async (roomName, ydoc) => {
      await loadSnapshot(roomName, ydoc)
    },
    writeState: async (roomName, ydoc) => {
      await saveSnapshot(roomName, ydoc)
    },
  })

  console.log('[persistence] registered with y-websocket')
}
