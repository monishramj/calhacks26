# spacetimedb-mirror

**Branch:** `ws/state-cloud-mirror` (experimental, not on `main`). **Needs a team decision before merge:** it is a second SpacetimeDB database outside the command post (§4, §23, D-003). See "Scope" below.

A read-only cloud copy of a command post's **confirmed** picture, so other agencies can see it. The command post's local SpacetimeDB stays the only source of truth. The uplink (`apps/uplink`) pushes to this database only while it is reachable. Nothing ever flows back.

## What it holds

| Table | Rows |
|---|---|
| `site` | One per command post: current epoch, run, and `lastIngestAt` (mirror clock) |
| `mirror_incident` | Confirmed incidents, as the local `IncidentView` JSON |
| `mirror_report` | Only reports the confirmed picture cites. Unreviewed reports stay local |
| `mirror_review_event` | Every operator review event |
| `mirror_relation` | Confirmed report relations |

Each row keeps the local wire JSON byte for byte, plus its sha256. Keys are `siteId/epoch/<id>`. The epoch is the local database's first report time, so a wiped and republished desk never collides with what the mirror already holds.

## Rules (reducer `ingest`)

- Only an identity the admin granted with `grant_uploader(identityHex, siteId)` can upload, and only for its own site.
- Every row is validated against the shared contract (`packages/domain`), the same one the local desk uses.
- Reports, review events and relations are immutable. The same key with different content is a `CONFLICT`, and the whole batch fails.
- An incident is replaced only by an equal or newer revision. A late, older upload is a no-op, so the mirror never rolls back.
- Resending a row changes nothing (idempotent). An empty batch is a heartbeat that updates `lastIngestAt`.
- No reducer here can change anything at a command post.

## Publish

Locally, for testing (a second server on another port stands in for the cloud):

```bash
npm ci                      # root: the module imports packages/domain (ajv)
(cd spacetimedb-mirror && npm ci)
spacetime start --listen-addr 127.0.0.1:3100 --data-dir <dir>
spacetime publish --server http://127.0.0.1:3100 -p spacetimedb-mirror incident-desk-mirror
```

In the cloud: publish the same module from this folder to a hosted server. Either use Maincloud (`spacetime login`, then `spacetime publish -s maincloud -p spacetimedb-mirror <name>`) or run the pinned image from `docker-compose.yml` on any VM. The identity that publishes is the admin. Not done yet: it needs an account login by a person, and the team decision above.

## Scope

The ground truth bans a second backend and any sync layer between backends. This keeps the parts that ban protects: there is one writer, the desk never reads the mirror, nothing comes back, and the offline desk is unchanged. But it is still a second database outside the command post, and D-003 says no Maincloud. Merging needs a `work/DECISIONS.md` entry.
