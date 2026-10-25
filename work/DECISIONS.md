# Decisions

Append-only. Each entry is a team-approved deviation from, or clarification of, `docs/GROUND_TRUTH.md`. Entries marked **proposed** have no effect until a human marks them **approved**.

## D-001 · approved · four workstreams instead of three developers + PM

The ground truth assumes three developers and a PM (§11, §14). We have four computers. Package B is split into `ws/state` (shared foundation, SpacetimeDB, coordinator, G6 rules) and `ws/inference` (Laya, Claude, evaluation), as §11 allows. The orchestrator agent does PM bookkeeping; humans still sign off on contracts, held-out labels, scope cuts, and pitch claims. Ownership is in `AGENTS.md`.

## D-002 · approved · repo layout

Follows §11's suggested structure, plus:
- `fixtures/private/exercise/` (§18 script and expectations) and `fixtures/private/heldout/` (≥24 §13 cases). Both are private: never model input.
- `work/status/`, `work/inbox/`, `work/BOARD.md`, `work/PREFLIGHT.md` for cross-computer coordination (`docs/ORCHESTRATOR.md`).
- `apps/coordinator/src/inference/` is owned by `ws/inference` inside a `ws/state` app.

## D-003 · approved (revised 2026-10-25 02:00 by the C4 human) · command post is C4

**C4 (this orchestrator's machine: Intel i7-11800H, x86-64 + AVX2, Windows 11) is the command post.** It hosts SpacetimeDB in Docker (D-006), the receiving radio, and the second codec endpoint. By default it also runs the coordinator, so radio intake and the database are both local there. C2 still develops the SpacetimeDB module and publishes it to C4's server over the LAN. C1 holds the first radio and codec endpoint. The Laya worker runs natively on a Mac (C3 by default) and is reached at `LOCAL_LAYA_URL` over the LAN. The owning workstreams can move the coordinator or Laya by recording it here. G0 must freeze host/port-configurable transports, never localhost-only.

_History: originally C2 was the command post; at 01:50 the second radio and codec endpoint moved to C4; at 02:00 SpacetimeDB hosting moved to C4._

## D-005 · approved (2026-10-25 01:50 by the C4 human) · pinned codec runtime binaries in git

ws/codec-radio may commit the pinned codec runtime (about 8 MB: the llama.cpp MinGW cross-build with glibc float math, Unishox2, and the Linux .so files) under `services/codec-radio/runtime/` with SHA-256 sums, because every endpoint must run the identical binary. Model weights and context files still stay outside git.

## D-004 · superseded · scene geometry source (proposal)

See the approved D-004 entry below.

## D-006 · approved (2026-10-25 by the C4 human, proposed by C2) · Docker as dev tooling

The team has two Macs (C2, C3) and two Windows machines (C1, C4). Docker is allowed as tooling, not product scope:

- **Use it for:** SpacetimeDB on the C4 command post (D-003), with a pinned image matching the version ws/state chose (2.13). Optionally also the coordinator. ws/state owns the compose file (`docker-compose.yml` at the root) and pins every image tag and digest.
- **Don't use it for:** the codec and radio bridge (C1, C4). USB serial passthrough on Docker Desktop is unreliable, and C1 showed decoding needs the identical pinned build; a Linux or emulated build on another CPU can compute different logits. The same applies to Laya on the Macs, where a Linux container loses Metal/MPS acceleration. Run those natively unless a measurement says the container is equivalent.
- **Native paths keep working.** `npm run dev:replay` never needs Docker. Docker is never a second backend or a sync layer (§4, §23).
- **Demo is offline-safe.** Pull and pin images before the demo. Nothing may download at demo time.

## D-007 · approved (2026-10-25 by the C4 human, proposed by C2, accepted by C3) · coordinator handoff

- **ws/inference owns all of `apps/coordinator/**`:** the job runner (claimJob → Laya/Claude → submitLocalSuggestion/submitIncidentProposal), the coordinator process and env shell on the C4 command post, `apps/coordinator/package.json`, and a radio-intake HTTP endpoint only if G0 picks that transport.
- **ws/state keeps:** G0 (all contracts, including the inference job input, the adapter interface, and the radio-intake transport), G3, G6 rules, and the live adapter (in a ws/state path such as `packages/live-adapter`). It also keeps **job issuing + `inputSignature`** and the **scenario injector**, both as SpacetimeDB reducers, so the same code validates freshness at submission and approval (§17) and future exercise truth stays out of the inference owner's code (§18). Plus the root `package.json`/lockfile, the root `dev:live`/`preflight` scripts, and `docker-compose.yml`.
- **Radio intake:** C2's G0 proposal is that the C4 bridge calls the `receiveReport` reducer directly with its own identity. Fallback: an HTTP POST to the coordinator, host/port from env.

## D-008 · approved (2026-10-25 by the C4 human) · replacement agents run C3

The C3 human is asleep and their computer is locked. Replacement agents take over ws/inference from what's on GitHub. Unpushed work on the C3 machine is out of reach.
- **Lead lane (`ws/inference`):** a Claude cloud session runs G5 (Claude tool loop) and the coordinator (D-007), against fixture tools until G3 is live. `ANTHROPIC_API_KEY` is set as a cloud environment secret, never committed.
- **Laya lane (`ws/inference-laya`):** Cursor on C4 runs the flyby port, weights, preflight, and G4. **The Laya worker runs natively on C4** (the command post), which amends D-003's "Laya on a Mac" default. Measurements happen on C4, the demo machine.
- When the C3 human wakes up, they rejoin through the status files and these lanes; they don't restart anything.

## D-004 · approved (2026-10-25 by the C4 human) · SF Embarcadero BLOSM scene

The scene lane (ws/web-scene) bakes a georeferenced BLOSM scene of a compact Ferry Building / Embarcadero crop in San Francisco (about 700 × 500 m, mostly flat, inside public BayMesh coverage). It may start now; the procedural scene (305272a) stays the fallback, and the Blender work stops at T+5:00. This amends §7's "fictional river-valley scene"; the incidents stay fictional. Conditions:
- **Contract unchanged:** placeId only. The georeference lives only in the scene lane's `scene-meta.json`. §18 positions stay in scene units (school at the origin, residence (80,20), shelter (-120,40), 1 unit = 1 m).
- **Markers on generic, unlabeled buildings**, never the Ferry Building or another named landmark. A fictional concern must not attach to an identifiable real place (§8).
- **No third-party Meshtastic node positions, names, or IDs.** Public coverage may only pick the area. Any coverage layer is coarse, labeled third-party reference data, and never our measured reach (§3).
- **Labels:** "Fictional Helene-inspired exercise · incidents are synthetic", plus "Map data © OpenStreetMap contributors (ODbL)" and the terrain source.
- **Offline and light:** OSM buildings and terrain only (no Google 3D Tiles), meshopt (no CDN Draco), about 3 MB, everything bundled locally.
- The heatmap floats above the terrain with a fixed scale.

## D-009 · approved (2026-10-25 02:45 by the C3 human, in the orchestrator session) · ship mode

We're behind CP2, and test work is using up the usage budget. From now until CP4:
- **No more separate TEST phases or new test suites.** Each gate is one request: implement the feature, run the real path once, write what happened in a few lines in `work/validation/`, and push. This covers Sud's 02:30 cut of the per-phase stops for C1.
- **Don't break what exists.** Tests already on `main` stay passing; delete a test only when it covers something we cut. No new tests unless a bug comes back twice.
- **Unchanged:** honest labels (live / fixture / simulated / unavailable), no secrets in git, ownership by path, and no scope additions (§4, §23). A feature that only ran against a stub is pitched as a stub.
- **Priority is the demo path:** G6 rules → G3 SpacetimeDB → live adapter in the web app → Laya suggestion → operator approval in two browsers → radio report in. Polish (textures, camera, extra scenarios) stops.
- The C4 human (manager) can overrule this.

## D-010 · approved (2026-10-25 03:10 by the C3 human) · Laya runs on C4 for the demo

The Laya worker runs natively on C4 (the command post), as in D-008, including after the C3 human returned. C3 may load Laya for development, but the demo measurements and the `LOCAL_LAYA_URL` the coordinator uses point to C4. This replaces D-003's "Laya on a Mac (C3 by default)".
