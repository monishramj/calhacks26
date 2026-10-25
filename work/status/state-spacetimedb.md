# Status · ws/state-spacetimedb (lane of C2)

_Updated: 2026-10-25 by the spacetimedb lane session (C3 machine)_

## Now

- **Gate / phase:** G3 IMPLEMENT (ship mode, D-009). Done and run once on a real local SpacetimeDB 2.13. Evidence: `work/validation/G3.md`.
- **Last commit:** `[ws/state][G3][IMPL][spacetimedb] ...` on `ws/state-spacetimedb` (merged origin/ws/state + origin/main first).
- **Exact next step:** ws/state lead merges `ws/state-spacetimedb` into `ws/state`, then generates TS client bindings (`spacetime generate --lang typescript --out-dir <live-adapter>/src/module_bindings -p spacetimedb`) and builds the live adapter against these tables and reducers. Lane follow-ups if wanted: scenario injector reducers (`advance_scenario`, private script table), and fixing `docker-compose.yml` (see Needs).

## Module surface (`spacetimedb/src/index.ts`)

Tables (public unless noted). Nested contract records are stored as exact wire JSON in `json`:

| Table | Key | json holds |
|---|---|---|
| `desk` | `id = 0` | – (`run_id`, `run_number`, `mode`, `new_incident_signature`) |
| `role` (private) | `identity` | – (`role`) |
| `report` | `report_id` | `Report` (backend `reportId`/`receiveSequence`/`receivedAt` + original input) |
| `incident` | `incident_id` | `IncidentView` |
| `relation` | `relation_id` | `ReportRelation` (CONFIRMED rows written on approval) |
| `suggestion` | `suggestion_id` | `SuggestionRecord` |
| `proposal` | `proposal_id` | `ProposalRecord` (+ `scope_json`) |
| `job` | `job_id` | `Job` (+ `scope_json`, `input_json` = `JobInput` at last claim) |
| `review_event` | `sequence` | `ReviewEvent` |
| `incident_signature` | `incident_id` | – (`signature` = `DeskState.inputSignatures`) |
| `command` | `command_id` | – (idempotency ledger, `result_json`) |
| `place` | `place_id` | – (`aliases_json`) |

Reducers (args are one JSON string of the contract command unless noted): `receive_report(reportInputJson)`, `claim_job(ClaimJobCommand)`, `submit_local_suggestion`, `submit_incident_proposal`, `approve_proposal`, `reject_proposal`, `operator_edit`, `reset_run`, plus `grant_role(identityHex, role)`, `put_place(placeId, aliasesJson)`, `issue_incident_job(incidentId, targetReportId|'')`. Errors: HTTP 530, body `CODE: message`. Reducers return nothing, so a worker reads its claimed job from the `job` table; operators read command results from `command`.

Freshness: relevant reports for a scope = target report + confirmed reports of the scoped incidents + unconfirmed reports that `changeFlags` (G6) flags for them. Operator proposals copy `incident_signature` (existing incident) or `desk.new_incident_signature` (new incident).

## How to publish

Native CLI (C2/C4): `spacetime start`, then `cd spacetimedb && npm ci && spacetime publish` (root `npm ci` too: the module imports `packages/domain`, which needs ajv). Add `-c` to wipe data.

Docker (what this lane ran, no native CLI on this machine):

```bash
docker run -d --name stdb-g3 -p 3000:3000 -v "$PWD:/repo" clockworklabs/spacetime:v2.13.0@sha256:dc66a9d8d48b210f6b9c1f2c5d6aa47adbada5e37350f898782a59c2d9f9d1b8 start --listen-addr 0.0.0.0:3000
# image has no node; spacetime build only uses it for `tsc --noEmit` (run that on the host)
docker exec -u root stdb-g3 sh -c 'printf "#!/bin/sh\nexit 0\n" > /usr/local/bin/node && chmod +x /usr/local/bin/node'
docker exec -w /repo/spacetimedb stdb-g3 spacetime publish --server http://127.0.0.1:3000 -y -c incident-desk
OPERATOR_TOKEN=$(docker exec stdb-g3 spacetime login show --token | grep -o 'eyJ[A-Za-z0-9._-]*') python3 spacetimedb/smoke.py
```

The publishing identity is the first operator (`init`); it grants `bridge`/`worker`/`simulator` roles with `grant_role`.

## Blockers

None.

## Needs from others

- ws/state lead: `docker-compose.yml` fails on start: `Permission denied (os error 13)` writing `/home/spacetime/.local/share/spacetime/data` (named volume owned by root). Fix: drop `--data-dir` + volume path or add `user: root` / a writable volume path. Needed before C4 runs it.
- ws/state lead: TS client bindings + live adapter. Not in this lane's paths.
- ws/codec-radio: reducer errors are HTTP 530 with body `CODE: message`. A duplicate `messageId` returns 200 (stored once).

## Inbox acknowledged

None (lane file; inbox items go to `work/status/state.md`).
