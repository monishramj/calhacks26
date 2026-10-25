# Handoff: Incident Desk

_Updated 2026-10-25. Describes the current state of branch `review`._

## What it is

Disaster teams send short text reports over LoRa radios. Reports land in a SpacetimeDB database. A local model (Laya) suggests what each report means (life-safety concern, active need, or information) and which incident it belongs to. Claude checks every Laya suggestion with its own answer. If both agree on a safe change, it confirms automatically and is labeled "Claude check"; everything else, and anything that may involve life safety, waits for a human operator. Claude also builds a working picture of each incident from the cited reports. The React/Three.js dashboard shows a 3D map, a review band for unconfirmed possible harm, a ranked queue of confirmed incidents, and the original report history.

The spec is `docs/GROUND_TRUTH.md`: ranking rules (section 5), local-first and Claude (section 6), demo script (section 8), data types (section 17), and the 12 scripted reports R01-R12 (section 18).

## Rules that are the product

- Store the original report text before any model sees it. Never edit it.
- Model confidence is not urgency. An uncertain possible harm stays flagged for review and is never silently downgraded.
- Only an operator approval, or a "Claude check" where Laya and Claude agree under the rules in section 5, changes the confirmed queue. Possible life safety, corrections, conflicts, and review requests always go to a person.
- A late, older report never overrides a newer concern (R11 does not lower R07).
- Label data honestly. Fixture, scenario, and live data look different on screen.
- The API key lives only in the root `.env`, which is gitignored. Never commit it, log it, or put it in the frontend.

## Run it

Needs Node, Docker, and (for Laya) the Python venv at `../laya-env`.

```bash
npm install
npm run dev:live      # full live demo, dashboard at http://localhost:5173
npm run dev:replay    # offline, scripted sample data, no services
npm run preflight     # check readiness; add -- --smoke for one small real Claude call
npm run evaluate      # writes evaluation/report-<date>.md and .json
npm test
```

`npm run dev:live` (`scripts/dev-live.sh`) does this in order:

1. Starts SpacetimeDB in Docker (`docker-compose.yml`).
2. Publishes the module and seeds roles and exercise places (`scripts/stdb-setup.sh`).
3. Starts the Laya worker (venv `../laya-env`, model from `LAYA_MODEL_PATH`) on port 8091.
4. Starts the coordinator (`apps/coordinator`) and the dashboard.

Anything it cannot start is printed as "unavailable"; reports then stay in manual review.

Live end-to-end test, run in `apps/web` with the stack up (spec: `tests/e2e/live-story.spec.ts`):

```bash
E2E_CHANNEL=chrome LIVE_E2E=1 npx playwright test live-story
```

## Configuration

Put keys in the root `.env` (see `.env.example`):

- `ANTHROPIC_API_KEY`
- `CLAUDE_MODEL` (currently `claude-sonnet-5-5`)
- `CLAUDE_CONCURRENCY` (optional, default 3): Claude jobs run at once. Checks go before pictures.
- `LAYA_MODEL_PATH`: the stock Laya checkpoint, reused from the flyby project (sha256 verified)
- `LAYA_SCORER_PATH` (optional): loads a fine-tuned scorer head. Off by default; it did not reduce review load.

## What works

- "Send next report" feeds R01-R12 into the database as labeled scenario reports.
- Laya suggests a meaning and an incident for each report. Model scores show in the review band, labeled as scores.
- The operator approves a suggestion: new incident or attach to an existing one, attention level, and location (taken from the place the sender stated).
- The confirmed queue syncs across browser windows.
- R07 moves the school to #1 once approved. R11 (a late, older all-clear) does not lower it.
- Claude checks each Laya suggestion (`apps/coordinator/src/inference/claude/check.ts`). When both agree on a safe change, the report confirms at once and the history shows "Claude check" with the reason. Otherwise Claude's answer is stored in the `claude_check` table for side-by-side review. The rule is `packages/domain/src/rules/autoConfirm.ts`.
- Each report's Laya and check jobs see only the open incidents at or nearest its stated place (at most ten, by exercise place position) and those incidents' confirmed reports.
- When an incident gains a confirmed report, Claude builds a hierarchy of site, subarea, and claims, with chronology, late flags, severity, uncertainty, and cited report IDs. The dashboard shows it as "Claude's working picture (unconfirmed)", plus queue proposals the operator approves.
- Failure handling:
  - Database lost: the banner shows LOCAL DEGRADED. The last view stays, writes are disabled, and an isolated local replay runs.
  - Laya down or Claude unavailable: a notice appears and reports stay in manual review.
  - The offline path was checked with a simulated dead network.

## Known limits and next steps

1. Laya alone never confirms anything. Its action bar (top score ≥ 0.6, lead ≥ 0.2) was re-chosen on the fine-tune's 40-example validation split only (`services/local-laya/finetune/threshold.py`, results in `threshold.json`). No lower bar keeps at least 90% of accepted actions correct, so it stays at 0.6. On the 26 held-out cases neither stock Laya nor the fine-tuned head clears it (`evaluation/report-2026-10-25.*`, `report-2026-10-25-scorer-head.json`). Better training data is the next lever, not a lower bar.
2. Laya and Claude jobs run in separate coordinator loops, so a Claude picture (about 10 s) does not delay Laya. Up to three Claude jobs run at once.
   - The review band does not show Claude's stored answer yet. The web needs to read the `claude_check` table (`DeskState.checks`) and show it next to Laya's.
   - Laya's input is still too long once incidents exist. In the R01-R12 live run (operator approved R01-R06, then R07-R12 sent), all six later reports passed Laya's 512-token limit with only three candidates. Laya then gives no scores, so nothing can confirm automatically and every report goes to review. Shortening Laya's prompt (fewer candidate reports, or summaries instead of full text) is the next step for real-time volume.
3. `operator_edit` does not check the input signature.
4. The Laya and Claude notices are inferred from waiting jobs, not from a heartbeat.
5. The radio and codec bridge (`services/codec-radio`) is being done separately and is not wired into `dev:live`.
6. Not measured: frame rate and update latency.
7. Possible additions, none started:
   - Claude ask-back questions over the radio
   - "What changed" notes
   - Shift handover brief
   - SpacetimeDB time scrubber
   - Two named operators
   - Job timeouts via scheduled reducers
   - Better Three.js heatmap
   - Network-only view

## Branch rule

All work goes to `review`. The owner tests and pushes to `main`.

## Gotchas

- In `apps/web`, install with `npm install --workspaces=false --package-lock=false` if not installing from the root. A plain install there breaks Playwright.
- The Laya SDK silently cuts input past 512 tokens. The worker detects and flags this; keep that behavior.
- Laya choice scores with 11 or more options are uncalibrated. Keep option lists short.
