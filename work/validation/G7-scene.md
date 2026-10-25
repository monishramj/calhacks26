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
