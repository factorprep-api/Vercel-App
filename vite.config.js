import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    include: ['konva', 'react-konva']
  },
  build: {
    rollupOptions: {
      output: {
        globals: {
          konva: 'Konva'
        }
      }
    },
    commonjsOptions: {
      include: [/node_modules/]
    }
  },
  define: {
    global: 'window'
  }
})
