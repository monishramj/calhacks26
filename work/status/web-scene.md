# Status · ws/web-scene

Updated 2026-10-25 by Codex.

## Now

- G7 scene MVP and browser review green. Actual approved D-004 SF BLOSM map is implemented; final GLB is 104,728 bytes / 10,023 triangles. Final code is in the latest [ws/web][G7][REVIEW][scene] commit on this branch.
- Branch ws/web-scene, isolated persistent worktree calhacks26-web-scene. Lead/panels and latest main/decision changes are integrated. No shared package/config/lockfile edits by this lane.
- EXACT NEXT STEP: confirm lead merged the scene branch and migrated its shared adapter/replay/panels to contract v1.0.0; fetch/merge and rerun integration checks when those changes land. Scene already imports the frozen domain types and derives provenance from reports. Continue actionable scene review fixes and measure actual demo-browser FPS/resolution when available. Do not edit shared adapter files or invent GPS/backend fields.
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
- Real live backend, stale action rejection, radio delivery, inference, and actual demo laptop FPS remain unverified. G0 v1.0.0 is merged; scene uses its frozen IncidentView/ReportProvenance. The lead-owned shared web adapter still uses interim types and needs its owner to migrate it.
- Remaining local bundle-size advisory is the lazy Three renderer; GLB itself is ~105 KB. No half-built scene feature or known compile/test failure remains.

## Coordination

- D-004 approved on main af82f79; merged. Questions 1025-013537, 013701, 014057 coordinated scene choice and constraints; no external mesh node data bundled.
- Lead provided @types/node 22.10.2 in 4e1d8fc; merged and questions item 1025-015224 closed.
- Human relayed Claude usage-limit HANDOFF; board requests 1025-020730 (lead) and 1025-020735 (panels) were sent. Human then clarified Codex should keep working; those Claude handoffs do not pause this lane.
- Needs from lead: merge scene branch and run verify. Future domain/live work stays with its owners.

## Final visual follow-up

- Direct 3D shelter-sphere pointer pick reached INC-shelter history. Fixed transparent-queue marker/ring contrast above the heatmap and visually rechecked. Build passes after the fix.
- Bake tooling/source cache is persistent in sibling calhacks26-scene-assets: tools, blosm, blosm-cache, geo-libs, blender-geo, sources. No need to depend on the session scratch folder for rebuilding. This cache stays outside git.
- Preview tab remains open; Codex automation is active. Lead merge request/evidence was posted as questions item 1025-021221. No known scene code failure or uncommitted work should remain after the current review commit.

## Contract v1 adoption · heartbeat 2026-10-25

- Merged origin/ws/web (3ba8c6f, lead's saved paused status) and origin/main (1975187, contract v1.0.0). Acknowledged inbox item 9 and read G0's Ready work packages.
- Replaced the provisional scene incident schema with a read-only Pick of domain IncidentView; optional source labels use domain ReportProvenance. Type-only source import requires no runtime dependency or shared package change.
- Removed dependency on DeskState.sourceProvenance (deleted in v1). Scene now derives a stable, explicit label from received report provenance, preserving mixed source kinds and never inventing live provenance.
- Verification: 70/70 unit/component/asset tests, 3/3 lead replay browser tests, 4/4 scene browser tests, and production build green. Added provenance regressions for no source, recorded/simulated/fixture separation, and mixed sources.
- Board item 1025-022132 tells the lead what remains in shared adapter migration. Lead/panels handoff requests were closed after inspecting their committed saved status/next steps; this lane stays active.


## Generic texture follow-up � 2026-10-25

- Human approved free generic facades without a BLOSM Pro asset pack. Added ambientCG Facade001 / Facade003 and RoofingTiles006 (CC0-1.0), three unchanged 1024-square JPEG color maps embedded in the GLB. Metadata records source URLs, licenses, hashes and generic appearance disclosure.
- UVs use world-meter scale and deterministic connected-building variations. Removed old BLOSM building vertex colors/UVs that otherwise darkened/overrode textures. Flat roofs retain palette; sloped roofs get tile detail. Same projection, crop, terrain and place anchors; 10,023 triangles, 1,784,152-byte meshopt GLB under 3 MB. Eevee topdown regenerated from the same bake.
- Actual browser JPEG decoding passes for all three images. Asset tests assert embedded JPEG buffer views, no external URI, UV presence, no stale vertex colors, hash/budget and anchor geometry. jsdom uses texture placeholders solely for the geometry decode test; browser evidence uses the real decoder.
- npm run verify: 70 unit/component/asset tests and 3 replay browser tests pass. Scene suite: 5 tests pass. Production build passes (existing lazy Three chunk-size advisory remains). Screenshot visually checked with textured building walls; no live backend/radio/model or laptop FPS evidence added.
- Parallel browser runs exposed the lead suite clearing nested scene artifacts. Scene output now uses scene-artifacts/test-results, outside the lead output tree and covered by the existing test-results ignore pattern. An artifact-path failure was rerun after isolation; it was not a scene behavior failure.
- Exact next step: lead merges ws/web-scene and reruns whole-web verify; Codex continues actionable scene fixes independently. Sources/tool packs remain in the persistent sibling asset cache, outside git.
