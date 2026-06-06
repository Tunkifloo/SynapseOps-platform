import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// Fuentes self-hosted (RN-008): importadas vía JS para que Vite empaquete los
// .woff2 en dist/ y la SPA funcione sin internet (laboratorio UPAO).
import '@fontsource-variable/figtree'
import '@fontsource-variable/jetbrains-mono'
import './index.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
