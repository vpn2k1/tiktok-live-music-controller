import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { OVERLAY_PORT, OVERLAY_STREAM_PATH } from './src/shared/overlay.ts';

export default defineConfig({
  plugins: [react()],
  base: './',
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
    proxy: {
      // Dev only: overlay.html is served by Vite, the SSE stream by Electron main.
      [OVERLAY_STREAM_PATH]: {
        target: `http://127.0.0.1:${OVERLAY_PORT}`,
        changeOrigin: true
      }
    }
  },
  build: {
    outDir: 'dist',
    rolldownOptions: {
      input: {
        main: 'index.html',
        overlay: 'overlay.html'
      }
    }
  }
});
