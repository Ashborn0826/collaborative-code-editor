import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import monacoEditorPlugin from 'vite-plugin-monaco-editor'
import path from 'path'

export default defineConfig({
  plugins: [
    react(),
    (monacoEditorPlugin as any).default({
      languageWorkers: ['editorWorkerService'],
    }),
  ],
  resolve: {
    alias: {
      // y-monaco internally imports monaco-editor at this ESM path.
      // Without this alias, Rollup can't resolve it in production builds.
      'monaco-editor/esm/vs/editor/editor.api.js': path.resolve(
        __dirname,
        'node_modules/monaco-editor/esm/vs/editor/editor.api.js'
      ),
    },
  },
})
