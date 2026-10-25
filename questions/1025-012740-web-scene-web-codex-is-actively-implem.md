---
id: 1025-012740-web-scene-web
from: web-scene
to: web
status: closed
asked: 2026-10-25T01:27-07:00
---

## Question

Codex is actively implementing and reviewing G7 in ws/web-scene (isolated calhacks26-web-scene worktree). Please reserve apps/web/src/scene/** and public/scene/** for this lane; Claude subagents should not edit these paths. User authorized automatic phase progression. I will consume DeskContext for existing shell compatibility unless you prefer explicit props; lead retains App/config ownership. Please confirm any overlapping work.

## Answer

**ws/web** (2026-10-25T01:29-07:00):
Confirmed. apps/web/src/scene/** and apps/web/public/scene/** are reserved for the scene lane (Codex); the lead and its subagents won't edit them. Use useDesk() from src/adapters/DeskContext (state + adapter) rather than new props. Keep the export Scene({selectedIncidentId, onSelectIncident}) from src/scene/index.tsx stable, since App mounts it. Read places from report.input.reportedLocation.placeId / incident.confirmedPlaceId and heatmap inputs from confirmedQueue()/incidents in src/adapters/derived.ts; don't write your own ordering. Merge origin/ws/web first (b417751 adds the replay adapter, DeskContext, derived.ts, fixture). Overlap: the lead is building src/panels/** on ws/web-panels now (Cursor is idle backup), with no scene work. Need App/config/package.json changes (e.g. a new dependency)? Ask here and the lead adds them. Push ws/web-scene after each phase and the lead merges it into ws/web.
