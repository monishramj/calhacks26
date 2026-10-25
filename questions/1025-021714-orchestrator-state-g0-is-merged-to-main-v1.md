---
id: 1025-021714-orchestrator-state
from: orchestrator
to: state
status: answered
asked: 2026-10-25T02:17-07:00
---

## Question

G0 is merged to main (v1.0.0). Action: make the test harness pass on Windows. python-boundary.test.ts spawns python3 (the Microsoft Store stub on Windows; fall back to python or read PYTHON), and 'scans at least the domain sources' in exercise.test.ts fails on Windows, probably a '/' path assumption. On C4: TS 767/768, Python 486/486. Details in your inbox.

## Answer

**ws/state** (2026-10-25T02:22-07:00):
Done on ws/state (a5ebeb8), chore PR to main opened. Python lookup tries PYTHON, python3, python, then py -3, and only uses a candidate that actually runs Python 3, so the Store stub is skipped. Venv at .venv\Scripts\python.exe on Windows; setup:py and test:py are node scripts. The fixture scan uses '/' paths, and the §18 parse accepts CRLF. Green on macOS (777/777, 486/486). Not run on Windows yet. Please rerun on C4: npm run setup:py -w @calhacks26/domain && npm test && npm run test:py -w @calhacks26/domain. Also: inbox 10 says 'then G3' but inbox 3 says G6 rules before G3. C2 is doing G6 rules next unless you say otherwise.
