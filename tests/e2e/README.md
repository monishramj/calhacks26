# tests/e2e

**Command:** `npm run test:e2e`

These tests cover the browser story (the §8 demonstration), two-client agreement on the real database, and failure injection. The failures are: Claude offline, Laya down, database killed, reconnect, and unfamiliar text. Tests against real services record which providers were actually running.
