# G6 · web (lead) · contract v1 migration

_2026-10-25, lead lane run from C3 (Claude Code). Ship mode (D-009): one request, run for real, no new suites._

- **What changed:** `apps/web/src/adapters/contract.ts` is a type-only re-export of `packages/domain/src/types` (v1.0.0). Replay adapter, panels, banner and scenario controls use v1 records (`Report`, nested `SuggestionRecord`/`ProposalRecord`, operator-only `ReviewEvent` with `acceptedChanges`, `ReportRelation`, `ScenarioState`, `inputSignatures`) and v1 commands (approve carries `inputSignature` + `baseIncidentVersions`; edit carries `changes` + `sourceReportIds`; advance carries `expectedDeliveredCount`; reset carries `runId`/`commandId`).
- **Interim:** G6 rules (`packages/domain/src/rules/views.ts`) exist only on `ws/state`, not main. `src/adapters/derived.ts` stays as the interim queue/band/timeline, now on v1 types; `confirmedQueue(state)` matches the ws/state signature. Swap when G6 merges.
- **Replay signatures are fixture:** `replay:<incident>@r<revision>`, not the backend sha256. Live signatures come from ws/state.
- **Authored starting state** is no longer a fake review event (v1 events are operator-only); the history panel labels it "Rev 0 → 1 was not an operator review: authored §18 starting state · Fixture (authored)".
- **Scenario button** reads "Send next report (#7)" (v1 keeps the script private, so no message ID before delivery).
- **Ran:** `E2E_CHANNEL=chrome npm run verify` → tsc clean, 70/70 vitest, 3/3 replay e2e. `npm run build` passes (chunk-size advisory only). Bundled Playwright Chromium is not installed on C3, so e2e ran on installed Google Chrome.
- **dev:replay once (C3, built-in browser):** banner `LOCAL REPLAY · Source: fixture · Inference: fixture · authored outputs, no model ran`. Start queue residence > shelter > school; R07 → review band (possible life-safety, unconfirmed), queue unchanged; approve → school > residence > shelter; R08–R12 delivered into the band, 12 originals in the feed, "All reports sent". All data is fixture. Live adapter, SpacetimeDB, Laya/Claude, radio: unavailable (not exercised).
