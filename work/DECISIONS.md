# Decisions

Append-only. Each entry is a team-approved deviation from, or clarification of, `docs/GROUND_TRUTH.md`. Entries marked **proposed** have no effect until a human marks them **approved**.

## D-001 · approved · four workstreams instead of three developers + PM

The ground truth assumes three developers and a PM (§11, §14). We have four computers. Package B is split into `ws/state` (shared foundation, SpacetimeDB, coordinator, G6 rules) and `ws/inference` (Laya, Claude, evaluation), as §11 allows. The orchestrator agent does PM bookkeeping; humans still sign off on contracts, held-out labels, scope cuts, and pitch claims. Ownership is in `AGENTS.md`.

## D-002 · approved · repo layout

Follows §11's suggested structure, plus:
- `fixtures/private/exercise/` (§18 script and expectations) and `fixtures/private/heldout/` (≥24 §13 cases). Both are private: never model input.
- `work/status/`, `work/inbox/`, `work/BOARD.md`, `work/PREFLIGHT.md` for cross-computer coordination (`docs/ORCHESTRATOR.md`).
- `apps/coordinator/src/inference/` is owned by `ws/inference` inside a `ws/state` app.

## D-003 · approved (revised 2026-10-25 01:50 by the C4 human) · command post and radio endpoints

C2's computer runs SpacetimeDB, the coordinator, and the Laya worker. The **second radio and second codec endpoint are on C4** (Intel i7-11800H, x86-64 + AVX2, Windows 11). C1 holds the first radio and codec endpoint. Radio intake is a LAN hop: the C4 bridge sends verified `ReportInput` to the C2 coordinator, and G0 must freeze that transport.

## D-005 · approved (2026-10-25 01:50 by the C4 human) · pinned codec runtime binaries in git

ws/codec-radio may commit the pinned codec runtime (about 8 MB: the llama.cpp MinGW cross-build with glibc float math, Unishox2, and the Linux .so files) under `services/codec-radio/runtime/` with SHA-256 sums, because every endpoint must run the identical binary. Model weights and context files still stay outside git.

## D-004 · proposed · scene geometry source

§7 calls for "one simple fictional river-valley scene." Proposal from ws/web: bake a static scene once in Blender (BLOSM, OpenStreetMap buildings + terrain) and bundle it as a local glTF. Incident data stays fictional and labeled. Needs a decision on whether real-world geometry is acceptable, and which location (not a Helene-affected place). Details: `apps/web/SCENE_PIPELINE.md`. Until approved, the procedural placeholder scene is the default.

## D-006 · approved (2026-10-25 by the C4 human, proposed by C2) · Docker as dev tooling

The team has two Macs (C2, C3) and two Windows machines (C1, C4). Docker is allowed as tooling, not product scope:

- **Use it for:** local SpacetimeDB, with a pinned image matching the version ws/state chose (2.13). Optionally also the coordinator. ws/state owns the compose file (`docker-compose.yml` at the root) and pins every image tag and digest.
- **Don't use it for:** the codec and radio bridge (C1, C4). USB serial passthrough on Docker Desktop is unreliable, and C1 showed decoding needs the identical pinned build; a Linux or emulated build on another CPU can compute different logits. The same applies to Laya on the Macs, where a Linux container loses Metal/MPS acceleration. Run those natively unless a measurement says the container is equivalent.
- **Native paths keep working.** `npm run dev:replay` never needs Docker. Docker is never a second backend or a sync layer (§4, §23).
- **Demo is offline-safe.** Pull and pin images before the demo. Nothing may download at demo time.
