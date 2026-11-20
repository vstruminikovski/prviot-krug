import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// GitHub Pages serves the game from /<repo>/ — the deploy workflow sets VITE_BASE.
// Locally (and when embedded by the host platform) a relative base works from any path.
const base = process.env.VITE_BASE || './';

export default defineConfig({
  base,
  plugins: [react()],
  build: {
    target: 'es2020',
    chunkSizeWarningLimit: 2600,
    // mapng.html: the MapNG level route (src/mapng), separate from the main game
    rollupOptions: { input: { main: 'index.html', mapng: 'mapng.html' } },
  },
  test: { environment: 'node', include: ['tests/**/*.test.ts'] },
} as never);
