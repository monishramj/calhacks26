# Status · ws/inference (C3)

_Updated: 2026-10-25 by C3 lead (Claude Code)_

## Lanes (who does what inside C3)

| Lane | Tool | Branch / worktree | Owns | Work |
|---|---|---|---|---|
| lead | Claude Code | `ws/inference` / `calhacks26` | `apps/coordinator/src/inference/` root + `claude/**`, `work/eval/**`, `work/status/inference.md`, `work/validation/G5.md` | Claude smoke call, G5, evaluate, merging lanes; apps/coordinator only if C2 hands it off (board 1025-005907) |
| laya | ChatGPT / Codex | `ws/inference-laya` / `../calhacks26-inference-laya` | `services/local-laya/**`, `apps/coordinator/src/inference/laya/**`, `work/validation/G4-laya.md`, `work/status/inference-laya.md` | flyby port, weights, Laya preflight numbers, G4 |

Lanes never edit each other's paths. Lead merges `origin/ws/inference-laya` into `ws/inference` after each laya phase.

## Now

- **Gate / phase:** preflight, then G4 / not started
- **Last commit:** initial scaffold
- **Exact next step (lead):** Claude SDK smoke call, then G5 TEST. **(laya lane):** port flyby's Laya setup and smoke tooling (see `services/local-laya/README.md`), load Laya on this machine, and record the results below. Then run a Claude SDK smoke call.

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
