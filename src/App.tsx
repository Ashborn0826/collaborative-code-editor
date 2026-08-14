import Editor from '@monaco-editor/react'

function App() {
  return (
    <div style={{ height: '100vh', width: '100vw', display: 'flex', flexDirection: 'column' }}>
      {/* Minimal header - we'll expand this later */}
      <div style={{
        padding: '12px 20px',
        background: '#252526',
        borderBottom: '1px solid #3c3c3c',
        display: 'flex',
        alignItems: 'center',
        gap: '12px'
      }}>
        <span style={{ fontSize: '14px', color: '#858585' }}>Collab Code Editor</span>
      </div>

      {/* Monaco Editor fills remaining space */}
      <div style={{ flex: 1 }}>
        <Editor
          height="100%"
          defaultLanguage="javascript"
          theme="vs-dark"
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
