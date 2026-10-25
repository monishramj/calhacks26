# Mesh Codec + Incident Desk

This project helps disaster teams that use LoRa radios. Teams can send detailed reports. The desk keeps the most important unresolved incidents visible as new information arrives. It is a fictional exercise inspired by Hurricane Helene. All incident messages are synthetic.

**Status:** setup only. Nothing is implemented yet.

## Start here

Read [`docs/GROUND_TRUTH.md`](docs/GROUND_TRUTH.md) first. It is the spec and the only planning authority. For the current state of the work, read [`docs/HANDOFF.md`](docs/HANDOFF.md).

## Get the code

```bash
git clone https://github.com/monishramj/calhacks26.git
cd calhacks26
```

## Run

`npm run preflight` reports ready or not ready for `npm run dev:live` (add `-- --smoke` for one tiny real Claude call). `npm run evaluate` runs the held-out Laya cases against a running worker (`EVAL_LAYA_URL`, default `LOCAL_LAYA_URL`) and the codec size comparison, and writes `evaluation/report-<date>.md` and `.json`.
