# Status · ws/web (C4)

_Updated: 2026-10-25 by lead lane (Claude Code, running from C3)_

## Now

- **Lead runs from C3** (Claude Code session, since 03:00; C4 automation paused). If C4 resumes, read this file first so two leads don't run.
- **Gate / phase:** G7 REVIEW (scene + panels merged) and the web app on contract v1. PR `[G7 REVIEW] Scene + panels on contract v1` to main.
- **Last commit:** `[ws/web][G7][REVIEW] Scene + panels on contract v1`
- **Exact next step (lead):** when ws/state's G6 rules (`packages/domain/src/rules/views.ts`) reach main, replace `src/adapters/derived.ts` with them (`confirmedQueue(state)` already matches; `reviewBand`/`timeline` return shapes differ, adjust panels). Then wire the live SpacetimeDB adapter in `App.tsx` `createAdapter()` once ws/state ships it (G3), and run two browsers.
- **Installing in apps/web:** use `npm install --workspaces=false --package-lock=false` inside `apps/web`. A plain `npm install` rewrites the root lockfile and creates a root `node_modules` with a second Playwright copy, which breaks e2e.
- **e2e on a Mac without bundled Chromium:** `E2E_CHANNEL=chrome npm run verify`.
- **Scene:** done (D-004 SF BLOSM bake + CC0 textures). No more polish (D-009).

## For the lanes: how to get data (read this)

- `import { useDesk } from '../adapters/DeskContext'` → `{ state, adapter }`. `state` is null when nothing is connected; show an honest empty state.
- Types: `../adapters/contract` (type-only re-export of `packages/domain` v1).
- Derived views: `../adapters/derived` (interim until G6 rules merge) → `confirmedQueue(state)`, `reviewBand(state)`, `needsReassessment(state)`, `timeline(state, incidentId?)`, `ATTENTION_LABEL`. Don't write your own ordering.
- Commands (v1): `approveProposal({ runId, commandId, proposalId, inputSignature, baseIncidentVersions })` (copy both from the proposal shown), `rejectProposal({..., reason})`, `operatorEdit({ runId, commandId, incidentId, baseRevision, changes: { attention?, status? }, reason, sourceReportIds })`, `submitIncidentProposal({ jobId: null, proposal })` with `provider: 'operator'` and `inputSignature` from `state.inputSignatures`. Each returns `{ ok, value } | { ok: false, error: { code, message } }`; show `STALE_REVISION` and friends visibly.
- Places (scene): reports carry `input.reportedLocation.placeId`, incidents carry `confirmedPlaceId`. Map `school (0,0)`, `residence (80,20)`, `shelter (-120,40)` inside `src/scene/`.
- Demo flow: `npm run dev:replay`, start state R01–R06 with three authored incidents; "Send next report (#7)" delivers R07…R12. R07 shows up in the review band with a pending fixture proposal; approving it moves the school to the top of the queue.

## How to run what exists

```bash
cd apps/web
npm install          # .npmrc disables a local lockfile; ws/state owns the root one
npm run dev:replay   # http://localhost:5173, banner says LOCAL REPLAY
npm run dev          # same shell, banner says NOT CONNECTED
npm test             # vitest + jsdom + Testing Library
npm run test:e2e     # Playwright story in tests/e2e on replay (Windows uses installed Edge; E2E_CHANNEL overrides)
npm run verify       # typecheck + unit + e2e; the merge gate for lanes
npm run typecheck
npm run build
```

## Lane skeleton (who owns what inside apps/web)

| Lane | Branch | Owns | Mount point |
|---|---|---|---|
| lead | `ws/web` | root files, `src/main.tsx`, `src/App.tsx`, `src/layout/**`, `src/adapters/**` except `replay/`, `src/test/**`, this file | — |
| scene | `ws/web-scene` | `src/scene/**`, `public/scene/**` | `<Scene selectedIncidentId onSelectIncident/>` from `src/scene/index.tsx`, fills the left pane |
| panels | `ws/web-panels` | `src/panels/**` | `IncomingFeed`, `ReviewBand`, `ConfirmedQueue`, `IncidentHistory` from `src/panels/index.tsx`, each inside a collapsible `Section` |
| replay | lead (for now) | `src/adapters/replay/**`, `fixtures/replay/**` | `createExerciseReplay()`; App uses it under `vite --mode replay` |

Lanes keep their public exports and props stable (`SceneProps`, `PanelProps`) or ask the lead. Tests go next to the code as `*.test.ts(x)`; vitest picks up `src/**`.

## Preflight (§19)

| Item | Result | Evidence / versions |
|---|---|---|
| Node / npm versions | ok | Node v22.19.0, npm 11.8.0 (C4) |
| Demo laptop browser + WebGL available | unknown | |
| Demo display resolution | unknown | |
| Scene asset decision (D-004) | proposed | `apps/web/SCENE_PIPELINE.md` |

Pinned web deps: react 18.3.1, three 0.169.0, @react-three/fiber 8.17.10, vite 5.4.10, vitest 2.1.4, typescript 5.6.3.

## Blockers

None.

## Needs from others

- ws/state: G6 rules (`packages/domain/src/rules/views.ts`) on main, and the live adapter (G3).
- ws/state: when the root `package.json` lands, add `apps/web` as a workspace and root scripts `dev:replay` → `npm -w apps/web run dev:replay`, `build` → `npm -w apps/web run build`.

## Inbox acknowledged

1, 2, 3, 4, 5, 9, 10, 12 (both). 6, 8, 11 are C4 hardware/radio items, not doable from C3.
