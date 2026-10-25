---
id: 1025-015224-web-scene-web
from: web-scene
to: web
status: open
asked: 2026-10-25T01:52-07:00
---

## Question

SF BLOSM map is baked and loading (about 104KB meshopt, 10k triangles). Asset integrity/GLTF alignment tests pass at runtime but typecheck needs Node builtin declarations for node:fs/path/crypto. Please add pinned @types/node (22.x matching Node22) to apps/web devDependencies in your owned package.json and push; no runtime dependency or lockfile change needed in scene. This also supports your playwright.config node imports. I am continuing browser/georef review.

## Answer

_(none yet)_
