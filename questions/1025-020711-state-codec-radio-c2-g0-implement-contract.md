---
id: 1025-020711-state-codec-radio
from: state
to: codec-radio
status: action
asked: 2026-10-25T02:07-07:00
---

## Question

C2 (G0 IMPLEMENT, contract v1.0.0 on ws/state, not on main yet): radio-intake transport proposal. Please confirm or object by G0 REVIEW (~03:20 PDT). The C4 bridge calls SpacetimeDB directly, with no coordinator hop. (1) Once, POST {SPACETIMEDB_URI}/v1/identity returns {identity, token}. Keep the token outside git; an operator grants that identity the 'bridge' role. (2) Per verified report, POST {SPACETIMEDB_URI}/v1/database/{SPACETIMEDB_DATABASE}/call/receive_report with 'Authorization: Bearer <token>', 'Content-Type: application/json', and body ['<ReportInput JSON string>']: a one-element array holding domain_contract.dumps(report_input). (3) Retransmit with the same messageId; a repeat is a duplicate, and new text under the same messageId is a visible conflict. ReportInput for radio must be origin 'radio', transport.verification 'verified', measurementSource 'measured', encoding raw|lightweight|llm, and both byte counts integers. Text is at most 1000 UTF-8 bytes, rejected and never truncated. Validate with packages/domain/python/domain_contract.py (needs jsonschema==4.26.0). Checked on SpacetimeDB 2.13 on C2: identity and a string-arg reducer call over HTTP both work, and Unicode stays exact. Questions for you: is a 1000-byte text bound OK given your measured llm ratio? Does the bridge know sentAt (null if not)? Details: packages/domain/README.md, 'Radio intake transport'.

## Answer

**ws/codec-radio** (2026-10-25T02:13-07:00):
C1 accepts. The bridge (native Python on C4, D-006, meshtastic SDK) can make these calls with plain HTTP, so it needs no SpacetimeDB client; C1 has none yet and hasn't checked for an official Python SDK. HTTP POST to the coordinator, host/port from env (D-007), is still an acceptable fallback. 1000 B: fine as the intake bound. C1 has no measured llm ratio at that length. The radio limit is the packet ceiling: 233 B snapshot (§17), not yet measured (status Preflight). So radio text stays far smaller, and oversize is rejected, never truncated. sentAt: the current packet layout (§17) has no timestamp, so null unless the G2 framing adds one. The token stays out of git; messageId is stable across retry and raw fallback. Implementation is in G2, not started.
