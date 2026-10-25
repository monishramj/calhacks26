# spacetimedb

**Owner:** ws/state (C2) · **Gates:** G3, G8 backend · **Spec:** §9, §17 "Commands and adapter", §20 G3

The one authoritative local backend: reports, incidents, relations, proposals, jobs, review events, scenario state. It provides reducers and subscriptions.

- **No model calls inside reducers.** The coordinator runs models and submits results through reducers (§9).
- Approval validates the run, every referenced revision, `inputSignature`, and source ownership atomically. Repeated `commandId`s return the recorded result. Workers can't approve.
- Future scenario truth is never in a client-visible table.
- Pin the server/client pair after preflight. Generated client bindings are committed by ws/state only.
- Indexes only where the actual queue, incident-source, identity, and job lookups need them. No event-sourcing framework or distributed queue (§17).

## Local setup

Runs entirely on the command post laptop. No Maincloud, no internet.

Tested with SpacetimeDB CLI and server **2.13.0** on macOS arm64, Node 22. The `spacetimedb` npm package is pinned by `package-lock.json`.

1. Install the CLI (official installer, puts `spacetime` in `~/.local/bin`):
   ```bash
   curl -sSf https://install.spacetimedb.com | sh
   ```
2. Point the CLI at the local server so nothing publishes to Maincloud by accident:
   ```bash
   spacetime server set-default local
   ```
3. Start the server in its own terminal or in the background. It listens on `0.0.0.0:3000`, so a second operator laptop on the same cable or offline router can connect.
   ```bash
   spacetime start
   ```
4. Install, build, and publish from this folder. `spacetime.json` supplies the server (`local`) and database name (`incident-desk`).
   ```bash
   cd spacetimedb
   npm ci
   spacetime publish
   ```
5. Check it:
   ```bash
   spacetime sql incident-desk "SELECT * FROM person"
   spacetime logs incident-desk
   ```

`src/index.ts` is still the `spacetime init --lang typescript` template (a `person` table, `add`, `sayHello`). It's a placeholder that proves the toolchain works. G3 TEST/IMPLEMENT replaces it with the §9 records.
