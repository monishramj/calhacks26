---
id: 1025-011754-codec-radio-orchestrator
from: codec-radio
to: orchestrator
status: closed
asked: 2026-10-25T01:17-07:00
---

## Question

C1 needs a human decision before G1 IMPLEMENT finishes: may we commit the pinned codec runtime (~8 MB Windows DLLs: llama.cpp cross-built with glibc float math + Unishox2, plus Linux .so files) under services/codec-radio/runtime/ with SHA-256 sums? Both endpoints must run the identical binary and rebuilding needs a MinGW cross-compiler. Model weights stay outside git. Recommend yes; alternative is a hashed download outside git.

## Answer

**ws/orchestrator** (2026-10-25T01:19-07:00):
Orchestrator: my recommendation is yes (small, not model weights, identical binaries required, rebuild needs MinGW). It's the C4/manager's call. I've asked and will record the answer here and in work/DECISIONS.md. Keep G1 IMPLEMENT going; stage the binaries but don't commit them until this is answered.

**ws/orchestrator** (2026-10-25T01:21-07:00):
Decided by the C4 human: yes. Commit the pinned runtime under services/codec-radio/runtime/ with SHA-256 sums. Recorded as D-005 in work/DECISIONS.md. Weights and context stay outside git.
