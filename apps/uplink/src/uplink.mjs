// Cloud uplink ("Version 1"): one-way upload of the command post's confirmed picture to a
// cloud mirror, only while the mirror is reachable. The local SpacetimeDB stays the only
// source of truth: the uplink reads it anonymously over SQL and never calls a local reducer.
// Nothing comes back from the cloud. When the link drops, the desk is unaffected and the
// next successful cycle catches the mirror up from what the mirror itself has acknowledged.
//
//   npm run identity -w @calhacks26/uplink   # once: mint the uplink identity on the mirror
//   npm start -w @calhacks26/uplink          # loop; `once` runs a single cycle
//
// Env: MIRROR_URI, MIRROR_SITE (required); MIRROR_DATABASE (incident-desk-mirror);
// SPACETIMEDB_URI (http://127.0.0.1:3000), SPACETIMEDB_DATABASE (incident-desk);
// UPLINK_INTERVAL_MS (10000); UPLINK_TOKEN_FILE (apps/uplink/.uplink-token).
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const LOCAL_URI = (process.env.SPACETIMEDB_URI || 'http://127.0.0.1:3000').replace(/\/$/, '');
const LOCAL_DB = process.env.SPACETIMEDB_DATABASE || 'incident-desk';
const MIRROR_URI = (process.env.MIRROR_URI || '').replace(/\/$/, '');
const MIRROR_DB = process.env.MIRROR_DATABASE || 'incident-desk-mirror';
const SITE = process.env.MIRROR_SITE || '';
const INTERVAL_MS = Number(process.env.UPLINK_INTERVAL_MS || 10_000);
const TOKEN_FILE = process.env.UPLINK_TOKEN_FILE || fileURLToPath(new URL('../.uplink-token', import.meta.url));
// Matches the mirror module's per-call bound with room for the envelope.
const MAX_BATCH_BYTES = 400 * 1024;

const log = (event, extra = {}) => console.log(JSON.stringify({ event, at: new Date().toISOString(), ...extra }));
const sha256 = (text) => createHash('sha256').update(text, 'utf8').digest('hex');

async function http(url, init = {}, timeoutMs = 5000) {
  return fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
}

/** SQL over HTTP; rows come back as arrays in schema order. */
async function sql(uri, db, query) {
  const res = await http(`${uri}/v1/database/${db}/sql`, { method: 'POST', body: query });
  if (!res.ok) throw new Error(`sql ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const [result] = await res.json();
  const names = result.schema.elements.map((e) => e.name.some);
  return result.rows.map((row) => Object.fromEntries(names.map((n, i) => [n, row[i]])));
}

const quote = (s) => `'${String(s).replace(/'/g, "''")}'`;

/** Everything the mirror should hold, read from the local desk. Read-only. */
async function readLocal() {
  const q = (table) => sql(LOCAL_URI, LOCAL_DB, `SELECT * FROM ${table}`);
  const [[desk], incidents, relations, reviewEvents, reports] = await Promise.all([
    q('desk'),
    q('incident'),
    q('relation'),
    q('review_event'),
    q('report'),
  ]);
  const confirmedRelations = relations.filter((r) => JSON.parse(r.json).state === 'CONFIRMED');
  // Share only reports the confirmed picture cites; unreviewed reports stay at the command post.
  const cited = new Set();
  for (const i of incidents) for (const id of JSON.parse(i.json).confirmedReportIds) cited.add(id);
  for (const r of confirmedRelations) {
    const rel = JSON.parse(r.json);
    cited.add(rel.reportId);
    cited.add(rel.targetReportId);
  }
  for (const e of reviewEvents) for (const id of JSON.parse(e.json).sourceReportIds) cited.add(id);
  // The local database's lifetime: its first report. A wiped and republished desk gets a new epoch,
  // so its reused run and report ids never collide with what the mirror already holds.
  const first = reports.map((r) => JSON.parse(r.json).receivedAt).sort()[0];
  return {
    desk,
    epoch: first ? `e${first}` : null,
    rows: {
      reports: reports.filter((r) => cited.has(r.report_id)).map((r) => ({ id: r.report_id, json: r.json })),
      relations: confirmedRelations.map((r) => ({ id: r.relation_id, json: r.json })),
      reviewEvents: reviewEvents.map((e) => ({ id: String(e.sequence), json: e.json })),
      incidents: incidents.map((i) => {
        const v = JSON.parse(i.json);
        return { id: `${v.runId}/${v.incidentId}`, json: i.json };
      }),
    },
  };
}

const MIRROR_TABLES = { reports: 'mirror_report', relations: 'mirror_relation', reviewEvents: 'mirror_review_event', incidents: 'mirror_incident' };

/** What the mirror has acknowledged for this site and epoch: key -> hash. */
async function readMirror(epoch) {
  const acked = {};
  for (const [kind, table] of Object.entries(MIRROR_TABLES)) {
    const rows = await sql(MIRROR_URI, MIRROR_DB, `SELECT key, hash FROM ${table} WHERE site_id = ${quote(SITE)} AND epoch = ${quote(epoch)}`);
    acked[kind] = new Map(rows.map((r) => [r.key, r.hash]));
  }
  return acked;
}

async function ingest(token, batch) {
  const res = await http(
    `${MIRROR_URI}/v1/database/${MIRROR_DB}/call/ingest`,
    { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify([JSON.stringify(batch)]) },
    15_000,
  );
  if (!res.ok) throw new Error(`ingest ${res.status}: ${(await res.text()).slice(0, 300)}`);
}

let online = null;

/** One cycle. Returns what was sent, or null when the mirror or the desk is unreachable. */
export async function cycle(token) {
  const reachable = await http(`${MIRROR_URI}/v1/ping`, {}, 3000).then((r) => r.ok, () => false);
  if (!reachable) {
    if (online !== false) log('offline', { mirror: MIRROR_URI, note: 'desk unaffected; will catch up when reachable' });
    online = false;
    return null;
  }
  if (online !== true) log('online', { mirror: MIRROR_URI });
  online = true;

  let local;
  try {
    local = await readLocal();
  } catch (e) {
    log('local-unavailable', { error: String(e.message ?? e).slice(0, 200) });
    return null;
  }
  if (!local.epoch) {
    log('nothing-to-share', { note: 'no reports on the local desk yet' });
    return { sent: 0 };
  }
  const acked = await readMirror(local.epoch);
  const prefix = `${SITE}/${local.epoch}/`;
  const pending = { reports: [], relations: [], reviewEvents: [], incidents: [] };
  for (const kind of Object.keys(pending)) {
    for (const row of local.rows[kind]) {
      if (acked[kind].get(prefix + row.id) !== sha256(row.json)) pending[kind].push(row.json);
    }
  }

  // Chunk in dependency order (reports before the incidents and events that cite them).
  const base = { siteId: SITE, epoch: local.epoch, runId: local.desk.run_id, runNumber: local.desk.run_number };
  const empty = () => ({ ...base, reports: [], relations: [], reviewEvents: [], incidents: [] });
  const batches = [];
  let cur = empty();
  let size = 0;
  for (const kind of ['reports', 'relations', 'reviewEvents', 'incidents']) {
    for (const json of pending[kind]) {
      if (size + json.length > MAX_BATCH_BYTES && size > 0) {
        batches.push(cur);
        cur = empty();
        size = 0;
      }
      cur[kind].push(json);
      size += json.length;
    }
  }
  // Always send at least one call: an empty batch is the heartbeat that updates lastIngestAt.
  batches.push(cur);
  for (const b of batches) await ingest(token, b);

  const sent = Object.fromEntries(Object.entries(pending).map(([k, v]) => [k, v.length]));
  const total = Object.values(sent).reduce((a, n) => a + n, 0);
  if (total > 0) log('synced', { site: SITE, epoch: local.epoch, runId: base.runId, sent, batches: batches.length });
  return { sent: total, ...sent };
}

function readToken() {
  if (!existsSync(TOKEN_FILE)) throw new Error(`no uplink identity yet: run \`npm run identity -w @calhacks26/uplink\` first`);
  return readFileSync(TOKEN_FILE, 'utf8').trim();
}

function identityHex(token) {
  const payload = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
  return JSON.parse(Buffer.from(payload, 'base64').toString('utf8')).hex_identity;
}

async function main() {
  const cmd = process.argv[2] ?? 'loop';
  if (!MIRROR_URI || !SITE) throw new Error('set MIRROR_URI and MIRROR_SITE');
  if (cmd === 'identity') {
    if (!existsSync(TOKEN_FILE)) {
      const res = await http(`${MIRROR_URI}/v1/identity`, { method: 'POST' });
      if (!res.ok) throw new Error(`identity ${res.status}`);
      writeFileSync(TOKEN_FILE, (await res.json()).token + '\n', { mode: 0o600 });
    }
    const hex = identityHex(readToken());
    log('identity', { identity: hex, next: `mirror admin runs: spacetime call -s <mirror> ${MIRROR_DB} grant_uploader '"${hex}"' '"${SITE}"'` });
    return;
  }
  const token = readToken();
  if (cmd === 'once') {
    const r = await cycle(token);
    log('once', { result: r });
    process.exit(r ? 0 : 2);
  }
  log('start', { local: `${LOCAL_URI}/${LOCAL_DB}`, mirror: `${MIRROR_URI}/${MIRROR_DB}`, site: SITE, intervalMs: INTERVAL_MS });
  for (;;) {
    try {
      await cycle(token);
    } catch (e) {
      log('error', { error: String(e.message ?? e).slice(0, 300) });
    }
    await new Promise((r) => setTimeout(r, INTERVAL_MS));
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((e) => {
    log('fatal', { error: String(e.message ?? e) });
    process.exit(1);
  });
}
