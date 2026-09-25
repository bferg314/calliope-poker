import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { starterDecks } from './starterDecks.js';

export default defineConfig({
  plugins: [react(), starterDecks({ order: ['classic', 'classic-54'] })],
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:3000',
      '/ws': { target: 'ws://localhost:3000', ws: true },
    },
  },
  build: { outDir: 'dist', sourcemap: false },
});
