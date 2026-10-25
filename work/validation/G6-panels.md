# G6 UI · panels lane (ws/web-panels)

_2026-10-25 · lead lane (Claude Code) with two subagents; Cursor idle as backup._

## Scope

`apps/web/src/panels/**`: incoming feed, pinned review band, confirmed queue, selected incident history, review/override controls.

## Phase: TEST + IMPLEMENT (combined for M1 speed; REVIEW pending)

| Command | Result |
|---|---|
| `cd apps/web && npx tsc -b --noEmit` | clean |
| `cd apps/web && npx vitest run` | 28 passed (17 panels, 9 replay adapter, 2 shell) |

Behaviors covered: originals verbatim with provenance labels; sent / event / receive times shown separately, null shown as "not given"; late R11 flagged as arrived late; review band holds unconfirmed R07 while the confirmed queue is unchanged; approve moves INC-school to rank 1; reject and override both require a reason; STALE_REVISION shown on a stale approval; every color has a written label; keyboard selection.

## Real / mocked / unavailable

- **Data:** browser replay adapter over the §18 fixture (authored, labeled `fixture`). No live backend.
- **Ordering:** interim `apps/web/src/adapters/derived.ts`, to be swapped for `packages/domain/src/rules` (ws/state G6). Not yet checked against ws/state's rules.
- **Unavailable:** live SpacetimeDB, Laya, Claude.

## Still to do (REVIEW)

Independent reorder of arrivals, stale approval from a second window, check against ws/state's rules.
