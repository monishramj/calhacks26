# Status · ws/inference (C3)

_Updated: 2026-10-24 by repo setup_

## Now

- **Gate / phase:** preflight, then G4 / not started
- **Last commit:** initial scaffold
- **Exact next step:** port flyby's Laya setup and smoke tooling (see `services/local-laya/README.md`), load Laya on this machine, and record the results below. Then run a Claude SDK smoke call.

## How to run what exists

Nothing yet.

## Preflight (§19)

| Item | Result | Evidence / versions |
|---|---|---|
| Laya package version + checkpoint revision | unknown | |
| Laya loads locally (device, load time) | unknown | |
| Warm latency p50 / p95 on this machine | unknown | |
| Output semantics (probabilities / ordinal score / P(true)) | unknown | |
| Claude model ID that works for this account | unknown | |

## Blockers

None.

## Needs from others

- ws/state: G0 types for `LocalSuggestion`, `IncidentProposal`, and the job input.

## Inbox acknowledged

None.
