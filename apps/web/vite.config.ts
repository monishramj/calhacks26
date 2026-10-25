/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// All assets are bundled locally; nothing loads from a CDN at runtime (§7, §10).
export default defineConfig({
  plugins: [react()],
  // The replay fixture lives in the repo-level fixtures/replay/ (owned by ws/web).
  server: { port: 5173, strictPort: false, fs: { allow: ['../..'] } },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
  },
});
