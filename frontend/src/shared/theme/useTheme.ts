import { create } from 'zustand'

export type Theme = 'light' | 'dark'

const STORAGE_KEY = 'synapseops:theme'

/** Tema inicial: preferencia guardada → preferencia del sistema → claro. */
function getInitialTheme(): Theme {
  if (typeof window === 'undefined') return 'light'
  const saved = localStorage.getItem(STORAGE_KEY)
  if (saved === 'light' || saved === 'dark') return saved
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

/** Aplica/quita la clase `.dark` en <html> (los tokens del tema viven en index.css). */
function applyTheme(theme: Theme) {
  if (typeof document === 'undefined') return
  document.documentElement.classList.toggle('dark', theme === 'dark')
  document.documentElement.style.colorScheme = theme
}

interface ThemeState {
  theme: Theme
  setTheme: (theme: Theme) => void
  toggle: () => void
}

export const useTheme = create<ThemeState>((set, get) => ({
  theme: getInitialTheme(),
  setTheme: (theme) => {
    if (typeof window !== 'undefined') localStorage.setItem(STORAGE_KEY, theme)
    applyTheme(theme)
    set({ theme })
  },
  toggle: () => get().setTheme(get().theme === 'dark' ? 'light' : 'dark'),
}))

/**
 * Aplica el tema inicial ANTES del primer render (llamar en main.tsx) para evitar
 * el flash de tema incorrecto (FOUC). Idempotente.
 */
export function initTheme() {
  applyTheme(useTheme.getState().theme)
}
