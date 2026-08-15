import { useEffect, useRef, useState } from 'react'
import Editor, { OnMount } from '@monaco-editor/react'
import * as Y from 'yjs'
import { WebsocketProvider } from 'y-websocket'
import { MonacoBinding } from 'y-monaco'

const ROOM_NAME = 'milestone-2-demo'
const AUTH_API = '/auth'

// ─── Auth Screen ───────────────────────────────────────────────────────────
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
    <div style={{
      height: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: '#1e1e1e',
      flexDirection: 'column',
      gap: '24px',
    }}>
      <div style={{
        background: '#252526',
        border: '1px solid #3c3c3c',
        borderRadius: '8px',
        padding: '40px',
        width: '340px',
        display: 'flex',
        flexDirection: 'column',
        gap: '20px',
      }}>
        <div>
          <h2 style={{ color: '#e0e0e0', margin: 0, fontSize: '20px', fontWeight: 600 }}>
            Collab Code Editor
          </h2>
          <p style={{ color: '#6e7681', margin: '6px 0 0', fontSize: '13px' }}>
            Sign up to create and join rooms
          </p>
        </div>

        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            onClick={() => setMode('signup')}
            style={tabStyle(mode === 'signup')}
          >Sign up</button>
          <button
            onClick={() => setMode('login')}
            style={tabStyle(mode === 'login')}
          >Log in</button>
        </div>

        <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <input
            value={username}
            onChange={e => setUsername(e.target.value)}
            placeholder="username"
            autoComplete="username"
            style={inputStyle}
          />
          <input
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder="password"
            autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
            style={inputStyle}
          />
          {error && (
            <p style={{ color: '#f85149', fontSize: '13px', margin: 0 }}>{error}</p>
          )}
          <button
            type="submit"
            disabled={loading}
            style={{
              ...btnStyle,
              opacity: loading ? 0.6 : 1,
              cursor: loading ? 'not-allowed' : 'pointer',
            }}
          >
            {loading ? '...' : mode === 'signup' ? 'Create account' : 'Log in'}
          </button>
        </form>
      </div>
    </div>
  )
}

const tabStyle = (active: boolean) => ({
  flex: 1,
  padding: '8px',
  borderRadius: '6px',
  border: 'none',
  background: active ? '#3c3c3c' : 'transparent',
  color: active ? '#e0e0e0' : '#6e7681',
  cursor: 'pointer',
  fontSize: '14px',
  fontWeight: 500 as const,
})

const inputStyle = {
  padding: '10px 12px',
  borderRadius: '6px',
  border: '1px solid #3c3c3c',
  background: '#1e1e1e',
  color: '#e0e0e0',
  fontSize: '14px',
  outline: 'none',
  width: '100%',
}

const btnStyle = {
  padding: '10px',
  borderRadius: '6px',
  border: 'none',
  background: '#2ea043',
  color: '#fff',
  fontSize: '14px',
  fontWeight: 600,
}

// ─── Editor View (authenticated) ─────────────────────────────────────────────
function newIdentity() {
  const names = ['Nebula', 'Orbit', 'Pulsar', 'Quasar', 'Vega', 'Atlas', 'Orion', 'Lyra', 'Draco', 'Phoenix']
  const name = names[Math.floor(Math.random() * names.length)] + '-' + Math.floor(Math.random() * 1000)
  const color = '#' + Math.floor(Math.random() * 0xffffff).toString(16).padStart(6, '0')
  return { name, color }
}

function EditorView({ token, username }: { token: string; username: string }) {
  const editorRef = useRef<any>(null)
  const monacoRef = useRef<any>(null)
  const bindingRef = useRef<MonacoBinding | null>(null)
  const decoIdsRef = useRef<Map<number, string[]>>(new Map())
  const lastPosRef = useRef<Map<number, { line: number; column: number }>>(new Map())

  const [provider] = useState(() => {
    const ydoc = new Y.Doc()
    // Pass JWT as query param — provider's built-in params option appends it correctly
    // Result: ws://localhost:1234/milestone-2-demo?token=...
    const wsProvider = new WebsocketProvider(
      'ws://localhost:1234',
      ROOM_NAME,
      ydoc,
      { params: { token } }
    )

    let identity = newIdentity()
    const stored = sessionStorage.getItem('collab-user')
    if (stored) {
      try { identity = JSON.parse(stored) } catch { /* use new */ }
    } else {
      sessionStorage.setItem('collab-user', JSON.stringify(identity))
    }
    wsProvider.awareness.setLocalStateField('user', { ...identity, username })

    return wsProvider
  })

  const [connected, setConnected] = useState(false)
  const [onlineUsers, setOnlineUsers] = useState<{ name: string; color: string }[]>([])
  const localClientIDRef = useRef<number>(-1)

  // Sync online users list
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

  // Track connection status
  useEffect(() => {
    const onStatus = ({ status }: { status: string }) => setConnected(status === 'connected')
    provider.on('status', onStatus)
    return () => provider.off('status', onStatus)
  }, [provider])

  // Cleanup on unmount
  useEffect(() => {
    return () => { provider.destroy() }
  }, [provider])

  // Immediately broadcast departure on page unload
  useEffect(() => {
    const handleBeforeUnload = () => { provider.awareness.setLocalState(null) }
    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [provider])

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

    // ─── Awareness change handler — cursor labels ──────────────────────────
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
            content: '${name}';
            display: inline-block; font-size: 11px;
            font-family: -apple-system, sans-serif; font-weight: 500;
            padding: 1px 6px; border-radius: 3px 3px 3px 0;
            background: ${color}; color: #fff; white-space: nowrap;
            pointer-events: none; position: relative; top: -18px; left: -1px;
            z-index: 100; line-height: 16px;
          }
          .remote-cursor-below-${clientID}::after {
            content: '${name}';
            display: inline-block; font-size: 11px;
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

  return (
    <div style={{ height: '100vh', width: '100vw', display: 'flex', flexDirection: 'column' }}>
      <div style={{
        padding: '12px 20px', background: '#252526', borderBottom: '1px solid #3c3c3c',
        display: 'flex', alignItems: 'center', gap: '12px'
      }}>
        <span style={{ fontSize: '14px', color: '#858585' }}>Collab Code Editor</span>
        <span style={{
          fontSize: '12px', padding: '2px 8px', borderRadius: '4px',
          background: connected ? '#2ea043' : '#f85149', color: '#fff'
        }}>
          {connected ? 'Connected' : 'Disconnected'}
        </span>
        <span style={{ fontSize: '12px', color: '#6e7681' }}>Room: {ROOM_NAME}</span>

        {localUser && (
          <span style={{ fontSize: '12px', color: localUser.color, fontWeight: 500 }}>
            {localUser.name} (you)
          </span>
        )}

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
          onClick={() => {
            sessionStorage.removeItem('auth-token')
            sessionStorage.removeItem('auth-username')
            window.location.reload()
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

      <div style={{ flex: 1 }}>
        <Editor
          height="100%"
          defaultLanguage="javascript"
          theme="vs-dark"
          onMount={handleEditorDidMount}
          options={{
            fontSize: 14, minimap: { enabled: true },
            scrollBeyondLastLine: false, wordWrap: 'on',
          }}
        />
      </div>
    </div>
  )
}

// ─── App ────────────────────────────────────────────────────────────────────
export default function App() {
  const [token, setToken] = useState<string | null>(null)
  const [username, setUsername] = useState<string>('')

  useEffect(() => {
    const storedToken = sessionStorage.getItem('auth-token')
    const storedUsername = sessionStorage.getItem('auth-username')
    if (storedToken && storedUsername) {
      // Verify the token is still valid
      fetch(`${AUTH_API}/verify`, {
        headers: { Authorization: `Bearer ${storedToken}` }
      })
        .then(res => {
          if (res.ok) return res.json()
          throw new Error('invalid')
        })
        .then(data => {
          setToken(storedToken)
          setUsername(data.username || storedUsername)
        })
        .catch(() => {
          // Token expired or invalid — clear it and show login screen
          sessionStorage.removeItem('auth-token')
          sessionStorage.removeItem('auth-username')
        })
    }
  }, [])

  if (!token) return <AuthScreen onAuth={(t, u) => { setToken(t); setUsername(u) }} />

  return <EditorView token={token} username={username} />
}
