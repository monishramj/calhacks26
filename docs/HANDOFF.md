# Handoff: finish the Incident Desk demo

_Written 2026-10-25 about 03:30 PDT for a new agent picking this up. Start here._

## The project in one paragraph

Disaster teams with LoRa radios send short text reports. Our codec compresses each report so it fits the radio, and the command post decodes it. Reports land in a SpacetimeDB database. A local model (Laya) suggests what each report means (life-safety concern, active need, or information) and which incident it belongs to. When internet is available, Claude drafts a short incident summary that cites its sources. A human operator approves or rejects every suggestion. A React/Three.js dashboard shows a 3D map on the left and, on the right, a pinned review band (unconfirmed possible harm), a ranked queue of confirmed incidents, and the full history of original reports.

The full spec is `docs/GROUND_TRUTH.md`. The parts that matter: §5 (ranking rules), §6 (local-first + Claude), §8 (the demo script), §17 (data types), §18 (the 12 scripted reports R01–R12).

## How to work now

The owner wants this **finished, fast, with minimal process**:

- Build the features. Do not write new test suites. Keep the existing tests passing.
- Work on one branch and merge to `main` yourself. The other agents are stopped.
- Talk to the owner in plain technical English.
- Keep these rules from the spec. They are the product:
  - Store the original report text before any model sees it, and never edit it.
  - Model confidence is not urgency. An uncertain possible harm stays flagged for review; it is never silently downgraded.
  - Only an operator approval changes the confirmed queue. Models only propose.
  - A late, older report never overrides a newer concern (R11 vs R07).
  - Label data honestly. Fixture, scenario, and live data must look different on screen.
  - The API key lives only in `.env` on the machine running the coordinator. Never commit it, log it, or put it in the frontend.
- **Out of scope for you:** the radio step. The owner handles it separately. In the demo, R01 can be typed in as labeled scenario input.

## What exists

| Piece | Where | State |
|---|---|---|
| Shared data types + JSON Schema (TS and Python) | `packages/domain` on `main` | Done, contract v1.0.0 |
| Ranking/review rules (`confirmedQueue`, `reviewBand`, `timeline`, `changeFlags`, `applyIncidentChange`…) | `packages/domain/src/rules/views.ts` on branch `ws/state` (51a9238) | Done, not on `main` yet |
| Dashboard: SF waterfront 3D map, heatmap, review band, queue, report history, Approve/Reject/Override, LOCAL REPLAY mode | `apps/web` on `main` | Done, runs on scripted sample data only |
| SpacetimeDB module: tables + reducers for reports, incidents, jobs, suggestions, proposals, approvals, reset | `spacetimedb/src/index.ts` on branch `ws/state-spacetimedb` (a5198d8) | Done; worked once against a real local SpacetimeDB 2.13 in Docker on the Mac |
| Laya worker: HTTP `POST /suggest` (JobInput → LocalSuggestion), `GET /health`, port 8091 | `services/local-laya` on branch `ws/inference-laya` (9065817) | Works; **one known bug** (below) |
| Alternate Laya worker from the Windows laptop | branch `ws/inference-laya-c4` (8780619) | Not tested on the real model. Owner leaning toward 9065817 + bug fix |
| Coordinator: watches jobs, calls Laya and Claude, writes proposals back | `apps/coordinator` on branch `ws/inference` (9564c21) | **Half-written WIP, never run.** Has `runner.ts`, `fixtureBackend.ts`, `inference/claude/enrich.ts`, `main.ts` |
| Codec + radio bridge | `services/codec-radio` on branch `ws/codec-radio` | Done in code; radio run is the owner's job |

Local checkouts on the owner's Mac (`~/Documents/Code/`): `calhacks26-main` (main), `calhacks26` (ws/inference), `calhacks26-stdb` (ws/state-spacetimedb), `calhacks26-web` (ws/web, already merged), `calhacks26-inference-laya` (ws/inference-laya).

## Run what exists

```bash
cd calhacks26-main
npm install --package-lock=false   # main's root lockfile is stale (missing the web package)
npm run dev:replay                 # http://localhost:5173, LOCAL REPLAY with sample data
```

Click "Send next report" through #7 (R07). It appears in the review band, the school gets "needs reassessment", and Approve moves the school to #1. That's the core behavior. Today it runs on sample data only.

## What's left, in order

**Decision already leaning one way:** run the whole demo on the owner's Mac (database, Laya, coordinator, dashboard), so nothing depends on other laptops or Wi-Fi. Confirm with the owner before downloading Laya's weights (a few GB).

1. **Merge to one branch.** Bring `ws/state` (rules) and `ws/state-spacetimedb` (module) into `main`. Then bring `ws/inference` (coordinator WIP) and `ws/inference-laya` (worker). Fix the root `package-lock.json` (run `npm install` at the root and commit the lockfile).
2. **Start the database and deploy the module.** The Docker recipe that worked on the Mac:
   ```bash
   docker run -d --name stdb -p 3000:3000 -v "$PWD:/repo" clockworklabs/spacetime:v2.13.0@sha256:dc66a9d8d48b210f6b9c1f2c5d6aa47adbada5e37350f898782a59c2d9f9d1b8 start --listen-addr 0.0.0.0:3000
   docker exec -u root stdb sh -c 'printf "#!/bin/sh\nexit 0\n" > /usr/local/bin/node && chmod +x /usr/local/bin/node'   # image has no node; build only uses it for tsc --noEmit
   docker exec -w /repo/spacetimedb stdb spacetime publish --server http://127.0.0.1:3000 -y -c incident-desk
   OPERATOR_TOKEN=$(docker exec stdb spacetime login show --token | grep -o 'eyJ[A-Za-z0-9._-]*') python3 spacetimedb/smoke.py
   ```
   The publishing identity is the first operator. It grants `worker`, `simulator` and `bridge` roles with the `grant_role(identityHex, role)` reducer. Reducer args are one JSON string of the contract command. Errors come back as HTTP 530 with body `CODE: message`. `docker-compose.yml` is broken (permission denied on the data volume); either fix it (`user: root` or drop the named volume) or use the command above.
3. **Connect the dashboard to the database (biggest piece).**
   - Generate TS bindings: `spacetime generate --lang typescript --out-dir apps/web/src/adapters/live/module_bindings -p spacetimedb`.
   - Write a live adapter in `apps/web/src/adapters/live/` with the same interface as the replay adapter (`apps/web/src/adapters/`: `subscribeState`, `approveProposal`, `rejectProposal`, `operatorEdit`, …). Subscribe to the tables, rebuild the desk state, and call the reducers.
   - Switch `apps/web/src/adapters/derived.ts` to the rules in `packages/domain/src/rules`.
   - The mode banner should say LIVE. Open two browser windows and check that an approval in one shows up in the other.
4. **"Send next report" in live mode.** Feed R01–R12 (from `fixtures/private/exercise/`, authored text only) into `receive_report` one at a time under the `simulator` role, labeled origin `scenario`. Simplest version: the button calls `receive_report` with the next report. A scenario reducer is optional. Never send the expected labels or future reports to any model.
5. **Fix the Laya bug.** On the real model, a low-confidence possible-harm report came back as `INFORMATION`. It must come back as `POSSIBLE_LIFE_SAFETY` or `null` (needs review). The failing check is `services/local-laya/tests/test_g4_real_model.py:59`. Fix it in `laya_worker/suggest.py`: when harm is plausible but uncertain, return null or POSSIBLE_LIFE_SAFETY, never downgrade. Real-model setup is in `services/local-laya/README.md` (`tools/setup_laya.py` downloads the pinned checkpoint). Run:
   ```bash
   PYTHONPATH=services/local-laya ../laya-env/bin/python -m laya_worker.server --host 0.0.0.0 --port 8091
   ```
6. **Finish the coordinator.** `apps/coordinator`, started with `npm start` (reads `../../.env`).
   - Loop: connect to SpacetimeDB with the `worker` identity, `issue_incident_job`/`claim_job`, POST the job's `JobInput` to `LOCAL_LAYA_URL/suggest`, then `submit_local_suggestion`.
   - Replace `fixtureBackend.ts` with the real SpacetimeDB client.
   - If Laya is down, reports stay visible for manual review. Don't fake a suggestion.
7. **Claude summary.** The owner will provide `ANTHROPIC_API_KEY`; put it in `.env` with `CLAUDE_MODEL`. The `.env.example` at the repo root lists every variable. `apps/coordinator/src/inference/claude/enrich.ts` has the start of the tool loop. Rules:
   - Tools are exactly `readIncident`, `readReports`, `listCandidateIncidents`, `submitIncidentProposal`. No approve tool.
   - Every claim in the summary cites report IDs, and the result is submitted as a proposal for the operator.
   - Trigger it only on conflicts, corrections or an operator request, never on every packet.
   - Limits: 4 model responses, 8 tool calls, 20 s.
8. **One start command.** Add a root `npm run dev:live` (or a short script) that starts the database container, the Laya worker, the coordinator and the dashboard, and prints what's unavailable.

Rough time: steps 1–2 about 30 min; step 3 about 1–1.5 h; steps 4–6 about 1 h; step 7 about 45 min. About 3 h total.

## Done means

On the owner's Mac, `npm run dev:live`, two browser windows:
1. "Send next report" delivers R01–R06; Laya suggestions show in the review band with their model scores labeled as scores.
2. R07 shows up as a possible life-safety concern in the review band, including with the Wi-Fi off.
3. The operator approves it; the school moves to #1 in **both** windows.
4. R11 (an older all-clear arriving late) does not take the school back down.
5. With internet on, a Claude summary appears as a proposal with report IDs cited.
6. The banner says LIVE; fixture, scenario and model outputs are labeled as such.

## Known gotchas

- Inside `apps/web`, install with `npm install --workspaces=false --package-lock=false` if you're not installing from the root. A plain install there breaks Playwright.
- The Laya SDK silently cuts input past 512 tokens. The worker detects and flags this; keep that behavior.
- Laya's "choice" scores with 11+ options are uncalibrated. Keep the option lists short.
