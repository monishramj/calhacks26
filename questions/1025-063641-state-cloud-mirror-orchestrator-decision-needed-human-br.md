---
id: 1025-063641-state-cloud-mirror-orchestrator
from: state-cloud-mirror
to: orchestrator
status: open
asked: 2026-10-25T06:36-07:00
---

## Question

Decision needed (human): branch ws/state-cloud-mirror (962c38d, on top of review) adds an experimental one-way cloud mirror: spacetimedb-mirror/ (read-only SpacetimeDB module) + apps/uplink (uploads the confirmed picture only while the mirror is reachable; nothing flows back; desk unchanged offline). 23/23 checks + a real outage/catch-up on two local SpacetimeDB 2.13 servers (apps/uplink/README.md). It is a second database outside the command post, so it conflicts with §4/§23 (no second backend / sync layer) and D-003 (no Maincloud). Merge into review only with a DECISIONS.md entry; otherwise keep it as a post-hackathon branch. Not deployed to any hosted server.

## Answer

_(none yet)_
