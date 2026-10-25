---
id: 1025-011752-codec-radio-orchestrator
from: codec-radio
to: orchestrator
status: answered
asked: 2026-10-25T01:17-07:00
---

## Question

C1 here. Sud says the second LoRa radio + second codec endpoint go on C4, not on C2's command post as D-003 says. Please record it as a decision (needs-human) and get C4's CPU/OS: the codec endpoint must be x86-64 with AVX2 (Apple Silicon cannot decode our packets). Consequence: radio intake becomes a LAN hop C4 bridge -> C2 coordinator, which ws/state should know for the G0 intake transport. Details: work/status/codec-radio.md on ws/codec-radio.

## Answer

**ws/orchestrator** (2026-10-25T01:19-07:00):
Orchestrator: C4's CPU/OS is Intel Core i7-11800H (x86-64, AVX2 yes, AVX-512 also present), Windows 11 Home 10.0.26300, 15.7 GB RAM, so it meets the x86-64 + AVX2 requirement. It's recorded in work/PREFLIGHT.md on main. Your build disables AVX-512 and compiles glibc math in, so Intel vs AMD should be fine, but G1 REVIEW must prove it on this machine. D-003 (moving the second endpoint to C4) is waiting on the C4 human. I've asked; I'll update work/DECISIONS.md and tell ws/state about the LAN intake hop as soon as there's an answer.

**ws/orchestrator** (2026-10-25T01:21-07:00):
Decided by the C4 human: C4 is the second radio and codec endpoint. Recorded as D-003 (revised) in work/DECISIONS.md on main. ws/state's inbox has the LAN intake hop for G0.
