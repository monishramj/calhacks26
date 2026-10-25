# Status · ws/state (C2)

_Updated: 2026-10-25 01:45 PDT by David's Claude Code session (C2)_

## Now

- **Gate / phase:** G0 / not started. Chore done: lane `ws/state-spacetimedb` merged, root `package.json` (npm workspaces) added.
- **Last commit:** see `git log ws/state` (`[ws/state][chore] Root package.json ...`)
- **Exact next step:** G0 TEST as written in §20 (common context + G0 TEST prompt). Write contract tests in `packages/domain` for every §9/§17 record and command and the §18 exercise, plus a Python-boundary check of serialized payloads. While doing it, review ws/web's proposed `apps/web/src/adapters/contract.ts` (inbox 5) and decide the radio-intake transport with C1 (inbox 2, 6). If it fits without delaying G0, add `docker-compose.yml` (D-006, inbox 7, 8).
- **G0 ETA posted on the board (1025-005903):** `[contract] v1` PR ~03:30 PDT, merged ~03:45.

## How to run what exists

- Root: `npm install` (workspaces `packages/*`, `apps/*`; today only `apps/coordinator`, an empty package). `npm test` runs each workspace's `test` script if present (passes, nothing to run yet). `npm run dev:replay`, `npm run build`, and `npm run test:e2e` forward to `@calhacks26/web` and work once `ws/web` merges `apps/web`.
- SpacetimeDB module: see `spacetimedb/README.md` "Local setup". `spacetimedb/` is **not** a root workspace. It keeps its own `package-lock.json` (pinned 2.13) and is built and published from its folder with `spacetime publish`. `src/index.ts` is still the template placeholder until G3.

## Preflight (§19)

| Item | Result | Evidence / versions |
|---|---|---|
| SpacetimeDB server + CLI | ready on C2 (live, local, dev only) | 2.13.0, commit 08e1aba, macOS arm64, native `~/.local/bin/spacetime`. `spacetime start` on 0.0.0.0:3000; `/v1/ping` 200 (rechecked 01:41). Demo server is in Docker on C4 (D-003), not tested yet. |
| SpacetimeDB TypeScript module SDK | ready (live, local) | npm `spacetimedb` 2.13.x, locked in `spacetimedb/package-lock.json`. `npm ci` + `tsc --noEmit` clean (01:41). Published as `incident-desk`; `spacetime call`, `sql`, `logs` worked against the real local server. |
| SpacetimeDB TypeScript client SDK | not tested | Next: generate bindings and connect a Node client in G3. URI from `SPACETIMEDB_URI`, never localhost-only. |
| Module language chosen (TS / Rust / C#) | **TypeScript (confirmed by ws/state lead)** | It installed and ran first, and the module can import `packages/domain` rules directly (WORKSTREAMS C2 hour 0). |
| Docker (D-006) | C2: CLI only, engine not running; C4: not checked by C2 | C2: Docker 29.8.2 at `/usr/local/bin/docker`, `docker info` has no daemon (01:42). Not needed on C2: native SpacetimeDB is the dev path. The compose target is C4 (orchestrator row: Docker 29.8.2, Compose v5.6.0, engine not running at 01:27). Image `clockworklabs/spacetime:v2.13.0` not pulled; tag + digest pin pending. |
| Root npm workspaces + lockfile | ready | Node 22.23.1, npm 10.9.8. Root `package.json` + `package-lock.json` committed. |

## Blockers

None. Open decision (not blocking G0): coordinator ownership. C2 recommended a **partial** handoff on board item 1025-005903 (C3 takes `apps/coordinator/**`; ws/state keeps job issuing + `inputSignature` and the scenario injector as reducers). Waiting on the orchestrator/manager and a DECISIONS entry.

## Needs from others

- ws/codec-radio: agree on the radio-intake transport during G0. C2 proposal: the C4 bridge calls the `receiveReport` reducer through SpacetimeDB's HTTP reducer-call API with its own identity (unverified in 2.13, checked in G0). Fallback: HTTP POST of `ReportInput` to the coordinator, host/port from env.
- ws/inference: add `@anthropic-ai/sdk` to `apps/coordinator/package.json` on your branch (allowed now that the workspace exists). ws/state regenerates the root lockfile on merge.
- ws/web: when `apps/web` merges, its lockfile folds into the root `package-lock.json`. ws/state resolves that conflict.
- Orchestrator: decide 1025-005903 and record it in DECISIONS.md, AGENTS.md, and WORKSTREAMS.md.

## Inbox acknowledged

1, 2, 3, 4, 5, 6, 7, 8 (read 2026-10-25 01:40).
- 1–3: G0 TEST → IMPL → REVIEW next, then G6 rules before G3. The intake transport and adapter interface get frozen in G0.
- 4: questions board checked. 1025-005903 answered (needs-human), 1025-011817 answered.
- 5: will review ws/web's `contract.ts` in G0. Root `package.json` landed for C3.
- 6, 8: D-003 revised. C4 is the command post. C2 publishes the module to C4 over the LAN, and every URI comes from `SPACETIMEDB_URI`.
- 7: D-006 `docker-compose.yml` is owned and pending, slotted into G0 where it doesn't delay contracts.
