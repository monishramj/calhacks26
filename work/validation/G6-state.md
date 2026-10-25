# G6 validation · ws/state (rules slice)

The UI slice is `G6-panels.md` (ws/web). This file covers the pure derived views in `packages/domain/src/rules/views.ts`, which replay and live both use.

## TEST · 2026-10-25 ~02:10–02:29 PDT · David's Claude Code session (C2)

_(Time corrected in IMPLEMENT: the TEST commit 5981075 is stamped 02:29 PDT; the original header said 03:25–03:50.)_

- **Contract version:** 1.0.0 (unchanged; these views are new exports, not wire types).
- **Harness:**
  - `packages/domain/src/rules/views.ts` holds stubs that return `[]`, an empty `Set`, `{}`, or `SERVICE_UNAVAILABLE`.
  - `src/rules.ts` moved to `src/rules/contract.ts` with no change (§11 path `packages/domain/src/rules`).
  - `test/g6/desk.ts` builds `DeskState`s from the authored §18 exercise (`fixtures/private/exercise/`, test-only). It applies confirmed changes by hand, so each test fails only on the view it targets.
- **API names match ws/web's interim `apps/web/src/adapters/derived.ts`** (`confirmedQueue`, `reviewBand`, `needsReassessment`, `timeline`, `ATTENTION_LABEL`), so ws/web swaps one import. New: `incidentGroups`, `changeFlags`, `applyIncidentChange`, `deskInvariants`. Views take a `DeskState` (v1), not an incident array.

### Tests added (`packages/domain/test/g6/`), mapped to the §20 G6 TEST list

| §20 item | Tests |
|---|---|
| Confirmed vs provisional groups | `timeline.test.ts` "incident groups" (confirmed vs provisional; rejected or stale proposals add no link; one group per incident); standing labels CONFIRMED / PROVISIONAL / UNASSIGNED |
| Receive order vs older sent/event time | timeline in receive order even when the array is reversed; R11 sits between R10 and R12; text and all three times exact, nulls kept; only R11 is `lateOlder` |
| Repeats vs retransmissions | a repeat with a new message ID is its own entry with its REPEAT relation; a repeat is one pending band item, not extra severity; a retransmission stored twice is an invariant violation |
| Priority vs confidence | a 0.999 score doesn't move an incident; a 0.05 possible-life-safety hint still leads the band; the queue is identical with every suggestion and proposal removed |
| Stable tie ordering | ID tie-break regardless of input order (4 permutations); category > age > ID; other runs ignored |
| Pending unknowns and contradictions | R07 with no model output is UNKNOWN, tied to the school by its named place; FLAG_CONFLICT and a CONFLICT relation are CONTRADICTION; band order harm > contradiction > unknown > pending, then receive order; rejected proposal → UNKNOWN; null-attention incident → incident-level UNKNOWN; every item cites existing reports and has a written label |
| Operator override | `applyIncidentChange`: attention override bumps revision and keeps age and fields; adds without removing; refuses other run/incident; doesn't mutate |
| Resolve/reopen cycle age | resolve keeps the cycle and leaves the queue; reopen keeps ID and history, starts a new cycle, and ranks by it (school drops behind residence); a reopen cycle starting before the old one, a double resolve, an empty change, and a new incident not OPEN are all invalid; the reopened incident's timeline keeps R01 |
| R11 must not erase R07 | a pending RESOLVED proposal on R11 leaves the school first and life-safety in the queue; R11 is a pending band item while the school keeps its confirmed concern; R11 is flagged LATE_OLDER_REPORT, not an all-clear |
| Duplicate volume never raises severity | 10 confirmed shelter repeats: same attention, same rank |
| Shared invariants (replay and DB) | `deskInvariants` holds at every exercise step. It catches 11 corruptions: duplicate/non-positive sequence, duplicate report ID, retransmission stored twice, missing confirmed report, a report confirmed in two incidents, other-run incident or report, a cycle start no report has, a confirmed relation without a reviewer, a proposal citing a missing report |
| §17 "new information flags immediately" | `needsReassessment` flags the school as soon as R07 arrives (named place, before any model); flags pending-proposal targets; clears once confirmed. `changeFlags`: NEW_EVIDENCE on arrival; correction + possible-harm flags cite R07 in source IDs and description; REPEAT and POSSIBLE_CONFLICT; only the incident asked for |
| §18 expectation | after R07 is confirmed, the queue equals `expectations.json` `afterR07Confirmed` (school, residence, shelter), and age is unchanged by new evidence |

### Commands

```bash
npx tsc --noEmit -p packages/domain     # clean
npm test                                # 846 tests: 64 failed, 782 passed
npm run test:py -w @calhacks26/domain   # 486 passed (unchanged)
```

### Red result

- **G6: 69 tests, 64 failed, 5 passed.** Every failure is an `AssertionError` against the stubs: empty arrays/sets/labels, or `SERVICE_UNAVAILABLE` from `applyIncidentChange`. None is a syntax or environment error (checked from the JSON reporter).
- **The 5 passes are vacuous negatives.** They hold for an empty stub and guard against over-reporting once implemented: no flags without evidence, nothing to review at the authored start, the band clears once confirmed, invariants hold for valid states, and `applyIncidentChange` doesn't mutate its input.
- G0 contract tests: 777/777 still pass. pytest: 486/486.

### Choices these tests fix (for G6 REVIEW and ws/web)

1. **Queue:** OPEN incidents of this run only. Order is attention rank (life safety, active need, information), then **null attention last** (it's listed for review, not hidden), then `openCycleStartSequence`, then incident ID by code unit.
2. **"Affected incident" before any model output** = an OPEN incident whose `confirmedPlaceId` equals the report's sender-explicit `reportedLocation.placeId`, plus the targets of pending suggestions or proposals.
3. **Band kinds**, per unconfirmed delivered report:
   - POSSIBLE_LIFE_SAFETY if any pending hint says so, at any score.
   - CONTRADICTION for FLAG_CONFLICT or a CONFLICT relation.
   - UNKNOWN when there's no pending output (or only rejected/stale output), plus incident-level UNKNOWN for null attention.
   - Otherwise PENDING_CHANGE.

   ws/web's interim `derived.ts` uses the same four kinds.
4. **`lateOlder`** = `sentAt` earlier than the latest `sentAt` among reports received before it.
5. **Reopen** sets `openCycleStartSequence` to `ctx.reopenSequence`, which must be ≥ the old start. A new incident must be created OPEN.

### Not covered here

The UI rendering is G6-panels (ws/web). Live-DB checks run after G3. Replaying with older and duplicate arrivals reordered is G6 REVIEW.

## IMPLEMENT · 2026-10-25 02:32–02:40 PDT · David's Claude Code session (C2)

- **Contract version:** 1.0.0, unchanged. No wire type, schema, or test was edited.
- **File changed:** `packages/domain/src/rules/views.ts` only. Each call builds a small index (this run's reports in receive order, confirmed-in map, pending links per report, late-older set), then sorts with stable keys. No tree or graph engine.
- **Pending link** = a PENDING suggestion, a PENDING proposal that adds or relates the report, or a PROVISIONAL relation. Approved, rejected, and stale records never link.

### Choices made beyond what the tests pin (for G6 REVIEW)

1. **Named-place match prefers OPEN incidents, then falls back to a RESOLVED one.** A new report about a resolved place still flags it for reassessment. TEST choice 2 said OPEN only; no test covers the resolved case.
2. **A provisional relation alone counts as pending output.** Its report is PENDING_CHANGE (or CONTRADICTION for CONFLICT), not UNKNOWN.
3. **Timeline standing ignores the named-place match.** R10 names the school but stays UNASSIGNED until something links it, as the test requires. The band and change flags still tie it to the school by place.
4. **`applyIncidentChange` rejects a change with no effect** (INVALID_INPUT), not only `{}`. OPEN on an OPEN incident is not an error by itself; only RESOLVED on RESOLVED is. The G3 reducer should skip the call when an approved proposal changes nothing on the incident row (relations only).
5. **Incident-level unknowns** (OPEN, null attention) sort after report-level unknowns, by incident ID. `needsReassessment` leaves them out: they're unknown, not new evidence.
6. **Change flags for one incident** use links aimed at that incident or at no incident yet. A possible-harm hint for a new incident still flags the place's incident.
7. Labels match ws/web's interim `derived.ts` word for word, so the swap is one import.

### Commands

```bash
npx tsc --noEmit -p packages/domain       # clean
npm test                                  # 846/846 passed (G6 69/69, G0 777/777)
npm run test:py -w @calhacks26/domain     # 486 passed
(cd spacetimedb && npx tsc --noEmit)      # clean
```

### Green result

- **vitest 846/846**: every G6 test passes against the implementation. The 5 TEST-phase vacuous passes now run against real logic and still hold.
- pytest 486/486 and the SpacetimeDB module typecheck are unchanged.
- **Real providers exercised:** none. These are pure functions. Live-DB use comes in G3.

### Not done here (G6 REVIEW)

- Replaying with older and duplicate arrivals reordered, a stale approval from a second window, and mutation checks on the rules.
- Settling choices 1–6 above with ws/web (panels lane) before they swap `derived.ts` for these exports.

## REVIEW · 2026-10-25 02:38–02:48 PDT · David's Claude Code session (C2)

- **Contract version:** 1.0.0, unchanged. `src/rules/views.ts` unchanged in REVIEW: no defects found in it.
- **Added:** `packages/domain/test/g6/review.test.ts` (51 tests).

### What was attempted (§20 G6 REVIEW)

| Check | How | Result |
|---|---|---|
| Independent replay with older/duplicate arrivals reordered | 40 seeded orders: R01–R06 shuffled before the authored start, R07–R12 shuffled, plus a repeat of R08 with a new message ID at a random point. After every arrival, check invariants, queue, and reassessment. | Pass. 13 originals in receive order with exact text. Late-older marks match an independent oracle. Every unconfirmed report is in the band exactly once. |
| Only confirmed updates change the rank | Same 40 orders: the queue stays at the authored order through all arrivals, a 0.99 INFORMATION hint for R11, and a 0.03 life-safety hint for R07. Only the operator-confirmed change moves the school, by open-cycle age. | Pass |
| Unreviewed possible harm stays prominent | The low-score R07 hint leads the band in every order | Pass |
| R11 vs R07 | R11 is late-older whether it arrives before or after R07 (it's older than R06 too). The school keeps its confirmed concern after R11 in every order. | Pass |
| Sent times across offsets | `02:35-07:00` vs `09:33Z`: compared by instant, not by string | Pass |
| Stale approval from a second window | Window A approves the school change (rev 1 → 2). Window B's approval with base 1 and the old signature → `checkFreshness` STALE_REVISION. Also new evidence (R08) with the revision unchanged → STALE_REVISION via the signature. Replaying A's change on rev 2 → INVALID_INPUT, no second bump. | Pass |
| Reopen keeps history with explicit cycle age | Confirm R07–R11, resolve, then reopen on R12: same ID, revision 4, cycle = R12's sequence, timeline still R01, R05, R07–R12, ranks behind the residence | Pass |
| Resolved place, new report | A new shelter report after the shelter is resolved flags it for reassessment and shows in the band (IMPLEMENT choice 1) | Pass |
| Source-backed change descriptions | Every flag names its own message ID, cites itself first, and cites only existing reports. REPEAT cites its target R07. No flag text claims a confirmed person or a headcount. | Pass |
| Queue stability | 10 shuffles of the incident and report arrays → identical queue, band, and timeline | Pass |

### Mutation check

24 deliberate breaks of `views.ts` were applied one at a time, each run against `test/g6`, and the file restored after each (script kept out of the repo).
- **First pass:** 23 caught. One survived: treating REJECTED/STALE **suggestions** as still linking. The same check for proposals was already covered.
- **Fix:** added "reviewed suggestions stop counting" (REJECTED and STALE). That mutation is now caught: **24/24 caught.**
- **Caught:** queue ignores cycle age, ignores run, or keeps resolved incidents; unknown attention ranked first; band drops the possible-harm kind or gates it on score; rejected proposals or suggestions still link; no named-place match; late-older inverted or compared as strings; timeline in stored order; reopen keeps the old cycle or resolve resets it; no revision bump; no-op accepted; wrong run accepted; adds drop old reports; invariants skip reviewer, retransmission, or cycle start; flags skip late-older or drop the REPEAT citation; reassessment misses new evidence.

### Commands

```bash
npx tsc --noEmit -p packages/domain       # clean
npm test                                  # 897/897 (G6 120: 69 TEST + 51 REVIEW; G0 777)
npm run test:py -w @calhacks26/domain     # 486 passed
(cd spacetimedb && npx tsc --noEmit)      # clean
```

**Real providers exercised:** none. These are pure functions; there is no real DB path to run until G3. The "second window" is two views of one in-memory state through the shared `checkFreshness`. The real two-client race is G3/G8.

### Connected code: ws/web swap (`apps/web/src/adapters/derived.ts` → `@calhacks26/domain`)

Read from `origin/ws/web` and `origin/ws/web-panels`. Our API differs in four places the panels must handle:
1. `confirmedQueue(state)` takes the `DeskState`, not `state.incidents` (`ConfirmedQueue.tsx:13`).
2. `timeline()` returns `TimelineEntry {report, standing, incidentId, lateOlder, relations}`, not bare reports (`IncidentHistory.tsx`, `IncomingFeed.tsx`). Use `lateOlder` to label R11.
3. `ReviewItem` has no `proposal` field, and `reportId` is **null** for incident-level unknowns. `ReviewBand.tsx:26` keys rows by `item.reportId`; key by `kind + (reportId ?? incidentId)` instead, and look up the pending proposal from `state.proposals`.
4. The interim band counts suggestions whatever their review state. The shared one ignores reviewed ones; the swap fixes that.

IMPLEMENT choices 1–6 stand; none was contradicted by review.

### For G3 (not G6 defects)

- `applyIncidentChange` validates the incident row only. The approve/edit reducer must also check that each added report exists in the run, isn't confirmed in another incident (`checkSourceOwnership`), and passes `checkFreshness`. Then it should run `deskInvariants` in its tests after every reducer.
- Call `applyIncidentChange` only when the incident row changes. Relation-only approvals skip it, because a no-op change is INVALID_INPUT.

**G6 rules slice: REVIEW passed.**
