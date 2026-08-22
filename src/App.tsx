import { useEffect, useRef, useState } from 'react'
import { Routes, Route, useNavigate, useParams } from 'react-router-dom'
import Editor, { OnMount } from '@monaco-editor/react'
import * as Y from 'yjs'
import { WebsocketProvider } from 'y-websocket'
import { MonacoBinding } from 'y-monaco'

const AUTH_API = '/auth'
const ROOMS_API = '/rooms'

// ─── Auth Screen (signup/login) ─────────────────────────────────────────────
function AuthScreen({ onAuth }: { onAuth: (token: string, username: string) => void }) {
  const [mode, setMode] = useState<'login' | 'signup'>('signup')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const res = await fetch(`${AUTH_API}/${mode}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'request failed')
        return
      }
      sessionStorage.setItem('auth-token', data.token)
      sessionStorage.setItem('auth-username', username)
      onAuth(data.token, username)
    } catch {
      setError('network error — is the auth server running on port 3001?')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={styles.centerScreen}>
      <div style={styles.authBox}>
        <h2 style={styles.title}>Collab Code Editor</h2>
        <p style={{ color: '#6e7681', margin: 0, fontSize: '13px' }}>
          Sign up to create and join rooms
        </p>

        <div style={{ display: 'flex', gap: '8px', marginTop: '20px' }}>
          <button onClick={() => setMode('signup')} style={tabStyle(mode === 'signup')}>Sign up</button>
          <button onClick={() => setMode('login')} style={tabStyle(mode === 'login')}>Log in</button>
        </div>

        <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <input value={username} onChange={e => setUsername(e.target.value)}
            placeholder="username" autoComplete="username" style={inputStyle} />
          <input type="password" value={password} onChange={e => setPassword(e.target.value)}
            placeholder="password" autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} style={inputStyle} />
          {error && <p style={{ color: '#f85149', fontSize: '13px', margin: 0 }}>{error}</p>}
          <button type="submit" disabled={loading} style={{ ...btnStyle, opacity: loading ? 0.6 : 1 }}>
            {loading ? '...' : mode === 'signup' ? 'Create account' : 'Log in'}
          </button>
        </form>
      </div>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  centerScreen: {
    height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: '#1e1e1e', flexDirection: 'column', gap: '24px',
  },
  authBox: {
    background: '#252526', border: '1px solid #3c3c3c', borderRadius: '8px',
    padding: '40px', width: '340px', display: 'flex', flexDirection: 'column', gap: '20px',
  },
  title: { color: '#e0e0e0', margin: 0, fontSize: '20px', fontWeight: 600 },
}

function tabStyle(active: boolean): React.CSSProperties {
  return {
    flex: 1, padding: '8px', borderRadius: '6px', border: 'none',
    background: active ? '#3c3c3c' : 'transparent',
    color: active ? '#e0e0e0' : '#6e7681', cursor: 'pointer', fontSize: '14px', fontWeight: 500,
  }
}

const inputStyle: React.CSSProperties = {
  padding: '10px 12px', borderRadius: '6px', border: '1px solid #3c3c3c',
  background: '#1e1e1e', color: '#e0e0e0', fontSize: '14px', outline: 'none', width: '100%',
}

const roleBadgeBg = (role: string) => {
  if (role === 'owner') return '#f0883e'
  if (role === 'editor') return '#2ea043'
  return '#6e7681'
}

const btnStyle: React.CSSProperties = {
  padding: '10px', borderRadius: '6px', border: 'none',
  background: '#2ea043', color: '#fff', fontSize: '14px', fontWeight: 600, cursor: 'pointer',
}

// ─── Home Screen ─────────────────────────────────────────────────────────────
function HomeScreen({ token }: { token: string }) {
  const [joinId, setJoinId] = useState(() => new URLSearchParams(window.location.search).get('join') || '')
  const [error, setError] = useState('')
  const [creating, setCreating] = useState(false)
  const [recentRooms, setRecentRooms] = useState<{ id: string; label: string }[]>([])
  const navigate = useNavigate()

  // Load recent rooms from localStorage on mount
  useEffect(() => {
    try {
      const stored = JSON.parse(localStorage.getItem('recent-rooms') || '[]')
      setRecentRooms(stored)
    } catch { setRecentRooms([]) }
  }, [])

  // Save a room to recent list when navigating to it
  const saveRecentRoom = (roomId: string) => {
    try {
      const stored = JSON.parse(localStorage.getItem('recent-rooms') || '[]') as { id: string; label: string; at: number }[]
      const filtered = stored.filter(r => r.id !== roomId)
      const updated = [{ id: roomId, label: roomId.slice(0, 8), at: Date.now() }, ...filtered].slice(0, 5)
      localStorage.setItem('recent-rooms', JSON.stringify(updated))
    } catch { /* ignore */ }
  }

  const createRoom = async () => {
    setCreating(true)
    setError('')
    try {
      const res = await fetch(ROOMS_API, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'failed'); return }
      saveRecentRoom(data.roomId)
      navigate(`/room/${data.roomId}`)
    } catch { setError('network error') }
    finally { setCreating(false) }
  }

  const joinRoom = async (id?: string) => {
    const roomId = (id || joinId).trim()
    if (!roomId) return
    setError('')
    try {
      const res = await fetch(`${ROOMS_API}/${roomId}`)
      if (!res.ok) { setError('room not found'); return }
      saveRecentRoom(roomId)
      navigate(`/room/${roomId}`)
    } catch { setError('network error') }
  }

  return (
    <div style={styles.centerScreen}>
      <div style={{ ...styles.authBox, width: '440px' }}>
        <div style={{ textAlign: 'center', marginBottom: '8px' }}>
          <h2 style={styles.title}>Collab Code Editor</h2>
          <p style={{ color: '#6e7681', fontSize: '13px', margin: '4px 0 0' }}>
            Real-time collaborative code editing
          </p>
        </div>

        <button onClick={createRoom} disabled={creating} style={{ ...btnStyle, opacity: creating ? 0.6 : 1, width: '100%' }}>
          {creating ? 'Creating...' : '+ Create new room'}
        </button>

        <div style={{ borderTop: '1px solid #3c3c3c', paddingTop: '20px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <p style={{ color: '#6e7681', fontSize: '13px', margin: 0 }}>Join an existing room:</p>
          <div style={{ display: 'flex', gap: '8px' }}>
            <input
              value={joinId}
              onChange={e => setJoinId(e.target.value)}
              placeholder="paste room ID"
              style={{ ...inputStyle, flex: 1 }}
              onKeyDown={e => e.key === 'Enter' && joinRoom()}
            />
            <button onClick={() => joinRoom()} style={{ ...btnStyle, background: '#3c3c3c', whiteSpace: 'nowrap' }}>
              Join
            </button>
          </div>
          {error && <p style={{ color: '#f85149', fontSize: '13px', margin: 0 }}>{error}</p>}
        </div>

        {recentRooms.length > 0 && (
          <div style={{ borderTop: '1px solid #3c3c3c', paddingTop: '16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <p style={{ color: '#6e7681', fontSize: '12px', margin: 0 }}>Recent rooms</p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
              {recentRooms.map(room => (
                <button
                  key={room.id}
                  onClick={() => joinRoom(room.id)}
                  style={{
                    background: '#1e1e1e', border: '1px solid #3c3c3c', borderRadius: '6px',
                    color: '#9cdcfe', fontSize: '12px', padding: '4px 10px', cursor: 'pointer',
                  }}
                >
                  {room.label}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Identity: color is random per-session, name is the auth username ──
// Now that auth exists, the auth username IS the user's identity.
// We only generate a random color (for cursor labels) — the name comes from auth.
function newIdentity() {
  const color = '#' + Math.floor(Math.random() * 0xffffff).toString(16).padStart(6, '0')
  return { color }
}

// ─── Language options for the editor ─────────────────────────────────────────
const LANGUAGES = [
  { value: 'javascript', label: 'JavaScript' },
  { value: 'typescript', label: 'TypeScript' },
  { value: 'python', label: 'Python' },
  { value: 'go', label: 'Go' },
  { value: 'rust', label: 'Rust' },
  { value: 'cpp', label: 'C++' },
  { value: 'java', label: 'Java' },
  { value: 'csharp', label: 'C#' },
  { value: 'html', label: 'HTML' },
  { value: 'css', label: 'CSS' },
  { value: 'json', label: 'JSON' },
  { value: 'markdown', label: 'Markdown' },
  { value: 'sql', label: 'SQL' },
  { value: 'shell', label: 'Shell' },
  { value: 'yaml', label: 'YAML' },
]

// ─── Editor View ──────────────────────────────────────────────────────────────
function EditorView({ token }: { token: string }) {
  const { roomId } = useParams<{ roomId: string }>()
  const editorRef = useRef<any>(null)
  const monacoRef = useRef<any>(null)
  const bindingRef = useRef<MonacoBinding | null>(null)
  const decoIdsRef = useRef<Map<number, string[]>>(new Map())
  const lastPosRef = useRef<Map<number, { line: number; column: number }>>(new Map())

  const [provider] = useState(() => {
    const ydoc = new Y.Doc()
    // Pass JWT via params — provider constructs: ws://localhost:1234/{roomId}?token=...
    const wsProvider = new WebsocketProvider(
      'ws://localhost:1234',
      roomId!,  // roomId from URL — different URL = different room = no sync
      ydoc,
      { params: { token } }
    )

    const username = sessionStorage.getItem('auth-username') || 'unknown'
    const { color } = newIdentity()
    // Awareness state: name = auth username (for cursor labels + Room Access), color = random per tab
    wsProvider.awareness.setLocalStateField('user', { name: username, color })

    return wsProvider
  })

  const [connected, setConnected] = useState(false)
  const [onlineUsers, setOnlineUsers] = useState<{ name: string; color: string }[]>([])
  const [myRole, setMyRole] = useState<string>('viewer')
  const [permissions, setPermissions] = useState<Record<string, string>>({})
  const [language, setLanguage] = useState<string>('javascript')
  const [savedToast, setSavedToast] = useState(false)
  const localClientIDRef = useRef<number>(-1)

  useEffect(() => {
    const syncUsers = () => {
      const users: { name: string; color: string }[] = []
      provider.awareness.getStates().forEach((state: any, clientID: number) => {
        if (state.user && clientID !== localClientIDRef.current) {
          users.push(state.user)
        }
      })
      setOnlineUsers(users)
    }
    provider.awareness.on('change', syncUsers)
    syncUsers()
    return () => provider.awareness.off('change', syncUsers)
  }, [provider])

  useEffect(() => {
    const onStatus = ({ status }: { status: string }) => setConnected(status === 'connected')
    provider.on('status', onStatus)
    return () => provider.off('status', onStatus)
  }, [provider])

  useEffect(() => {
    return () => { provider.destroy() }
  }, [provider])

  // Fetch permissions on mount to determine our role
  useEffect(() => {
    if (!roomId) return
    fetch(`${ROOMS_API}/${roomId}/permissions`, {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        if (data) {
          setMyRole(data.myRole)
          setPermissions(data.permissions)
        }
      })
      .catch(() => {})
  }, [roomId, token])

  useEffect(() => {
    const handleBeforeUnload = () => { provider.awareness.setLocalState(null) }
    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [provider])

  // Ctrl+S triggers a snapshot save notification
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault()
        setSavedToast(true)
        setTimeout(() => setSavedToast(false), 2000)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  const handleEditorDidMount: OnMount = (editor, monaco) => {
    editorRef.current = editor
    monacoRef.current = monaco

    const ydoc = provider.doc
    if (!ydoc) return
    localClientIDRef.current = ydoc.clientID

    const ytext = ydoc.getText('monaco')
    const model = editor.getModel()
    if (model) {
      bindingRef.current = new MonacoBinding(ytext, model, new Set([editor]), provider.awareness)
    }

    const onAwarenessChange = () => {
      const editor = editorRef.current
      const monaco = monacoRef.current
      if (!editor || !monaco) return

      const states = provider.awareness.getStates()
      const activeIds = new Set<number>()
      const currentIds = decoIdsRef.current
      const lastPos = lastPosRef.current

      states.forEach((state: any, clientID: number) => {
        if (clientID === localClientIDRef.current || !state.user) return
        activeIds.add(clientID)

        let line = 1, column = 1, found = false

        if (state.cursor?.line != null) {
          line = state.cursor.line
          column = state.cursor.column ?? 1
          found = true
        } else if (state.selection) {
          try {
            const headAbs = Y.createAbsolutePositionFromRelativePosition(state.selection.head, ydoc)
            if (headAbs && headAbs.type === ytext) {
              const m = editor.getModel()
              if (m) {
                const pos = m.getPositionAt(headAbs.index)
                line = pos.lineNumber
                column = pos.column
                found = true
              }
            }
          } catch { /* ignore */ }
        }

        if (!found) {
          const prev = lastPos.get(clientID)
          if (prev) { line = prev.line; column = prev.column }
        } else {
          lastPos.set(clientID, { line, column })
        }

        const color = state.user.color ?? '#9cdcfe'
        const name = state.user.name ?? 'User'
        let styleEl = document.getElementById(`cursor-css-${clientID}`)
        if (!styleEl) {
          styleEl = document.createElement('style')
          styleEl.id = `cursor-css-${clientID}`
          document.head.appendChild(styleEl)
        }
        styleEl.textContent = `
          .remote-cursor-above-${clientID}::after {
            content: '${name}'; display: inline-block; font-size: 11px;
            font-family: -apple-system, sans-serif; font-weight: 500;
            padding: 1px 6px; border-radius: 3px 3px 3px 0;
            background: ${color}; color: #fff; white-space: nowrap;
            pointer-events: none; position: relative; top: -18px; left: -1px;
            z-index: 100; line-height: 16px;
          }
          .remote-cursor-below-${clientID}::after {
            content: '${name}'; display: inline-block; font-size: 11px;
            font-family: -apple-system, sans-serif; font-weight: 500;
            padding: 1px 6px; border-radius: 3px 3px 0 3px;
            background: ${color}; color: #fff; white-space: nowrap;
            pointer-events: none; position: relative; top: 18px; left: -1px;
            z-index: 100; line-height: 16px;
          }
        `

        const isLine1 = line === 1
        const currentDecoIds = currentIds.get(clientID) ?? []

        try {
          const newIds = editor.deltaDecorations(
            currentDecoIds.length > 0 ? currentDecoIds : [],
            [{
              range: new monaco.Range(line, column, line, column),
              options: {
                beforeContentClassName: isLine1 ? undefined : `remote-cursor-above-${clientID}`,
                afterContentClassName: isLine1 ? `remote-cursor-below-${clientID}` : undefined,
                stickiness: monaco.editor.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,
                zIndex: 100,
              }
            }]
          )
          currentIds.set(clientID, newIds)
        } catch { /* ignore */ }
      })

      currentIds.forEach((ids, clientID) => {
        if (!activeIds.has(clientID)) {
          try {
            editor.deltaDecorations(ids, [])
            currentIds.delete(clientID)
            lastPos.delete(clientID)
            const styleEl = document.getElementById(`cursor-css-${clientID}`)
            if (styleEl) styleEl.remove()
          } catch { /* ignore */ }
        }
      })
    }

    provider.awareness.on('change', onAwarenessChange)
    editor.onDidDispose(() => {
      provider.awareness.off('change', onAwarenessChange)
      bindingRef.current?.destroy()
    })
  }

  const localUser = provider.awareness.getLocalState()?.user as { name: string; color: string } | null
  const username = sessionStorage.getItem('auth-username') || ''

  return (
    <div style={{ height: '100vh', width: '100vw', display: 'flex', flexDirection: 'column' }}>
      <div style={{
        padding: '12px 20px', background: '#252526', borderBottom: '1px solid #3c3c3c',
        display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap'
      }}>
        <span style={{ fontSize: '14px', color: '#858585' }}>Collab Code Editor</span>
        <span style={{
          fontSize: '12px', padding: '2px 8px', borderRadius: '4px',
          background: connected ? '#2ea043' : '#f85149', color: '#fff'
        }}>
          {connected ? 'Connected' : 'Disconnected'}
        </span>
        <span style={{ fontSize: '12px', color: '#6e7681' }}>
          Room: <span style={{ color: '#9cdcfe' }}>{roomId?.slice(0, 8)}</span>
        </span>

        {localUser && (
          <span style={{ fontSize: '12px', color: localUser.color, fontWeight: 500 }}>
            {localUser.name} (you)
          </span>
        )}

        <span style={{ fontSize: '11px', padding: '1px 6px', borderRadius: '4px', background: roleBadgeBg(myRole), color: '#fff' }}>
          {myRole}
        </span>

        {onlineUsers.length > 0 && (
          <span style={{ fontSize: '12px', color: '#6e7681' }}>
            {onlineUsers.length} other{onlineUsers.length > 1 ? 's' : ''} online:{' '}
            {onlineUsers.map((u, i) => (
              <span key={i} style={{ color: u.color, fontWeight: 500 }}>
                {u.name}{i < onlineUsers.length - 1 ? ', ' : ''}
              </span>
            ))}
          </span>
        )}

        <button
          onClick={() => navigator.clipboard.writeText(window.location.href).catch(() => {})}
          title="Copy room link"
          style={{
            background: 'transparent', border: '1px solid #3c3c3c', borderRadius: '4px',
            color: '#6e7681', fontSize: '12px', padding: '4px 10px', cursor: 'pointer',
          }}
        >
          Copy link
        </button>

        <select
          value={language}
          onChange={e => setLanguage(e.target.value)}
          style={{
            background: '#1e1e1e', border: '1px solid #3c3c3c', borderRadius: '4px',
            color: '#9cdcfe', fontSize: '12px', padding: '4px 8px', cursor: 'pointer',
          }}
        >
          {LANGUAGES.map(l => (
            <option key={l.value} value={l.value}>{l.label}</option>
          ))}
        </select>

        {myRole === 'owner' && (
          <RoleManager
            roomId={roomId!}
            token={token}
            permissions={permissions}
            onlineUsers={onlineUsers}
            onUpdate={(updated) => setPermissions(updated)}
          />
        )}

        <button
          onClick={() => {
            sessionStorage.removeItem('auth-token')
            sessionStorage.removeItem('auth-username')
            window.location.href = '/'
          }}
          style={{
            marginLeft: 'auto', background: 'transparent', border: '1px solid #3c3c3c',
            borderRadius: '4px', color: '#6e7681', fontSize: '12px',
            padding: '4px 10px', cursor: 'pointer',
          }}
        >
          Log out ({username})
        </button>
      </div>

      {savedToast && (
        <div style={{
          position: 'fixed', bottom: '24px', left: '50%', transform: 'translateX(-50%)',
          background: '#2ea043', color: '#fff', padding: '8px 20px', borderRadius: '8px',
          fontSize: '13px', fontWeight: 500, zIndex: 1000,
          boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
        }}>
          Document saved
        </div>
      )}

      <div style={{ flex: 1 }}>
        <Editor
          height="100%"
          defaultLanguage={language}
          theme="vs-dark"
          onMount={handleEditorDidMount}
          options={{
            fontSize: 14, minimap: { enabled: true },
            scrollBeyondLastLine: false, wordWrap: 'on',
            readOnly: myRole === 'viewer',
          }}
        />
      </div>
    </div>
  )
}

// ─── Role Manager (owner only) ─────────────────────────────────────────────────
function RoleManager({ roomId, token, permissions, onlineUsers, onUpdate }: {
  roomId: string
  token: string
  permissions: Record<string, string>
  onlineUsers: { name: string; color: string }[]
  onUpdate: (updated: Record<string, string>) => void
}) {
  const [open, setOpen] = useState(false)
  const [error, setError] = useState('')

  // permissions is the single authoritative source of who belongs to this room.
  // onlineUsers is used only to determine who is currently connected.
  // Each row = one permission entry, keyed by auth username.
  const changeRole = async (user: string, newRole: string) => {
    setError('')
    const res = await fetch(`${ROOMS_API}/${roomId}/role`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ user, role: newRole }),
    })
    const data = await res.json()
    if (!res.ok) { setError(data.error || 'failed'); return }
    const updated = { ...permissions, [user]: newRole }
    onUpdate(updated)
  }

  return (
    <div style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          background: 'transparent', border: '1px solid #3c3c3c', borderRadius: '4px',
          color: '#6e7681', fontSize: '12px', padding: '4px 10px', cursor: 'pointer',
        }}
      >
        Manage access
      </button>

      {open && (
        <div style={{
          position: 'absolute', top: '100%', right: 0, marginTop: '4px',
          background: '#252526', border: '1px solid #3c3c3c', borderRadius: '8px',
          padding: '16px', width: '280px', zIndex: 200,
          display: 'flex', flexDirection: 'column', gap: '12px',
          boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
        }}>
          <p style={{ color: '#e0e0e0', fontSize: '13px', margin: 0, fontWeight: 600 }}>
            Room Access
          </p>

          {Object.entries(permissions).map(([user, role]) => (
            <div key={user} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ color: '#ccc', fontSize: '12px', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {user}{' '}
                <span style={{ color: '#6e7681' }}>
                  ({onlineUsers.find(u => u.name === user)?.name ? 'online' : 'offline'})
                </span>
              </span>
              <select
                value={role}
                onChange={e => changeRole(user, e.target.value)}
                style={{
                  background: '#1e1e1e', border: '1px solid #3c3c3c', borderRadius: '4px',
                  color: '#e0e0e0', fontSize: '11px', padding: '3px 6px', cursor: 'pointer',
                }}
              >
                <option value="owner">owner</option>
                <option value="editor">editor</option>
                <option value="viewer">viewer</option>
              </select>
            </div>
          ))}

          {error && <p style={{ color: '#f85149', fontSize: '12px', margin: 0 }}>{error}</p>}
        </div>
      )}
    </div>
  )
}

// ─── App (routing root) ──────────────────────────────────────────────────────
function App() {
  const [token, setToken] = useState<string | null>(null)

  useEffect(() => {
    const storedToken = sessionStorage.getItem('auth-token')
    const storedUsername = sessionStorage.getItem('auth-username')
    if (storedToken && storedUsername) {
      fetch(`${AUTH_API}/verify`, {
        headers: { Authorization: `Bearer ${storedToken}` }
      })
        .then(res => {
          if (res.ok) return res.json()
          throw new Error('invalid')
        })
        .then(() => {
          setToken(storedToken)
        })
        .catch(() => {
          sessionStorage.removeItem('auth-token')
          sessionStorage.removeItem('auth-username')
        })
    }
  }, [])

  if (!token) return <AuthScreen onAuth={(t) => { setToken(t) }} />

  return (
    <Routes>
      <Route path="/" element={<HomeScreen token={token} />} />
      <Route path="/room/:roomId" element={<EditorView token={token} />} />
      <Route path="*" element={<HomeScreen token={token} />} />
    </Routes>
  )
}

export default function Root() {
  return <App />
}
