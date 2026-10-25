# Mesh Codec + Incident Desk

Help LoRa-equipped disaster teams send detailed reports and keep the most important unresolved incidents visible as new information arrives. Fictional Helene-inspired exercise; all incident messages are synthetic.

**Status:** setup only. Nothing is implemented yet.

## Start here

| If you are... | Read |
|---|---|
| Anyone, first | [`docs/GROUND_TRUTH.md`](docs/GROUND_TRUTH.md): the spec and the only planning authority |
| A coding agent or a person at a computer | [`AGENTS.md`](AGENTS.md), then your section of [`docs/WORKSTREAMS.md`](docs/WORKSTREAMS.md) |
| The orchestrator | [`docs/ORCHESTRATOR.md`](docs/ORCHESTRATOR.md) |
| Checking progress | [`work/BOARD.md`](work/BOARD.md) |

## Computers and branches

| Computer | Workstream | Branch |
|---|---|---|
| C1 | Codec + radio | `ws/codec-radio` |
| C2 | Contracts + state (G0 first) | `ws/state` |
| C3 | Inference (Laya + Claude) | `ws/inference` |
| C4 | Dashboard + replay | `ws/web` |

```bash
git clone https://github.com/monishramj/calhacks26.git
cd calhacks26
git checkout ws/<your-workstream>
```

Then paste the bootstrap prompt from `docs/WORKSTREAMS.md` into Claude Code.
