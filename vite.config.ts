import { fileURLToPath, URL } from 'node:url'

import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

const host = process.env.TAURI_DEV_HOST

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },

  // Opciones para desarrollo con Tauri: sin clear-screen, puerto fijo y HMR,
  // ignorando src-tauri y los workspaces que el usuario abre con la app
  // (evita full page reloads al guardar/editar archivos desde Aether IDE).
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host ? { protocol: 'ws', host, port: 1421 } : undefined,
    watch: {
      ignored: [
        '**/src-tauri/**',
        '**/dist/**',
        '**/Aether-tests/**',
        '**/Aether-workspace/**',
        '**/aether-workspace/**',
      ],
    },
  },
  envPrefix: ['VITE_', 'TAURI_ENV_'],
  build: {
    minify: !process.env.TAURI_ENV_DEBUG,
    sourcemap: !!process.env.TAURI_ENV_DEBUG,
  },
})
