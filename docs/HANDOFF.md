# Handoff: Incident Desk

_Updated 2026-10-25. Describes the current state of branch `review`._

## What it is

Disaster teams send short text reports over LoRa radios. Reports land in a SpacetimeDB database. A local model (Laya) suggests what each report means (life-safety concern, active need, or information) and which incident it belongs to. Claude builds a working picture of each incident from the cited reports. A human operator approves or rejects every suggestion. The React/Three.js dashboard shows a 3D map, a review band for unconfirmed possible harm, a ranked queue of confirmed incidents, and the original report history.

The spec is `docs/GROUND_TRUTH.md`: ranking rules (section 5), local-first and Claude (section 6), demo script (section 8), data types (section 17), and the 12 scripted reports R01-R12 (section 18).

## Rules that are the product

- Store the original report text before any model sees it. Never edit it.
- Model confidence is not urgency. An uncertain possible harm stays flagged for review and is never silently downgraded.
- Only an operator approval changes the confirmed queue. Models only propose.
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
- `LAYA_MODEL_PATH`: the stock Laya checkpoint, reused from the flyby project (sha256 verified)
- `LAYA_SCORER_PATH` (optional): loads a fine-tuned scorer head. Off by default; it did not reduce review load.

## What works

- "Send next report" feeds R01-R12 into the database as labeled scenario reports.
- Laya suggests a meaning and an incident for each report. Model scores show in the review band, labeled as scores.
- The operator approves a suggestion: new incident or attach to an existing one, attention level, and location (taken from the place the sender stated).
- The confirmed queue syncs across browser windows.
- R07 moves the school to #1 once approved. R11 (a late, older all-clear) does not lower it.
- On each new report Claude builds a hierarchy of site, subarea, and claims, with chronology, late flags, severity, uncertainty, and cited report IDs. The dashboard shows it as "Claude's working picture (unconfirmed)", plus queue proposals the operator approves.
- Failure handling:
  - Database lost: the banner shows LOCAL DEGRADED. The last view stays, writes are disabled, and an isolated local replay runs.
  - Laya down or Claude unavailable: a notice appears and reports stay in manual review.
  - The offline path was checked with a simulated dead network.

## Known limits and next steps

1. Every Laya suggestion still goes to review. The action bar (top score ≥ 0.6, lead ≥ 0.2) was re-chosen on the fine-tune's 40-example validation split only (`services/local-laya/finetune/threshold.py`, results in `threshold.json`). No lower bar keeps at least 90% of accepted actions correct, so it stays at 0.6. On the 26 held-out cases neither stock Laya nor the fine-tuned head clears it (`evaluation/report-2026-10-25.*`, `report-2026-10-25-scorer-head.json`). Better training data is the next lever, not a lower bar.
2. Laya and Claude jobs run in separate coordinator loops, so a Claude picture (about 10 s) no longer delays Laya. Only one Claude job runs at a time.
3. `operator_edit` does not check the input signature.
4. The Laya and Claude notices are inferred from waiting jobs, not from a heartbeat.
5. The radio and codec bridge (`services/codec-radio`) is being done separately and is not wired into `dev:live`.
6. Not measured: frame rate and update latency.
   The scene is a 3D Outer Sunset map from bundled OSM data with a ground heatmap and replay playback (Play, speed, timeline). See `apps/web/src/scene/README.md`.
7. Possible additions, none started:
   - Claude ask-back questions over the radio
   - "What changed" notes
   - Shift handover brief
   - SpacetimeDB time scrubber
   - Two named operators
   - Job timeouts via scheduled reducers
   - High-volume scenario
   - Network-only view

## Branch rule

All work goes to `review`. The owner tests and pushes to `main`.

## Gotchas

- In `apps/web`, install with `npm install --workspaces=false --package-lock=false` if not installing from the root. A plain install there breaks Playwright.
- The Laya SDK silently cuts input past 512 tokens. The worker detects and flags this; keep that behavior.
- Laya choice scores with 11 or more options are uncalibrated. Keep option lists short.
