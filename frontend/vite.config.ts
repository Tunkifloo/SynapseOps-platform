import path from "path"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

export default defineConfig({
  // Ruta base del sitio. En GitHub Pages (project site) es "/<repo>/"; en dev/nginx queda "/".
  // Se inyecta en el build vía la variable de entorno VITE_BASE (ver workflow de Pages).
  base: process.env.VITE_BASE ?? "/",
  plugins: [react()],
  server: {
    port: 3000,      // Forzamos el puerto 3000
    strictPort: true // Evita que Vite salte a otro puerto si el 3000 está ocupado
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
})