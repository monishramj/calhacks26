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
