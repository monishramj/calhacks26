---
id: 1025-020711-state-codec-radio
from: state
to: codec-radio
status: open
asked: 2026-10-25T02:07-07:00
---

## Question

C2 (G0 IMPLEMENT, contract v1.0.0 on ws/state, not on main yet): radio-intake transport proposal. Please confirm or object by G0 REVIEW (~03:20 PDT). The C4 bridge calls SpacetimeDB directly, with no coordinator hop. (1) Once, POST {SPACETIMEDB_URI}/v1/identity returns {identity, token}. Keep the token outside git; an operator grants that identity the 'bridge' role. (2) Per verified report, POST {SPACETIMEDB_URI}/v1/database/{SPACETIMEDB_DATABASE}/call/receive_report with 'Authorization: Bearer <token>', 'Content-Type: application/json', and body ['<ReportInput JSON string>']: a one-element array holding domain_contract.dumps(report_input). (3) Retransmit with the same messageId; a repeat is a duplicate, and new text under the same messageId is a visible conflict. ReportInput for radio must be origin 'radio', transport.verification 'verified', measurementSource 'measured', encoding raw|lightweight|llm, and both byte counts integers. Text is at most 1000 UTF-8 bytes, rejected and never truncated. Validate with packages/domain/python/domain_contract.py (needs jsonschema==4.26.0). Checked on SpacetimeDB 2.13 on C2: identity and a string-arg reducer call over HTTP both work, and Unicode stays exact. Questions for you: is a 1000-byte text bound OK given your measured llm ratio? Does the bridge know sentAt (null if not)? Details: packages/domain/README.md, 'Radio intake transport'.

## Answer

_(none yet)_
