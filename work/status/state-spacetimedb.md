# Status · ws/state-spacetimedb (lane of C2)

_Updated: 2026-10-25 by David's Claude Code session_

## Now

- **Gate / phase:** preflight (§19), local SpacetimeDB. Not a gate phase.
- **Last commit:** see `git log ws/state-spacetimedb`
- **Exact next step:** ws/state lead merges this lane into `ws/state` and copies the preflight rows below into `work/status/state.md`. Then G0 TEST as planned. `src/index.ts` stays a placeholder until G3.

## Owns

`spacetimedb/**` and this file.

## How to run what exists

See `spacetimedb/README.md` "Local setup". Short version: `spacetime start`, then `cd spacetimedb && npm ci && spacetime publish`.

## Preflight (§19)

| Item | Result | Evidence / versions |
|---|---|---|
| SpacetimeDB server + CLI | ready (live, local) | 2.13.0, commit 08e1aba, macOS arm64. `spacetime start` on 0.0.0.0:3000; `/v1/ping` returned 200. |
| SpacetimeDB TypeScript module SDK | ready (live, local) | npm `spacetimedb` 2.13.x, locked in `spacetimedb/package-lock.json`. `tsc --noEmit` clean. Published as `incident-desk`; `spacetime call add`, `spacetime sql`, and `spacetime logs` all worked against the real local server. |
| SpacetimeDB TypeScript client SDK | not tested | No client connection yet. Next: generate bindings and connect a Node client during G3. |
| Module language chosen (TS / Rust / C#) | TypeScript (proposed) | It installed and ran first, and it can import `packages/domain` rules directly (WORKSTREAMS C2 hour 0). Lead to confirm. |

## Blockers

None.

## Needs from others

- ws/state lead: confirm TypeScript as the module language, and merge this lane.

## Inbox acknowledged

None (lane file; inbox items go to `work/status/state.md`).
