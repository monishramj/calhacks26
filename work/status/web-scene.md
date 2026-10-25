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


## Integration monitor - 2026-10-25 02:38 PDT

- Fetched and merged origin/main eb96482 (bookkeeping only); origin/ws/web remains unchanged. No scene integration request or new code defect is actionable. Existing verification remains applicable because no application code changed.
- Read web inbox 10 and 11: lead merge/v1 migration remains with lead; C1 endpoint model/hardware check remains outside the scene lane. Human explicitly approved generic textures and continued Codex work, overriding the older texture timing/paused visualization notes. Texture handoff 1025-023643 is already posted.
- Exact next step: monitor lead merge/v1 adapter integration and questions; fix scene-owned regressions if they arise. No additional polish work is queued.


## Ship mode / reassignment request - 2026-10-25

- Human flagged noisy facade repetition and explicitly deferred texture polish in favor of bottlenecks. No more texture/camera polish queued.
- Merged main fa5f40f and acknowledged D-009: no separate phase requests or new test suites; implement, run existing checks/real path, record short evidence, push. C3 web lead is active; do not overlap adapter/panels work.
- Posted question 1025-024500 to orchestrator requesting a concrete highest-priority non-overlapping task and path ownership, offering C4 endpoint/environment readiness or bounded live integration work. Exact next step: read that answer and execute its assigned task continuously within confirmed ownership.


## C4 command-post assignment - 2026-10-25

- Orchestrator answered 1025-024500: take C4 machine jobs in order (codec endpoint, Docker SpacetimeDB, native Laya once G4 implementation lands). Scene polish stays deferred; no other owner code edits.
- Isolated codec checkout: sibling calhacks26-c4-runtime, origin/ws/codec-radio. Separate Python environment: calhacks26-c4-env. Dependency installation is running (exec session 65767). Unchanged endpoint_check.py reports UNAVAILABLE: set CODEC_MODEL_PATH; model not found in searched Codex/Documents project paths. Asked C1 for pinned file/path/source as 1025-024812. No compatibility pass claimed.
- Started Docker Desktop hidden; daemon responds version 29.8.2. Running unchanged pinned compose from this checkout with project calhacks26; pull/up running (exec session 94040). Image digest dc66a9d8d48b210f6b9c1f2c5d6aa47adbada5e37350f898782a59c2d9f9d1b8. Intended port 3000; C4 Wi-Fi IPv4 10.253.1.187. Server not yet verified; do not report it ready until container and HTTP checks pass. Keep compose/volume unchanged.
- Existing native Laya assets found under Documents/laya-env and Documents/laya-models/laya. Remote inference-laya still at 37074d8 TEST; wait for implementation before starting worker.
- C3 lead confirmed scene merged and adapter/panels migrated to v1, verify green. Merged origin/ws/web 2874406 locally; C4 verify running (exec session 25292). Closing old board handoffs hit one git-fetch timeout under machine load; retry after operations settle. Automation now tracks these C4 tasks every 10 minutes, quiet when pending.
- Exact next step: finish image pull/start, verify actual server version and HTTP health, post LAN URL/port to state. Read C1 response for model and run fingerprint/decode check. Finish C4 verify and push this bookkeeping/merge. No new tests authored.


C4 readiness result update: SpacetimeDB 2.13.0 now RUNNING, restart count0, HTTP /v1/ping200 on localhost and C4 LAN self-address10.253.1.187:3000. Empty named volume initially root-owned; changed only its empty root ownership to image user1000:1000, preserving compose. Notified state (1025-025711 defect,1025-025735 readiness); remote reachability/module/identity persistence unverified. Codec dependencies installed; model still unavailable. C4 integrated v1 npm run verify PASSES70 unit/component/asset +3 replay browser tests. G4 implementation9065817 landed; isolated read-only detached worktree calhacks26-c4-laya created because existing Documents lane diverged (no reset/merge forced). Existing19 real-model checks running session66577 using persistent Documents/laya-env and laya-models. Next: finish those and start native HTTP worker8091, verify health and authored real request, post to inference.


## C4 live Laya result - 2026-10-25

- Existing real-model suite against unchanged9065817: 19 passed,1 FAILED,65 deselected in47.66s. Safety test test_real_uncertain_possible_harm_never_vanishes[low-confidence-harm] returns attention INFORMATION where POSSIBLE_LIFE_SAFETY or null is required. Inference notified1025-025910; orchestrator request1025-025419 answered. No safety pass claimed; no worker code edits.
- Native worker is running in exec session66118, from isolated calhacks26-c4-laya, port8091 host0.0.0.0, persistent Documents/laya-env and laya-models. Health200 on localhost and10.253.1.187:8091 from C4, actual Laya0.3.20 revision55cf4c4ebb4ebe31b2550e8bdf3bd21b99753851. Authored clinic_job POST returned schema-valid real scores in1390ms: REQUEST_REVIEW, attention null, provider local_laya. Remote clients unverified. SDK temperature11+ clamp warning remains; no accuracy/calibration claim.
- Docker ready at10.253.1.187:3000. Codec environment installed but endpoint model still unavailable pending1025-024812. Next: inference owner fixes safety regression; fetch its commit and restart worker without editing their code. Run C1 endpoint once pinned model supplied; monitor server processes and integration requests.


## HUMAN STOP / evaluation handoff - 2026-10-25 03:01 PDT

- Human requested immediate stopping point and push for whole-system evaluation. All implementation work stopped; continue-visualization-lane automation PAUSED. Do not resume without human instruction.
- Branch is pushed; worktree clean after this handoff. Running services intentionally left available: SpacetimeDB on C4:3000 and native Laya9065817 on C4:8091 (exec66118). Last health checks200; URLs10.253.1.187. No background build/test/install job remains from this lane.
- Evaluation limits: integrated v1 web verify passed70 unit +3 browser tests. Real Laya19pass/1FAIL low-confidence-harm; inference notified. Codec model missing; endpoint compatibility unavailable. Remote-client reachability, published DB module/identity persistence and radios not established by this lane.
- Fetch completed before stop: main nowbd857fb (includes merged web PR4 and recorded G4 failure), but not merged locally after stop. No worker update or safety fix deployed. Exact next step upon human resume: check owner replies and latest status before any change.
