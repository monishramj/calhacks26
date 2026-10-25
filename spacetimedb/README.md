# spacetimedb

**Spec:** §9, §17 "Commands and adapter", §20 incident state

This is the one authoritative local backend. It stores reports, incidents, relations, proposals, jobs, review events, and scenario state. It provides reducers and subscriptions.

- **No model calls inside reducers.** The coordinator runs models and submits the results through reducers (§9).
- Approval checks the run, every referenced revision, `inputSignature`, and source ownership in one atomic step. A repeated `commandId` returns the recorded result. Workers cannot approve.
- Future scenario truth is never in a client-visible table.
- Pin the server and client versions after preflight. Only one owner commits the generated client bindings.
- Add indexes only where the real queue, incident-source, identity, and job lookups need them. Do not add an event-sourcing framework or a distributed queue (§17).

## Local setup

The database runs entirely on the command post laptop. It needs no Maincloud and no internet.

Tested with SpacetimeDB CLI and server **2.13.0** on macOS arm64 with Node 22. The `spacetimedb` npm package is pinned by `package-lock.json`.

1. Install the CLI with the official installer. It puts `spacetime` in `~/.local/bin`.
   ```bash
   curl -sSf https://install.spacetimedb.com | sh
   ```
2. Point the CLI at the local server, so nothing publishes to Maincloud by accident.
   ```bash
   spacetime server set-default local
   ```
3. Start the server in its own terminal or in the background. It listens on `0.0.0.0:3000`, so a second operator laptop on the same cable or offline router can connect.
   ```bash
   spacetime start
   ```
4. Install, build, and publish from this folder. `spacetime.json` sets the server (`local`) and the database name (`incident-desk`).
   ```bash
   cd spacetimedb
   npm ci
   spacetime publish
   ```
5. Check that it works.
   ```bash
   spacetime sql incident-desk "SELECT * FROM person"
   spacetime logs incident-desk
   ```

`src/index.ts` is the incident state module. It holds the tables, reducers, roles, and freshness rules. `smoke.py` runs the incident state checks again against a freshly published database.
