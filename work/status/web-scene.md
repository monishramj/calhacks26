# Status · ws/web-scene

Updated 2026-10-25 01:17 PDT by Codex.

## Now

- Gate / phase: **G7 TEST complete, behavioral red**; 23 failing / 3 passing across the scene and shell suites. Typecheck passes.
- Branch: `ws/web-scene`, based on lead shell `7a433a9`; current phase commit is the latest `[ws/web][G7][TEST][scene]` commit.
- Persistent primary clone: sibling folder `calhacks26`; isolated lane worktree: `calhacks26-web-scene`. Never run another agent in this lane folder.
- Exact next step: on a separate **NEXT / G7 IMPLEMENT** request, fetch, merge `origin/ws/web`, reread AGENTS.md plus latest origin/main inbox/board, run `python scripts/questions.py list`, then implement the scene slice against the tests without weakening them. Stop, record, commit, and push after IMPLEMENT; REVIEW stays separate.

## How to run

```text
cd apps/web
npm install --no-package-lock
npm test
npm run typecheck
npm run dev:replay
```

Tests are intentionally red against the unchanged scene placeholder and empty `model.ts` seams. `work/validation/G7-scene.md` records causes and limitations. Dev still shows only the lead's shell; it does not show a built scene yet.

## Implementation handoff

- Own ONLY `apps/web/src/scene/**`, `apps/web/public/scene/**`, plus lane status/validation files. Preserve shell selection props.
- Use one procedural fictional scene: ground, river, box clusters; §18 positions map `(a,b)` to `(x=a,y=0,z=b)`. No Blender/baked geography before D-004 approval.
- `model.ts` holds an internal rendering subset of §17 IncidentView. `placePosition()` and `densityAt()` are intentionally unimplemented TEST seams. Replace the subset with domain imports once G0 arrives; don't invent wire fields.
- Component tests anticipate optional `incidents` and `sourceProvenance` props. Add them in IMPLEMENT; default to no data, never fixture incidents in production. Lead owns actual adapter wiring and mode/inference labels.
- Render labeled accessible incident controls with controlled selection, including an unplaced list; accessible heatmap toggle and fixed legend; 2D map on WebGL failure. One equal heatmap contribution per open located confirmed incident, independent of reports/attention, fixed radius and scale.
- DOM tests run in jsdom with unavailable WebGL. Real browser, actual 3D geometry, WebGL context failures, visual quality, and performance remain unverified; don't call G7 passed until REVIEW.

## Blockers

- No blocker to scene IMPLEMENT. G0/adapter not wired in this base; scene-local fixtures enable independent development.
- Repo workflow requires TEST, IMPLEMENT, REVIEW as separate prompts; stopped at TEST as specified in docs/KICKOFF.md and ground truth §12/§20.

## Needs from others

- Lead: merge `origin/ws/web-scene` after TEST review. After IMPLEMENT, wire adapter-confirmed incident rows and source provenance into Scene; shared App changes stay with lead.
- Lead/state: dependency install reports 5 audit findings (2 moderate, 1 high, 2 critical). Coordinate pinned dependency upgrades in owned package/lockfiles; this lane changed neither.
- Lead: browser integration tests for scene/queue/history selection, real live source/inference labels, and stale backend rejection. Actual demo browser/resolution and frame-rate evidence still needed.

## Inbox / board acknowledged

- `origin/main:work/inbox/web.md` items 1–5: shell done; procedural fallback remains default; M1 through lead; isolated lane worktree; questions board live.
- `python scripts/questions.py list`: nothing waiting for this lane at phase start.
- Board snapshot is older than the pushed lead shell; this status and lane validation provide the current evidence. Lead/orchestrator own their files.
