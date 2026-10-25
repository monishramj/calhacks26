# G7 validation · ws/web scene lane

## TEST · 2026-10-25 01:17 PDT · Codex

- Base: `origin/ws/web` shell commit `7a433a9`. Contract version: G0 not yet merged in this base; §17 is the frozen reference. `src/scene/model.ts` contains only a lane-local rendering subset and deliberately empty TEST seams, not a wire contract or an implementation.
- Owned code: `apps/web/src/scene/**`, `apps/web/public/scene/**`. Lane bookkeeping: this file and `work/status/web-scene.md`. No shared shell/config/package/lockfile changes.
- Callers inspected: `App.tsx` mounts `Scene` with controlled `selectedIncidentId` and `onSelectIncident`; no adapter data is wired yet. Existing shell selection contract is unchanged.
- Tests added: `apps/web/src/scene/density.test.ts` (16), `apps/web/src/scene/Scene.test.tsx` (9). Authored inputs are in `fixtures.test-support.ts`, inside the lane folder; never used for inference.
- Environment: Windows, Node v22.19.0, npm 11.8.0; web's existing pinned Vitest 2.1.4 / jsdom 25.0.1 / Testing Library. Installed with `npm install --prefix apps/web --no-package-lock` from the worktree root. No lockfile committed.

Commands from `apps/web`:

```text
npm test -- --reporter=dot
  2 test files failed, 1 passed
  23 failed, 3 passed, 26 total
npm run typecheck
  passed (exit 0)
```

Behavioral red evidence:

1. Exact school/residence/shelter placement: 3 failures because `placePosition` returns null, not the specified coordinates.
2. Density: 11 failures because the TEST seam returns zero. Assertions require a positive single contribution, additivity by distinct incident, no linked-repeat amplification, one weight per incident ID, exclusion of resolved/unlocated incidents, resolve/reopen behavior, equal weight for all three attention categories and null, and unchanged spatial influence/scale when unrelated incidents arrive. Positive baselines prevent a zero-only implementation passing the exclusions.
3. UI: 9 failures because the lead's placeholder renders only a paragraph. It lacks labeled 2D fallback, honest exercise/source labels, incident controls, keyboard selection, controlled selection reflection, selectable unplaced incidents, heatmap toggle/legend, and empty-state feedback.
4. Passing controls: null/unknown place lookup and input immutability pass the empty seams; the existing shell smoke test remains green. These are not implementation acceptance.

**Real providers exercised:** none. React DOM events, selection callbacks, and pure function calls are real code under Vitest; WebGL unavailability is mocked using canvas `getContext() => null`. All incidents are authored fixtures.

**Unavailable / not verified:** actual browser/WebGL rendering, procedural 3D geometry, frame rate, demo display resolution, real adapter selection synchronization, live services and provenance, and backend stale-action rejection. The DOM tests are jsdom component tests, not a claim of real-browser E2E coverage. Browser visual/keyboard/2D checks and WebGL failure checks must run in IMPLEMENT/REVIEW; backend rejection belongs to lead integration.

**Shared integration need:** after IMPLEMENT, lead must supply optional scene `incidents` and source provenance from the adapter; current shell supplies selection only. No baked scene: D-004 remains proposed. npm install reported five dependency audit findings; shared dependency changes belong to the lead/state owners, not this lane.

**Ready for next phase:** TEST complete with meaningful red behavior. Next separate request is G7 IMPLEMENT for the scene slice, followed by a separate REVIEW. No feature implementation attempted in TEST.

## IMPLEMENT · 2026-10-25 01:34 PDT · Codex

- User explicitly authorized automatic progression through phases and questions-board coordination in this chat; the separate-request stopping rule is overridden for this session. Phases still get separate evidence and commits.
- Merged lead replay/DeskContext commit b417751. Lead confirmed on questions item 1025-012740 that scene paths are reserved and useDesk() is the integration seam; no overlapping Claude edits. Read answer and closed item.
- Implemented exact place lookup, compact cosine density kernel (radius 45 exercise units, height 14 units per contribution, elevated base 24), identity deduplication and filtering, Three.js/R3F procedural ground/river/buildings, labeled markers, orbit/zoom, fixed-scale elevated mesh, keyboard-accessible incident controls, unplaced list, provenance, and local SVG fallback. Only confirmed incident input affects density.
- Reads shared DeskContext; optional lane-local props support isolated tests without changing App. Existing selectedIncidentId/onSelectIncident exports remain compatible. Empty adapter means empty incidents; no production fixture import. Shared shell/config/package/lockfiles untouched.
- Context probe, renderer error boundary, and context-loss listener lead to the 2D fallback. Lazy local renderer chunk avoids loading Three when WebGL is unavailable. Renderer uses demand frames and DPR cap 1.5; this is configuration, not a measured FPS claim.
- npm test -- --reporter=dot: 36/36 pass, including all 25 original scene tests and lead shell/replay tests. No test weakened.
- npm run build: passed after correcting OrbitControls event callback typing. Renderer chunk is large because Three is bundled locally; no runtime external dependencies added.
- Real in-app browser at localhost:5181 renders procedural 3D and heatmap. Pointer-selecting School updates the shell history to INC-school. Narrow viewport exposed scene/panel overlap; fixed scrolling entirely within scene CSS. Actual WebGL-unavailable and context-loss behavior remain to review beyond jsdom.
- Real providers: none; source remains fixture, inference banner says authored outputs/no model ran. Current base still has placeholder panels, owned by lead/panels. Backend acceptance remains unverified.

## IMPLEMENT extension · 2026-10-25 · approved SF BLOSM scene

- Human requested BLOSM geography in this Codex chat and then suggested SF for demo impact. Coordinated through questions 1025-013537, 1025-013701 and 1025-014057; D-004 approval is recorded on origin/main (af82f79) and merged here. Lead reserved scene paths; no overlapping asset edits.
- Ran actual portable Blender 4.5.15 LTS, official BLOSM 2.7.28 at release commit 4adff00270f4492667f3bf1305d0b338f3cd1268, OSM API extract, and BLOSM Skadi terrain. Shapely 2.1.2 clips the terrain to the OSM shoreline; glTF Transform CLI 4.2.1 applies meshopt with 16-bit position quantization.
- Final GLB: 104,728 bytes, 10,023 triangles. Public scene-meta.json contains exact hashes, bounds, origin, source versions, scale, altitude offset, and golden coordinates. Locally bundled MeshoptDecoder; no Draco/CDN, external imagery, textures, node positions, or extra frontend dependencies.
- Added georeference.ts using BLOSM's spherical transverse Mercator and the glTF axis mapping: Blender (east,north,altitude) -> Three (east,altitude,south). School/residence/shelter retain (0,0), (80,20), (-120,40). Generic synthetic site boxes sit over the geography, separately labeled from real buildings. The public contract remains placeId-only.
- Blender also generated a matching north-up orthographic PNG; the 2D SVG overlays use the same projected coordinates. Added a manual 2D switch, GLB-error procedural fallback, and source/attribution labels. Renderer chunk stays local and lazy-loaded.
- Bake/reproduction scripts and README live only in src/scene/tools and src/scene. Source extract, addon checkout, terrain cache, and Blender executable stay outside git. Metadata import/public copies are generated together and checked for equality.
- Lead supplied pinned @types/node 22.10.2 at 4e1d8fc in response to questions item 1025-015224; merged and closed. Node references are scoped to Node-only test/config files. No shared package or root lockfile edited by this lane.

## REVIEW · 2026-10-25 · scene slice

Commands from apps/web:

- npm run verify: typecheck, 67/67 unit/component/asset tests, 3/3 lead replay-story browser tests passed.
- npx playwright test --config src/scene/tools/playwright.config.ts: 4/4 scene browser tests passed on installed Edge, on an isolated port (5182).
- npm run build: passed. The remaining bundle-size advisory concerns the local Three renderer chunk (~909 KB uncompressed); no missing assets or compile errors.
- Final focused regression after 2D accessibility refinement: Scene.test.tsx 9/9, scene browser 4/4, production build passed. A Testing Library-only unsupported exact option was corrected; no behavior assertion was removed.

Reviewed failure cases and fixes:

- Actual browser canvas rendered the meshopt GLB. Both 3D and 2D selection synchronize with the queue/history; original school text remains inspectable. Keyboard Enter/Space work. Startup WebGL unavailability was injected before page load; actual WEBGL_lose_context was exercised against a browser WebGL2 context. Both fall back without losing selection. Blocking the GLB request shows an explicit procedural fallback and retains incident selection.
- Browser request capture saw no external requests during scene use. All models/assets/decoders are local. Provider labels remain fixture/authored outputs; no model/provider success is fabricated.
- Verified exported place anchors by decoding the actual GLB, hash/size/extension checks, absence of external buffers/textures, 11 geographic alignment/round-trip tests against BLOSM Python, and geometry vertex heights against densityAt(). Fixed heatmap base is above highest terrain; radius and contribution scale remain fixed, independent of priority/report volume.
- Inspected 1280x720 browser screenshot and narrow 670px in-app view. Fixed scene/panel overlap with scene-local scrolling. Markers render above occluding buildings for legibility; written attention/status labels and selected states remain available. 2D button correctly reports pressed when fallback is active.
- Cut coarse shoreline artifacts with a precise OSM polygon intersection. Imported buildings dim in heatmap mode; no source names or radio node identities exported.

Real tools/providers: Blender/BLOSM and source data downloads were real; Windows Edge and the in-app browser rendered real WebGL. Pure tests/DOM events exercise actual application code. Report data and inference outputs are authored fixtures. WebGL/context/asset failures are intentionally induced in browser tests.

Still unverified: actual live SpacetimeDB adapter, stale/unauthorized backend action rejection, radios, real inference, actual demo laptop frame-rate target and display measurements. Those are not claimed as passes. Scene browser review is green; the lead retains whole-G7/live integration acceptance.

Next: lead merges ws/web-scene and runs verify; scene continues independently on any actionable review or integration defect. Human clarified Codex should continue despite Claude usage-limit handoffs; Codex's recurring follow-up is ACTIVE.

### REVIEW follow-up · 2026-10-25

- Manual in-app browser pointer pick on the actual 3D shelter sphere selected INC-shelter and its timeline, independently of the DOM incident buttons.
- Heatmap visual check caught marker colors being washed out by Three's separate opaque/transparent render queues. Markers and selection rings now render in the transparent queue with their existing explicit order; colors remain visible above the surface. Actual screenshot rechecked; production build passes.
- Preserved the portable Blender tools, official BLOSM checkout, source OSM/water polygon, compatible Shapely packages and terrain cache in the persistent sibling calhacks26-scene-assets folder, outside git. The temporary session folder is no longer the only copy of bake inputs/tooling.
- Codex follow-up automation is ACTIVE following the human clarification; Claude lead/panels HANDOFF requests remain separate.

### Contract v1 integration · 2026-10-25 heartbeat

- Fetched and merged origin/ws/web (3ba8c6f) and origin/main (1975187); contract v1.0.0 is frozen and inbox item 9 is acknowledged. Read its Ready work packages and current decisions.
- SceneIncident is now a read-only projection of packages/domain IncidentView. Source prop types consume ReportProvenance. These imports erase at build time; no shared package/lockfile/config changes.
- Removed scene access to the interim snapshot sourceProvenance string because contract v1 has no such field. Source labels derive from received reports, retain all distinct kinds, and show none when no evidence exists. Existing optional scene-only test inputs remain compatible.
- Added provenance.test.ts: no evidence cannot imply live, recorded/simulated/fixture remain distinct, and mixed evidence labels stay stable under repeat/reordering.
- npm run verify: typecheck and 70/70 unit/component/asset tests plus 3/3 lead browser story tests pass. Scene Playwright suite 4/4 passes; npm run build passes. No live provider or performance claim added.
- Lead-owned adapter/replay/panels still require migration to the nested v1 records/commands, scenario, and backend signatures. Posted questions item 1025-022132 instead of editing those shared paths. Whole-web v1 integration is not yet claimed complete.
