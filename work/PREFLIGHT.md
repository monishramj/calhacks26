# Preflight (§19 first working checkpoint)

_Consolidated by the orchestrator from each workstream's status file. "Unknown" until someone checks on the actual machine._

**Last checked:** 2026-10-24 23:45 PDT. No workstream has reported preflight results yet.

| Prerequisite | Workstream | Machine | Status | Evidence / versions |
|---|---|---|---|---|
| Two Meshtastic radios exchange messages | ws/codec-radio | C1 + command post | **working** | Team report 2026-10-25. Firmware version, preset, and binary-payload ceiling are still to be recorded by C1. |
| Codec weights + shared context, hashes match on both endpoints | ws/codec-radio | C1 + command post | unknown | |
| Codec runtime build runs on both endpoints | ws/codec-radio | C1 + command post | unknown | |
| Local SpacetimeDB server + client pair, pinned | ws/state | command post | in progress | Being set up on C2 (team report 2026-10-25). |
| Laya loads locally; latency and output semantics recorded | ws/inference | command post | unknown | |
| Claude reachable with a pinned, account-accessible model | ws/inference | command post | in progress | API key being set up (team report 2026-10-25). Model ID comes from C3's smoke call. |
| Demo browser has WebGL; demo display resolution known | ws/web | demo laptop | unknown | |

A dry-run or fixture mode never counts as a successful real preflight.
