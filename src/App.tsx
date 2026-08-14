import { useEffect, useRef, useState } from 'react'
import Editor, { OnMount } from '@monaco-editor/react'
import * as Y from 'yjs'
import { WebsocketProvider } from 'y-websocket'
import { MonacoBinding } from 'y-monaco'

// In Milestone 2, we use a single hardcoded room.
// In Milestone 4, the room will come from the URL.
const ROOM_NAME = 'milestone-2-demo'

function App() {
  const editorRef = useRef<any>(null)
  const bindingRef = useRef<MonacoBinding | null>(null)
  const [connected, setConnected] = useState(false)

  const handleEditorDidMount: OnMount = (editor, _monaco) => {
    editorRef.current = editor

    // 1. Create a Yjs document — this holds our shared state
    const ydoc = new Y.Doc()

    // 2. Connect to the y-websocket server
    //    The provider syncs the Yjs doc with all other clients in the same room
    const provider = new WebsocketProvider(
      'ws://localhost:1234',  // y-websocket server address
      ROOM_NAME,              // room ID — all clients with same ID sync together
      ydoc
    )

    // Track connection state for the UI indicator
    provider.on('status', ({ status }: { status: string }) => {
      setConnected(status === 'connected')
    })

    // 3. Create a Yjs text type for the document content
    //    This is the CRDT-backed string that Monaco will bind to
    const ytext = ydoc.getText('monaco')

    // 4. Bind Monaco to the Yjs text type
    //    y-monaco handles converting Monaco edits ↔ Yjs operations
    const model = editor.getModel()
    if (model) {
      bindingRef.current = new MonacoBinding(
        ytext,           // the CRDT-backed text
        model,          // Monaco's editor model
        new Set([editor]), // which Monaco editors to bind (just ours)
        provider.awareness // awareness enables cursor presence (Milestone 3)
      )
    }
  }

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      bindingRef.current?.destroy()
    }
  }, [])

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
