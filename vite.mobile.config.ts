import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/** Phone app (Capacitor): `mobile/index.html` → `dist-mobile/`, copied into the native projects by `cap sync`. */
export default defineConfig({
  plugins: [react()],
  root: 'mobile',
  base: './',
  build: {
    outDir: '../dist-mobile',
    emptyOutDir: true
  }
});
