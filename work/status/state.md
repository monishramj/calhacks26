# Status · ws/state (C2)

_Updated: 2026-10-25 02:08 PDT by David's Claude Code session (C2)_

## Now

- **Gate / phase:** G0 / **REVIEW passed** (`work/validation/G0.md`). Contract **v1.0.0**; `[contract] v1` PR open to main (link in G0.md / the PR list). vitest 777/777, pytest 486/486.
- **Last commit:** `[ws/state][G0][REVIEW] ...` on `ws/state`
- **Exact next step:** G6 rules TEST (§20 common context + G6 TEST prompt, ws/state slice). Write pure-function tests in `packages/domain/src/rules/` for:
  - confirmed queue order (attention category, then earlier open-cycle sequence; no numeric score; duplicates never raise severity)
  - review band
  - timeline (sent/event/receive kept apart; late old reports never erase newer concerns)
  - change flags (new unconfirmed evidence flags reassessment)

  After the PR merges, merge `origin/main` first. If C1 answers 1025-020711 with a different byte bound or transport, that's a v1.x `[contract]` change.
- **G0 ETA posted on the board (1025-005903):** PR ~03:30 PDT, merged ~03:45. The PR is open on time.

## How to run what exists

- Root: `npm install` (workspaces `packages/*`, `apps/*`). `npm test` runs each workspace's `test` script: `packages/domain` vitest (green). `npm run dev:replay`, `npm run build`, and `npm run test:e2e` forward to `@calhacks26/web`.
- Contract tests: `npm test -w @calhacks26/domain`. Python side: `npm run setup:py -w @calhacks26/domain` once (pinned venv: jsonschema 4.26.0, pytest 9.1.1), then `npm run test:py -w @calhacks26/domain`. Regenerate the shared corpus with `python3 packages/domain/test/corpus/make_corpus.py`.
- Docker (C4): `docker compose pull && docker compose up -d spacetimedb`. Set `SPACETIMEDB_HOST_PORT` if a native server already holds 3000.
- SpacetimeDB module: see `spacetimedb/README.md` "Local setup". `spacetimedb/` is **not** a root workspace. It keeps its own `package-lock.json` (pinned 2.13) and is built and published from its folder with `spacetime publish`. `src/index.ts` is still the template placeholder until G3.

## Preflight (§19)

| Item | Result | Evidence / versions |
|---|---|---|
| SpacetimeDB server + CLI | ready on C2 (live, local, dev only) | 2.13.0, commit 08e1aba, macOS arm64, native `~/.local/bin/spacetime`. `spacetime start` on 0.0.0.0:3000; `/v1/ping` 200 (rechecked 01:41). Demo server is in Docker on C4 (D-003), not tested yet. |
| SpacetimeDB TypeScript module SDK | ready (live, local) | npm `spacetimedb` 2.13.x, locked in `spacetimedb/package-lock.json`. `npm ci` + `tsc --noEmit` clean (01:41). Published as `incident-desk`; `spacetime call`, `sql`, `logs` worked against the real local server. |
| SpacetimeDB TypeScript client SDK | not tested | Next: generate bindings and connect a Node client in G3. URI from `SPACETIMEDB_URI`, never localhost-only. |
| Module language chosen (TS / Rust / C#) | **TypeScript (confirmed by ws/state lead)** | It installed and ran first, and the module can import `packages/domain` rules directly (WORKSTREAMS C2 hour 0). |
| Docker (D-006) | compose file pinned; not run | `docker-compose.yml`: `clockworklabs/spacetime:v2.13.0@sha256:dc66a9d8d48b210f6b9c1f2c5d6aa47adbada5e37350f898782a59c2d9f9d1b8` (multi-arch index; amd64 `82bd7c24…305c`), from Docker Hub 2026-10-25. `docker compose config -q` passes on C2. C2: Docker 29.8.2 CLI, engine not running, not needed (native dev path). C4: not run by C2. Unverified: data path and identity keys surviving a restart. Image not pulled yet; pull on C4 before the demo. |
| Root npm workspaces + lockfile | ready | Node 22.23.1, npm 10.9.8. Root `package.json` + `package-lock.json` committed. |

## Blockers

None. Coordinator ownership is settled by **D-007**: ws/inference owns `apps/coordinator/**`. ws/state keeps job issuing + `inputSignature` and the scenario injector as reducers, plus the live adapter.

## Needs from others

- ws/codec-radio: confirm the frozen radio-intake transport and the 1000-byte text bound (board 1025-020711-state-codec-radio, `packages/domain/README.md`).
- ws/codec-radio: agree on the radio-intake transport during G0. C2 proposal: the C4 bridge calls the `receiveReport` reducer through SpacetimeDB's HTTP reducer-call API with its own identity (unverified in 2.13, checked in G0). Fallback: HTTP POST of `ReportInput` to the coordinator, host/port from env.
- ws/inference: `apps/coordinator/**` is yours (D-007), including `package.json`. ws/state regenerates the root lockfile on merge.
- ws/web, ws/inference, ws/codec-radio: adopt contract v1.0.0 once the PR merges. Per-workstream ready packages and the ws/web diff list are in `work/validation/G0.md` (REVIEW → "Ready work packages").
- ws/web: when `apps/web` merges, its lockfile folds into the root `package-lock.json`. ws/state resolves that conflict.

## Inbox acknowledged

1–9 (1–8 read 01:40, 9 read 01:52).
- 1–3: G0 TEST → IMPL → REVIEW next, then G6 rules before G3. The intake transport and adapter interface get frozen in G0.
- 4: questions board checked. 1025-005903 answered (needs-human), 1025-011817 answered.
- 5: will review ws/web's `contract.ts` in G0. Root `package.json` landed for C3.
- 6, 8: D-003 revised. C4 is the command post. C2 publishes the module to C4 over the LAN, and every URI comes from `SPACETIMEDB_URI`.
- 7: D-006 `docker-compose.yml` added in G0 TEST, pinned by tag + digest, not yet run on C4.
- 9: D-007 acknowledged. ws/state no longer edits `apps/coordinator/**`.
