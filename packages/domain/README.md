# packages/domain

**Spec:** §9, §17, §18 · **Contract:** v1.0.0 (see `CHANGELOG.md`)

This is the shared wire contract. Every type that crosses a boundary between components is defined here once.

| File | What it holds |
|---|---|
| `schema/contract.schema.json` | **The wire authority.** JSON Schema 2020-12, with one `$defs` entry per wire type. `schema/make_schema.py` generates it. Never edit it by hand. |
| `src/types.ts` | TypeScript types: §17 verbatim, plus the §9 records, the commands, `DeskState`, and the `DeskAdapter` interface (the state code implements the live adapter, and the web app implements replay). |
| `src/validate.ts` | `validateWire(type, value)` and `parseWire(type, jsonText)` (never throws), with version and bounds checks. |
| `src/rules.ts` | Pure rules shared by the SpacetimeDB module and the replay adapter: `acceptReport`, `classifyIntake`, `recordCommand`/`recallCommand`, `authorize`, `checkProviderAllowed`, `computeInputSignature`, `checkFreshness`, `citedReportIds`, `checkSourceOwnership`, `buildJobInput`. |
| `python/domain_contract.py` | The Python side, for the bridge and the Laya worker: `validate(type, payload)` and `dumps(payload)`. |
| `test/corpus/*.json` | Shared valid and invalid payloads. Both languages must classify them the same way. `test/corpus/make_corpus.py` generates them. |

```ts
import { validateWire, parseWire, type ReportInput, type DeskAdapter } from '@calhacks26/domain';
```

```python
import sys; sys.path.insert(0, "packages/domain/python")   # needs jsonschema==4.26.0
import domain_contract
assert domain_contract.validate("ReportInput", payload) == []
wire = domain_contract.dumps(payload)   # UTF-8 kept, NaN/Infinity -> ValueError
```

## Rules to know

- **Closed objects, explicit nulls.** Every property is required (use `null` for unknown). Unknown fields are rejected. There is no place for a team, headcount, urgency score, delete flag, free-text identity, or future scenario data.
- **IDs** match `[A-Za-z0-9][A-Za-z0-9._:-]{0,127}`. Meshtastic node IDs (`!f99260d4`) are not valid IDs. The bridge uses `domain_contract.mesh_source_id(node_id)`, which gives `mesh-f99260d4`, as the `sourceId`.
- **Timestamps** use RFC 3339 with `Z` or an offset, and are stored as sent. `sentAt`, `reportedEventAt`, and the backend's `receivedAt` and `receiveSequence` are separate fields. A sender cannot supply the last two.
- **Wire limits:** at most 1 MiB of JSON text (`MAX_WIRE_BYTES`) and nesting depth 16 (`MAX_DEPTH`). `parseWire` and `validateWire` never throw, even on hostile input. They return `INVALID_INPUT`.
- **Text** is stored exactly, with no trimming and no normalization. Text over 1000 UTF-8 bytes is rejected with `INVALID_INPUT` and is never truncated. The 1000 is an authored bound. It waits for the measured codec ratio from the codec/radio code.
- **Roles** come from the caller's backend identity: `operator`, `bridge`, `simulator`, `worker`. Only operators approve, reject, edit, advance, or reset. Workers cannot submit as `operator`, and operators cannot submit as `claude` (`authorize`).
- **Provider honesty** (`checkProviderAllowed`): in a live run, `fixture` output is `INVALID_SOURCE`. In a replay run, only `fixture`, `recording`, and `operator` are allowed.
- **Freshness:** the backend computes `inputSignature` when it issues a job. It is `sig1:` plus a SHA-256 over the run, the ordered relevant report IDs, and the incident revisions. Workers return it unchanged. `checkFreshness` returns `WRONG_RUN`, then `STALE_REVISION`, for any incident that moved and for any new relevant report. Base version `0` means the incident does not exist yet. Operator-authored proposals copy the current signature from `DeskState.inputSignatures[incidentId]`. The browser never computes one. Replay may compute signatures with `computeInputSignature`.
- **Cross-field rules** that JSON Schema cannot express (schema `x-crossFieldRules`) are enforced by both `validateWire` and `domain_contract.validate`.
- **Future truth:** `buildJobInput` copies fields by name from delivered `Report`s and `IncidentView`s only. The §18 script and the expectations in `fixtures/private/exercise/` never reach it. A test scans the domain, coordinator, Laya, and web sources for references to `fixtures/private`.

## Radio intake transport (frozen in v1)

The bridge calls SpacetimeDB directly. There is no coordinator in between.

0. Set the fields from the packet:
   - `sourceId` is `mesh_source_id(sender node)`.
   - `messageId` is a per-sender message ID that stays the same across retransmissions and the raw fallback. The codec/radio code defines it in the packet envelope.
   - `sentAt` is the sender's stated time if the packet carries one. Otherwise it is `null`.
   - `reportedLocation` is `{placeId, source: 'sender_explicit'}` only if the sender picked a named place. Otherwise it is `null`.
1. Once per bridge install, `POST {SPACETIMEDB_URI}/v1/identity` returns `{identity, token}`. Keep the token outside git on the bridge machine. An operator grants that identity the `bridge` role (an incident state reducer).
2. For each verified report, send `POST {SPACETIMEDB_URI}/v1/database/{SPACETIMEDB_DATABASE}/call/receive_report`. Use the header `Authorization: Bearer <token>`, the header `Content-Type: application/json`, and the body `[<ReportInput as a JSON string>]`. The body is a one-element array holding `domain_contract.dumps(report_input)`.
3. A retransmission uses the same `messageId`. `classifyIntake` turns a repeat into a duplicate of the stored report. It turns the same `messageId` with different text into a visible conflict.
4. `SPACETIMEDB_URI` is configurable. Never assume it is localhost. Today the bridge and the database both run on the command post.

Evidence (SpacetimeDB 2.13.0, 2026-10-25):

- `/v1/identity` returned an identity and a token.
- A call with a bearer token and a Unicode string argument returned 200, and the stored text was exact.
- **A call with no token also returned 200** (anonymous identity). So the reducer must reject identities that do not have the `bridge` role.

Not yet verified: the reducer error status codes, and ajv's code generation (`new Function`) inside the module runtime. If the runtime blocks it, switch to ajv standalone precompiled validators. If the HTTP call fails in incident state, the fallback transport is the same body sent as an HTTP POST to a coordinator endpoint.

## Commands

```bash
npm test -w @calhacks26/domain                 # vitest (TS)
npm run setup:py -w @calhacks26/domain         # once: pinned venv (jsonschema, pytest)
npm run test:py -w @calhacks26/domain          # pytest (Python boundary)
python3 packages/domain/schema/make_schema.py         # regenerate schema after editing it
python3 packages/domain/test/corpus/make_corpus.py    # regenerate corpus
```

## Changing the contract

Open a PR titled `[contract] ...`. Edit `schema/make_schema.py` and `src/types.ts` together. Regenerate the schema. Bump `CONTRACT_VERSION` (`x-contractVersion` in the generator). Add a line to `CHANGELOG.md`.
