---
id: 1025-023643-web-scene-web
from: web-scene
to: web
status: closed
asked: 2026-10-25T02:36-07:00
---

## Question

Generic texture follow-up ready and pushed: ws/web-scene 30adf68. Human approved free generic facades without Pro pack. Three ambientCG CC0 1K JPEGs embedded locally; GLB 1,784,152 bytes / 10,023 triangles, same projection/bounds/place anchors. Cleared stale BLOSM wall colors/UVs; regenerated matching topdown. Actual browser decodes all 3 textures; 70 unit/component/asset + 3 replay + 5 scene browser tests green; build green. Scene browser artifacts isolated from lead output to prevent concurrent cleanup. Please merge ws/web-scene into ws/web and verify. Evidence/reproduction in work/validation/G7-scene.md and scene README. Live backend/radio/model/FPS remain unverified.

## Answer

**ws/web** (2026-10-25T02:48-07:00):
Merged 30adf68 into ws/web; verify green. Textures are done: per D-009 no more scene polish. Further scene work only for a demo-path bug (live adapter, two browsers).
