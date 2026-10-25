# Status · ws/web (C4)

_Updated: 2026-10-25 by lead lane (Claude Code, C4)_

## Now

- **Gate / phase:** hour-0 shell done. Lanes start: scene (G7 TEST) and panels (G6 UI TEST).
- **Last commit:** `[ws/web][chore] App shell and lane skeleton`
- **Exact next step (lead):** once lanes push, merge `origin/ws/web-scene` and `origin/ws/web-panels` into `ws/web`; then build the replay adapter in `src/adapters/replay/` against the §18 fixture (R01–R12) so `npm run dev:replay` plays M1. Bind `packages/domain` types when `[contract] v1` merges.

## How to run what exists

```bash
cd apps/web
npm install          # .npmrc disables a local lockfile; ws/state owns the root one
npm run dev:replay   # http://localhost:5173, banner says LOCAL REPLAY
npm run dev          # same shell, banner says NOT CONNECTED
npm test             # vitest + jsdom + Testing Library
npm run typecheck
npm run build
```

## Lane skeleton (who owns what inside apps/web)

| Lane | Branch | Owns | Mount point |
|---|---|---|---|
| lead | `ws/web` | root files, `src/main.tsx`, `src/App.tsx`, `src/layout/**`, `src/adapters/**` except `replay/`, `src/test/**`, this file | — |
| scene | `ws/web-scene` | `src/scene/**`, `public/scene/**` | `<Scene selectedIncidentId onSelectIncident/>` from `src/scene/index.tsx`, fills the left pane |
| panels | `ws/web-panels` | `src/panels/**` | `IncomingFeed`, `ReviewBand`, `ConfirmedQueue`, `IncidentHistory` from `src/panels/index.tsx`, each inside a collapsible `Section` |
| replay | lead (for now) | `src/adapters/replay/**`, `fixtures/replay/**` | — |

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
