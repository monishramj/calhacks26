# apps/uplink

One-way upload of the command post's confirmed picture to the cloud mirror (`spacetimedb-mirror/`). It does this only while the mirror is reachable. Experimental branch `ws/state-cloud-mirror`.

- Reads the local desk anonymously over SQL. It never calls a local reducer and has no local role.
- Each cycle, it asks the mirror what it already holds for this site and epoch (key and hash), and sends only what differs. The mirror's own acknowledged state is the cursor, so there is no local outbox to lose or corrupt.
- When the mirror is unreachable, it logs `offline` once and does nothing. The desk is unaffected. The first cycle after the link returns catches up.
- It shares confirmed incidents, review events, confirmed relations, and only the reports those cite.

```bash
export MIRROR_URI=https://<mirror-host> MIRROR_SITE=cp-sunset   # plus SPACETIMEDB_URI / _DATABASE if not local defaults
npm run identity -w @calhacks26/uplink   # once: mints apps/uplink/.uplink-token (gitignored), prints the grant command
# mirror admin: spacetime call -s <mirror> incident-desk-mirror grant_uploader '"<hex>"' '"cp-sunset"'
npm start -w @calhacks26/uplink          # loop every UPLINK_INTERVAL_MS (10 s); `npm run once` for one cycle
```

Exit codes for `once`: 0 synced or nothing to do, 2 mirror or desk unreachable, 1 refused (for example, not granted).

Check against two real servers (fresh publishes, same publisher for both):

```bash
LOCAL_URI=http://127.0.0.1:3000 MIRROR_URI=http://127.0.0.1:3100 OPERATOR_TOKEN=<publisher token> python3 apps/uplink/check.py
```

## Evidence (2026-10-25)

Real providers, both local on one Mac: two native SpacetimeDB 2.13.0 servers (commit 08e1aba). The desk ran on :3000 with `spacetimedb/` from `main` 8e3bbe9. The stand-in "cloud" ran on :3100 with this module.

- `check.py`: **23/23 PASS**.
  - Ungranted uplink refused.
  - First sync sends report, review event, and incident. A repeat sends nothing.
  - Mirror rows are byte-identical to local.
  - Offline cycle exits 2 while the desk keeps accepting reports and edits.
  - Catch-up sends only the delta. The unreviewed report is not shared.
  - Uplink makes no local writes. A stale revision is a no-op.
  - Changed report text gives `CONFLICT`. Another site gives `UNAUTHORIZED`. A row outside the contract gives `INVALID_INPUT`.
- **Real outage:** the cloud server process was stopped. The desk accepted a report and an operator edit (incident at rev 3), and the uplink logged `offline` (exit 2). The server was restarted on the same data dir: earlier mirror rows were still there. One cycle sent 3 reports, 3 review events, and the rev 3 incident.

**Not exercised:**
- A real hosted server (Maincloud or a VM) and real internet loss.
- The `start` loop over a long period.
- Republishing the local desk with `-c` (new epoch) against a live mirror. That path is designed, not run.
- `dev:live` does not start the uplink.
