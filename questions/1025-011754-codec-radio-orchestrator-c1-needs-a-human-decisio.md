---
id: 1025-011754-codec-radio-orchestrator
from: codec-radio
to: orchestrator
status: open
asked: 2026-10-25T01:17-07:00
---

## Question

C1 needs a human decision before G1 IMPLEMENT finishes: may we commit the pinned codec runtime (~8 MB Windows DLLs: llama.cpp cross-built with glibc float math + Unishox2, plus Linux .so files) under services/codec-radio/runtime/ with SHA-256 sums? Both endpoints must run the identical binary and rebuilding needs a MinGW cross-compiler. Model weights stay outside git. Recommend yes; alternative is a hashed download outside git.

## Answer

_(none yet)_
