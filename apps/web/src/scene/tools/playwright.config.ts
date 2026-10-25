/// <reference types="node" />
import { defineConfig, devices } from '@playwright/test';
import { fileURLToPath } from 'node:url';

// Separate port/server from the lead's 5174 integration tests and 5181 preview.
export default defineConfig({
  testDir: '../browser',
  timeout: 30_000,
  workers: 1,
  reporter: 'list',
  outputDir: '../../../scene-artifacts/test-results',
  use: { baseURL: 'http://127.0.0.1:5182', trace: 'retain-on-failure' },
  projects: [{ name: 'scene-edge', use: { ...devices['Desktop Chrome'], channel: process.platform === 'win32' ? 'msedge' : undefined } }],
  webServer: {
    command: 'npx vite --mode replay --host 127.0.0.1 --port 5182 --strictPort',
    cwd: fileURLToPath(new URL('../../../', import.meta.url)),
    url: 'http://127.0.0.1:5182',
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
