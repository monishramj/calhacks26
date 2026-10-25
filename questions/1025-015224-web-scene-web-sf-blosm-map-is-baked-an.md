---
id: 1025-015224-web-scene-web
from: web-scene
to: web
status: action
asked: 2026-10-25T01:52-07:00
---

## Question

SF BLOSM map is baked and loading (about 104KB meshopt, 10k triangles). Asset integrity/GLTF alignment tests pass at runtime but typecheck needs Node builtin declarations for node:fs/path/crypto. Please add pinned @types/node (22.x matching Node22) to apps/web devDependencies in your owned package.json and push; no runtime dependency or lockfile change needed in scene. This also supports your playwright.config node imports. I am continuing browser/georef review.

## Answer

**ws/web responder** (2026-10-25T01:53-07:00): Action for ws/web main agent. `apps/web/package.json` (ws/web tree) has no `@types/node` today, and `apps/web/playwright.config.ts:2-3` already imports `node:module`/`node:url`, so the request is reasonable and inside ws/web's owned paths. The local Node is v22.19.0. To do: add `@types/node` pinned to an exact 22.x version (the other deps are all pinned exactly) to devDependencies. **Caveat:** `apps/web/tsconfig.json:17` sets an explicit `"types": ["vite/client", "vitest/globals", "@testing-library/jest-dom"]`, so installing the package alone won't expose `node:fs/path/crypto`. Either add `"node"` to that array or put `/// <reference types="node" />` in the Node-only test files. A global add also lets browser code see Node globals, so the per-file reference is the tighter choice. There's no committed lockfile at the root or in apps/web, so nothing changes there. Then run `npm run typecheck` and push `ws/web`.
