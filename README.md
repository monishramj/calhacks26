# Mesh Codec + Incident Desk

Help LoRa-equipped disaster teams send detailed reports and keep the most important unresolved incidents visible as new information arrives. Fictional Helene-inspired exercise; all incident messages are synthetic.

**Status:** setup only. Nothing is implemented yet.

## Start here

| If you are... | Read |
|---|---|
| Anyone, first | [`docs/GROUND_TRUTH.md`](docs/GROUND_TRUTH.md): the spec and the only planning authority |

## Computers and branches

| Laptop | Workstream | Branch |
|---|---|---|
| The codec/radio laptop | Codec + radio | `ws/codec-radio` |
| The state laptop | Contracts + state (shared contracts first) | `ws/state` |
| The inference laptop | Inference (Laya + Claude) | `ws/inference` |
| The Windows laptop | Dashboard + replay | `ws/web` |

```bash
git clone https://github.com/monishramj/calhacks26.git
cd calhacks26
git checkout ws/<your-workstream>
```

