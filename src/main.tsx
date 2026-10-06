import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { gateEditorParams } from './editorGate'

// The editing tools (?edit=1, ?layout=1, ?style=1, ?tm=1) sit behind a password;
// the app reads those flags once it starts, so the gate runs first.
void gateEditorParams().then(() => {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
})
