import path from "path"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

export default defineConfig({
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