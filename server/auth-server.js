// Auth + Rooms server — handles auth, room creation, and room access
// Separate from y-websocket server to keep concerns isolated

import express from 'express'
import jwt from 'jsonwebtoken'
import bcrypt from 'bcryptjs'
import crypto from 'crypto'
import { readFileSync, writeFileSync, existsSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const USERS_FILE = join(__dirname, 'users.json')
const ROOMS_FILE = join(__dirname, 'rooms.json')

const app = express()
app.use(express.json())

// ─── User store ──────────────────────────────────────────────────────────────
function loadUsers() {
  try {
    return JSON.parse(readFileSync(USERS_FILE, 'utf8'))
  } catch {
    return {}
  }
}

function saveUsers(users) {
  writeFileSync(USERS_FILE, JSON.stringify(users, null, 2))
}

// ─── Room store ─────────────────────────────────────────────────────────────
// Format: { [roomId]: { owner: username, createdAt: ISO string } }
function loadRooms() {
  if (!existsSync(ROOMS_FILE)) return {}
  try {
    return JSON.parse(readFileSync(ROOMS_FILE, 'utf8'))
  } catch {
    return {}
  }
}

function saveRooms(rooms) {
  writeFileSync(ROOMS_FILE, JSON.stringify(rooms, null, 2))
}

// ─── Auth middleware ───────────────────────────────────────────────────────
// Verifies JWT and attaches { username } to req for all /rooms/* routes
function requireAuth(req, res, next) {
  const auth = req.headers.authorization
  if (!auth || !auth.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'no token provided' })
  }
  try {
    const payload = jwt.verify(auth.slice(7), JWT_SECRET)
    req.username = payload.username
    next()
  } catch {
    res.status(401).json({ error: 'invalid or expired token' })
  }
}

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-in-production'
const PORT = process.env.AUTH_PORT || 3001

// ─── POST /auth/signup ──────────────────────────────────────────────────────
app.post('/auth/signup', async (req, res) => {
  const { username, password } = req.body

  if (!username || !password) {
    return res.status(400).json({ error: 'username and password required' })
  }

  if (username.length < 3 || username.length > 30) {
    return res.status(400).json({ error: 'username must be 3-30 characters' })
  }

  if (password.length < 6) {
    return res.status(400).json({ error: 'password must be at least 6 characters' })
  }

  const users = loadUsers()

  if (users[username]) {
    return res.status(409).json({ error: 'username already taken' })
  }

  const passwordHash = await bcrypt.hash(password, 10)
  users[username] = { passwordHash, createdAt: new Date().toISOString() }
  saveUsers(users)

  const token = jwt.sign({ username }, JWT_SECRET, { expiresIn: '24h' })
  res.json({ token })
})

// ─── POST /auth/login ───────────────────────────────────────────────────────
app.post('/auth/login', async (req, res) => {
  const { username, password } = req.body

  if (!username || !password) {
    return res.status(400).json({ error: 'username and password required' })
  }

  const users = loadUsers()
  const user = users[username]

  if (!user) {
    return res.status(401).json({ error: 'invalid credentials' })
  }

  const valid = await bcrypt.compare(password, user.passwordHash)
  if (!valid) {
    return res.status(401).json({ error: 'invalid credentials' })
  }

  const token = jwt.sign({ username }, JWT_SECRET, { expiresIn: '24h' })
  res.json({ token })
})

// ─── GET /auth/verify ───────────────────────────────────────────────────────
// Used by the frontend to check if a stored token is still valid
app.get('/auth/verify', (req, res) => {
  const auth = req.headers.authorization
  if (!auth || !auth.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'no token provided' })
  }

  const token = auth.slice(7)
  try {
    const payload = jwt.verify(token, JWT_SECRET)
    res.json({ username: payload.username })
  } catch {
    res.status(401).json({ error: 'invalid or expired token' })
  }
})

// ─── POST /rooms — create a new room ───────────────────────────────────────
app.post('/rooms', requireAuth, (req, res) => {
  const roomId = crypto.randomUUID()        // 122 bits of randomness — no collision risk
  const rooms = loadRooms()
  rooms[roomId] = { owner: req.username, createdAt: new Date().toISOString() }
  saveRooms(rooms)
  res.json({ roomId })
})

// ─── GET /rooms/:roomId — get room info or 404 ─────────────────────────────
app.get('/rooms/:roomId', (req, res) => {
  const rooms = loadRooms()
  const room = rooms[req.params.roomId]
  if (!room) return res.status(404).json({ error: 'room not found' })
  res.json({ roomId: req.params.roomId, ...room })
})

app.listen(PORT, () => {
  console.log(`auth server running on http://localhost:${PORT}`)
  console.log(`  POST /auth/signup  — create account, returns { token }`)
  console.log(`  POST /auth/login   — login, returns { token }`)
  console.log(`  GET  /auth/verify  — verify token, returns { username }`)
  console.log(`  POST /rooms        — create room (auth required), returns { roomId }`)
  console.log(`  GET  /rooms/:id    — get room info, returns { roomId, owner, createdAt }`)
})
