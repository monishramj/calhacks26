import { defineConfig, devices } from '@playwright/test';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

// Specs live in repo-level tests/e2e/, outside this package. Until ws/state's root
// workspace hoists node_modules, let them resolve @playwright/test from apps/web.
process.env.NODE_PATH = fileURLToPath(new URL('./node_modules', import.meta.url));
(createRequire(import.meta.url)('node:module') as { Module: { _initPaths(): void } }).Module._initPaths();

function e2eChannel(): string | undefined {
  const env = process.env.E2E_CHANNEL;
  if (env) return env === 'bundled' ? undefined : env;
  return process.platform === 'win32' ? 'msedge' : undefined;
}

// Browser story against the isolated LOCAL REPLAY (no DB, models, credentials, or network).
// Live two-client and fault-injection specs join tests/e2e/ once ws/state's live adapter lands.
export default defineConfig({
  testDir: '../../tests/e2e',
  timeout: 30_000,
  reporter: 'list',
  use: { baseURL: 'http://localhost:5174', trace: 'retain-on-failure' },
  // Windows defaults to the installed Edge: the bundled Chromium fails with
  // "spawn UNKNOWN" on C4. E2E_CHANNEL overrides (chrome, msedge, or "bundled").
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], channel: e2eChannel() } }],
  webServer: [
    {
      command: 'npx vite --mode replay --port 5174 --strictPort',
      url: 'http://localhost:5174',
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
    },
    // LIVE_E2E=1: the live dashboard (needs scripts/stdb-setup.sh first) for tests/e2e/live-story.spec.ts.
    ...(process.env.LIVE_E2E
      ? [{ command: 'npx vite --mode live --port 5175 --strictPort', url: 'http://localhost:5175', reuseExistingServer: !process.env.CI, timeout: 60_000 }]
      : []),
  ],
});
