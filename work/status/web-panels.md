# Status · ws/web-panels (lane of ws/web)

_Updated: 2026-10-25 by the lead lane (Claude Code). Cursor is backup for this lane._

- **Gate / phase:** G6 UI, TEST + IMPLEMENT green (`work/validation/G6-panels.md`). REVIEW not started.
- **Exact next step:** G6 REVIEW for panels, then bind to `packages/domain` rules once `[contract] v1` lands.
- **Run:** `cd apps/web && npm install && npm run dev:replay`; tests `npx vitest run src/panels`.
- **Owns:** `apps/web/src/panels/**` only. Data via `useDesk()`; ordering via `src/adapters/derived.ts`.
