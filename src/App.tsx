import { useEffect, useRef, useState } from 'react'
import Editor, { OnMount } from '@monaco-editor/react'
import * as Y from 'yjs'
import { WebsocketProvider } from 'y-websocket'
import { MonacoBinding } from 'y-monaco'

// In Milestone 2, we use a single hardcoded room.
// In Milestone 4, the room will come from the URL.
const ROOM_NAME = 'milestone-2-demo'

function newIdentity() {
  const names = ['Nebula', 'Orbit', 'Pulsar', 'Quasar', 'Vega', 'Atlas', 'Orion', 'Lyra', 'Draco', 'Phoenix']
  const name = names[Math.floor(Math.random() * names.length)] + '-' + Math.floor(Math.random() * 1000)
  const color = '#' + Math.floor(Math.random() * 0xffffff).toString(16).padStart(6, '0')
  return { name, color }
}

function App() {
  const editorRef = useRef<any>(null)
  const monacoRef = useRef<any>(null)
  const bindingRef = useRef<MonacoBinding | null>(null)
  const decoIdsRef = useRef<Map<number, string[]>>(new Map())
  const lastPosRef = useRef<Map<number, { line: number; column: number }>>(new Map())

  // Create provider synchronously before first render so effects can read it
  const [provider] = useState(() => {
    const ydoc = new Y.Doc()
    const wsProvider = new WebsocketProvider('ws://localhost:1234', ROOM_NAME, ydoc)

    // Reuse identity across page refreshes within the same tab; generate fresh one if none stored
    let identity: { name: string; color: string }
    const stored = sessionStorage.getItem('collab-user')
    if (stored) {
      try { identity = JSON.parse(stored) } catch { identity = newIdentity() }
    } else {
      identity = newIdentity()
    }
    sessionStorage.setItem('collab-user', JSON.stringify(identity))
    wsProvider.awareness.setLocalStateField('user', identity)

    return wsProvider
  })

  const [connected, setConnected] = useState(false)
  const [onlineUsers, setOnlineUsers] = useState<{ name: string; color: string }[]>([])
  const localClientIDRef = useRef<number>(-1)

  // Sync online users list from awareness state
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
    return () => {
      provider.destroy()
    }
  }, [provider])

  // Immediately broadcast departure on page unload so other clients remove us without waiting for server timeout
  useEffect(() => {
    const handleBeforeUnload = () => {
      provider.awareness.setLocalState(null)
    }
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
      bindingRef.current = new MonacoBinding(
        ytext,
        model,
        new Set([editor]),
        provider.awareness
      )
    }

    // ─── Milestone 3: Awareness change handler ─────────────────────────────
    // y-monaco internally calls setLocalStateField('selection', ...) which
    // fires the 'change' event SYNCHRONOUSLY. We do NOT call setLocalStateField
    // here — we only READ remote states and update our decorations.
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

        // Try to get cursor position
        let line = 1, column = 1, found = false

        // Prefer Monaco's cursor broadcast (y-monaco reads this from the binding)
        if (state.cursor?.line != null) {
          line = state.cursor.line
          column = state.cursor.column ?? 1
          found = true
        }
        // Fallback: Yjs relative → absolute position conversion
        else if (state.selection) {
          try {
            const headAbs = Y.createAbsolutePositionFromRelativePosition(
              state.selection.head, ydoc
            )
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

        // Inject per-user CSS for the label
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
            display: inline-block;
            font-size: 11px;
            font-family: -apple-system, BlinkMacSystemFont, sans-serif;
            font-weight: 500;
            padding: 1px 6px;
            border-radius: 3px 3px 3px 0;
            background: ${color};
            color: #fff;
            white-space: nowrap;
            pointer-events: none;
            position: relative;
            top: -18px;
            left: -1px;
            z-index: 100;
            line-height: 16px;
          }
          .remote-cursor-below-${clientID}::after {
            content: '${name}';
            display: inline-block;
            font-size: 11px;
            font-family: -apple-system, BlinkMacSystemFont, sans-serif;
            font-weight: 500;
            padding: 1px 6px;
            border-radius: 3px 3px 0 3px;
            background: ${color};
            color: #fff;
            white-space: nowrap;
            pointer-events: none;
            position: relative;
            top: 18px;
            left: -1px;
            z-index: 100;
            line-height: 16px;
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

      // Remove decorations for clients that disconnected
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

  // Read our own user info for the "You:" label
  const localUser = provider.awareness.getLocalState()?.user as { name: string; color: string } | null

  return (
    <div style={{ height: '100vh', width: '100vw', display: 'flex', flexDirection: 'column' }}>
      {/* Header with connection status */}
      <div style={{
        padding: '12px 20px',
        background: '#252526',
        borderBottom: '1px solid #3c3c3c',
        display: 'flex',
        alignItems: 'center',
        gap: '12px'
      }}>
        <span style={{ fontSize: '14px', color: '#858585' }}>Collab Code Editor</span>
        <span style={{
          fontSize: '12px',
          padding: '2px 8px',
          borderRadius: '4px',
          background: connected ? '#2ea043' : '#f85149',
          color: '#fff'
        }}>
          {connected ? 'Connected' : 'Disconnected'}
        </span>
        <span style={{ fontSize: '12px', color: '#6e7681' }}>Room: {ROOM_NAME}</span>

        {/* Current user identity */}
        {localUser && (
          <span style={{ fontSize: '12px', color: localUser.color, fontWeight: 500, marginLeft: '8px' }}>
            {localUser.name} (you)
          </span>
        )}

        {/* Other online users */}
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
      </div>

      {/* Monaco Editor fills remaining space */}
      <div style={{ flex: 1 }}>
        <Editor
          height="100%"
          defaultLanguage="javascript"
          theme="vs-dark"
          onMount={handleEditorDidMount}
          options={{
            fontSize: 14,
            minimap: { enabled: true },
            scrollBeyondLastLine: false,
            wordWrap: 'on',
          }}
        />
      </div>
    </div>
  )
}

export default App
