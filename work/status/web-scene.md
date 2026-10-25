# Status · ws/web-scene

Updated 2026-10-25 by Codex.

## Now

- G7 scene MVP and browser review green. Actual approved D-004 SF BLOSM map is implemented; final GLB is 104,728 bytes / 10,023 triangles. Final code is in the latest [ws/web][G7][REVIEW][scene] commit on this branch.
- Branch ws/web-scene, isolated persistent worktree calhacks26-web-scene. Lead/panels and latest main/decision changes are integrated. No shared package/config/lockfile edits by this lane.
- EXACT NEXT STEP: fetch origin and read AGENTS.md, latest inbox/board/decisions and questions; confirm lead merged the scene branch and verify integration. Continue independent G7 review fixes where actionable; measure actual demo-browser FPS/resolution when available. When G0 is truly merged, coordinate domain imports with lead, keeping all scene edits inside this lane. Do not invent GPS/backend fields.
- User authorizes automatic phase progression and commits/pushes. Claude usage-limit HANDOFF applies to Claude only; user explicitly said Codex should continue. Recurring Codex follow-up is ACTIVE every 10 minutes, quiet when nothing changes.

## Run

From apps/web:

```text
npm install --workspaces=false --package-lock=false
npm run dev:replay -- --host 127.0.0.1 --port 5181
npm run verify
npx playwright test --config src/scene/tools/playwright.config.ts
npm run build
```

Preview is at http://127.0.0.1:5181/ while the lane Vite process is running.
Do not run another agent in this folder. Do not commit root/package lockfile changes from npm workspace auto-detection.

## What exists

- Scene reads useDesk() and preserves the shell's controlled selection props. Empty adapter stays empty. Source/provider labels are honest.
- Real OSM/BLOSM geography, generic synthetic exercise-site boxes, locally decoded meshopt GLB, matching top-down fallback, WebGL loss and missing-asset handling, keyboard selection, fixed-density heatmap above terrain, and written labels/attribution.
- Projection/origin/bounds/axes/hashes in public/scene/scene-meta.json and identical generated src/scene/scene-meta.json. georeference.ts matches BLOSM Python; never independently recenter/rotate/scale the model.
- Reproduction scripts and README in src/scene. Raw map extracts, caches, addon/tool binaries are outside git. No .blend committed.
- Ownership remains src/scene/** and public/scene/** plus this status and G7-scene validation. Lead owns App/config/adapter integration; no ordering logic copied into scene.

## Evidence / limits

- work/validation/G7-scene.md records TEST, IMPLEMENT, BLOSM extension and REVIEW.
- Full verification: 67 unit/component/asset tests and 3 lead browser story tests green; 4 scene browser tests green; production build green. Final focused 2D regression also passes.
- Actual GLB export/decode/anchor axes and geometric density heights checked. Browser tests exercise 3D/2D shared selection, keyboard support, forced context loss, unavailable WebGL startup, missing GLB fallback and zero external requests.
- Real live backend, stale action rejection, radio delivery, inference, and actual demo laptop FPS remain unverified. G0 is not yet implemented in this lane base; interim web adapter types remain unchanged.
- Remaining local bundle-size advisory is the lazy Three renderer; GLB itself is ~105 KB. No half-built scene feature or known compile/test failure remains.

## Coordination

- D-004 approved on main af82f79; merged. Questions 1025-013537, 013701, 014057 coordinated scene choice and constraints; no external mesh node data bundled.
- Lead provided @types/node 22.10.2 in 4e1d8fc; merged and questions item 1025-015224 closed.
- Human relayed Claude usage-limit HANDOFF; board requests 1025-020730 (lead) and 1025-020735 (panels) were sent. Human then clarified Codex should keep working; those Claude handoffs do not pause this lane.
- Needs from lead: merge scene branch and run verify. Future domain/live work stays with its owners.
