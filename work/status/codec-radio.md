# Status · ws/codec-radio (C1)

_Updated: 2026-10-24 by repo setup_

## Now

- **Gate / phase:** hour-0 setup, then G1 / not started
- **Last commit:** initial scaffold
- **Exact next step:** import the kit codec into `services/codec-radio/` unchanged as its own commit (record the zip hash), then do the hour-0 preflight in `docs/WORKSTREAMS.md`.

## How to run what exists

Nothing yet.

## Preflight (§19)

| Item | Result | Evidence / versions |
|---|---|---|
| Radio 1: firmware, preset, serial port | unknown | |
| Radio 2: firmware, preset, serial port | unknown | |
| Codec model file + shared context hashes (endpoint A) | unknown | |
| Codec model file + shared context hashes (endpoint B) | unknown | |
| Codec runtime build runs on both endpoints | unknown | |
| Meshtastic SDK path and actual payload ceiling | unknown | |

## Blockers

None.

## Needs from others

- ws/state: frozen `ReportInput` and envelope contract (G0) before G2 integration.

## Inbox acknowledged

None.
