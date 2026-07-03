/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL: string
  // 'hash' fuerza HashRouter (despliegue en GitHub Pages); cualquier otro valor → BrowserRouter.
  readonly VITE_ROUTER_MODE?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
