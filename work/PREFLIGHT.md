# Preflight (§19 first working checkpoint)

_Consolidated by the orchestrator from each workstream's status file. "Unknown" until someone checks on the actual machine._

**Last checked:** 2026-10-25 01:35 PDT.

| Prerequisite | Workstream | Machine | Status | Evidence / versions |
|---|---|---|---|---|
| Two Meshtastic radios exchange messages | ws/codec-radio | C1 + second endpoint | **working** | Both LilyGO T3 V1.6.1, Meshtastic 2.7.26, US, LONG_FAST, private channel; 5/5 codec packets over the air with radio ACK (C1 status). Payload ceiling **not established**: the close-range probe saturated the receiver, so re-measure ≥3 m apart. |
| Codec weights + shared context, hashes match on both endpoints | ws/codec-radio | C1 + command post | unknown | |
| Codec runtime build runs on both endpoints | ws/codec-radio | C1 + second endpoint | C1 **yes**; endpoint B pending | C1: pinned llama.cpp MinGW build, logits fingerprint `422ac23fca10` matches Linux, decoded 40/40 kit packets. Candidate endpoint B (C4, this orchestrator's machine): Intel i7-11800H, x86-64, AVX2 yes, Windows 11 Home 10.0.26300, 15.7 GB RAM, so it meets the x86-64 + AVX2 requirement. Not tested yet. |
| Local SpacetimeDB server + client pair, pinned | ws/state | command post | in progress | Being set up on C2 (team report 2026-10-25). |
| Laya loads locally; latency and output semantics recorded | ws/inference | command post | unknown | |
| Claude reachable with a pinned, account-accessible model | ws/inference | command post | in progress | API key being set up (team report 2026-10-25). Model ID comes from C3's smoke call. |
| Docker Desktop on the machines that use it (C2 at least), images pulled and pinned (D-006) | ws/state | C2 (+ any that run SpacetimeDB) | unknown | |
| Demo browser has WebGL; demo display resolution known | ws/web | demo laptop | unknown | |

A dry-run or fixture mode never counts as a successful real preflight.
