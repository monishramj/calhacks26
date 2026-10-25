# Status · ws/web (C4)

_Updated: 2026-10-25 by lead lane (Claude Code, C4)_

## Now

- **Gate / phase:** shell, replay adapter + §18 fixture, panels (G6 UI IMPL, merged from ws/web-panels), e2e browser story on replay (3/3 green). Scene (G7) in progress on ws/web-scene (Codex).
- **Last commit:** `[ws/web][G8][TEST] e2e replay story + verify script`
- **Exact next step (lead):** merge `origin/ws/web-scene` when Codex pushes, then `npm run verify`. When `[contract] v1` merges, replace `src/adapters/contract.ts` with `packages/domain` imports and `src/adapters/derived.ts` with `packages/domain/src/rules`. Then G6 panels REVIEW and the live adapter wiring.
- **Automation on C4:** the lead's Claude session runs a 6-minute tick: it answers questions-board items for `web`, merges lane branches when `verify` stays green, and watches `main` for the contract. `questions.py watch` is also running, but it can't auth (`claude` CLI login 401) until someone runs `claude` → `/login` on C4.

## For the lanes: how to get data (read this)

- `import { useDesk } from '../adapters/DeskContext'` → `{ state, adapter }`. `state` is null when nothing is connected; show an honest empty state.
- Types: `../adapters/contract` (interim §17 copy; swaps to `packages/domain` after G0).
- Derived views: `../adapters/derived` → `confirmedQueue(incidents)`, `reviewBand(state)`, `needsReassessment(state)`, `timeline(state, incidentId?)`, `ATTENTION_LABEL`. Don't write your own ordering.
- Commands: `adapter.approveProposal({ runId, commandId: crypto.randomUUID(), proposalId })`, `rejectProposal({..., reason})`, `operatorEdit({ runId, commandId, incidentId, baseRevision, attention?, status?, reason })`, `submitIncidentProposal(...)` with `provider: 'operator'`. Each returns `{ ok, value } | { ok: false, error: { code, message } }`; show `STALE_REVISION` and friends visibly.
- Places (scene): reports carry `input.reportedLocation.placeId`, incidents carry `confirmedPlaceId`. Map `school (0,0)`, `residence (80,20)`, `shelter (-120,40)` inside `src/scene/`.
- Demo flow: `npm run dev:replay`, start state R01–R06 with three authored incidents; "Send next report" delivers R07…R12. R07 shows up in the review band with a pending fixture proposal; approving it moves the school to the top of the queue.

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

- ws/state: G0 contracts and the adapter interface. G6 rules in `packages/domain/src/rules` for the replay.
- ws/state: when the root `package.json` lands, add `apps/web` as a workspace and root scripts `dev:replay` → `npm -w apps/web run dev:replay`, `build` → `npm -w apps/web run build`.

## Inbox acknowledged

1, 2, 3, 4, 5.
