# Status · ws/web-scene

Updated 2026-10-25 01:34 PDT by Codex.

## Now

- G7 IMPLEMENT green: 36/36 web tests pass; production build passes. Scene reads the replay adapter via useDesk(), with controlled shell selection preserved.
- Branch ws/web-scene, isolated persistent worktree calhacks26-web-scene. User authorized automatic phase progression and questions-board coordination; continue without NEXT prompts.
- Next: G7 REVIEW. Check mesh heights against density, replay-state subscription and selection, keyboard/fallback accessibility, narrow layout, browser visuals, and failure cases. Record actual versus unavailable browser/provider evidence; fix defects, commit/push, then coordinate lead merge.

## Run

From apps/web: npm install --no-package-lock; npm test; npm run build; npm run dev:replay.
Current preview: http://127.0.0.1:5181/ (lane-specific Vite process).

## Owned paths / coordination

- Own apps/web/src/scene/**, apps/web/public/scene/** and lane bookkeeping only. Lead owns shared shell/config/packages; Claude's subagents own panels, no scene overlap.
- Lead confirmed scene reservation and useDesk() integration in answered/closed questions item 1025-012740. Existing Scene selection props stay compatible. No ordering/ranking logic implemented in scene.
- G0 remains unavailable in this base; model.ts is a scene-only rendering subset of interim §17 IncidentView. Use domain types after owner lands G0; don't change public contracts.
- D-004 still proposed: procedural geometry only. Native web per D-006. Inbox 1–7 acknowledged; radio/codec endpoint work is outside this lane.

## Evidence / limits

- work/validation/G7-scene.md records TEST and IMPLEMENT. Renderer and heatmap visually render in the in-app browser; School pointer selection reached shell history.
- WebGL loss/fallback, actual demo resolution/FPS and backend live integration still need review. All replay source data is fixture, inference authored/no model ran. Lead panels remain placeholders in this branch base.
- No shared dependencies or lockfiles edited. npm audit findings recorded in TEST belong to package owners.
- Recurring follow-up enabled in Codex every 10 minutes to check questions, integrate lead changes, and continue actionable lane work; quiet when unchanged.
