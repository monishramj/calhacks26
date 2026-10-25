# Preflight (§19 first working checkpoint)

_Consolidated by the orchestrator from each workstream's status file. "Unknown" until someone checks on the actual machine._

| Prerequisite | Workstream | Machine | Status | Evidence / versions |
|---|---|---|---|---|
| Two Meshtastic radios, correct firmware and preset | ws/codec-radio | C1 + command post | unknown | |
| Codec weights + shared context, hashes match on both endpoints | ws/codec-radio | C1 + command post | unknown | |
| Codec runtime build runs on both endpoints | ws/codec-radio | C1 + command post | unknown | |
| Local SpacetimeDB server + client pair, pinned | ws/state | command post | unknown | |
| Laya loads locally; latency and output semantics recorded | ws/inference | command post | unknown | |
| Claude reachable with a pinned, account-accessible model | ws/inference | command post | unknown | |
| Demo browser has WebGL; demo display resolution known | ws/web | demo laptop | unknown | |

A dry-run or fixture mode never counts as a successful real preflight.
