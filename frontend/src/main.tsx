import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// Fuentes self-hosted (RN-008): importadas vía JS para que Vite empaquete los
// .woff2 en dist/ y la SPA funcione sin internet (laboratorio UPAO).
// Poppins = familia de marca (400 cuerpo · 600 subtítulos/CTA · 700 logo/H1-H2).
import '@fontsource/poppins/400.css'
import '@fontsource/poppins/500.css'
import '@fontsource/poppins/600.css'
import '@fontsource/poppins/700.css'
import '@fontsource-variable/jetbrains-mono'
import './index.css'
import App from './App.tsx'
import { initTheme } from './shared/theme/useTheme'

// Aplica el tema (claro/oscuro) antes del primer render para evitar flash (FOUC).
initTheme()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
