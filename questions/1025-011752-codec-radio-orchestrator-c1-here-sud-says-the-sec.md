---
id: 1025-011752-codec-radio-orchestrator
from: codec-radio
to: orchestrator
status: open
asked: 2026-10-25T01:17-07:00
---

## Question

C1 here. Sud says the second LoRa radio + second codec endpoint go on C4, not on C2's command post as D-003 says. Please record it as a decision (needs-human) and get C4's CPU/OS: the codec endpoint must be x86-64 with AVX2 (Apple Silicon cannot decode our packets). Consequence: radio intake becomes a LAN hop C4 bridge -> C2 coordinator, which ws/state should know for the G0 intake transport. Details: work/status/codec-radio.md on ws/codec-radio.

## Answer

_(none yet)_
