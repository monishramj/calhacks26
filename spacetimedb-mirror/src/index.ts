// Cloud mirror of a command post's confirmed incident picture ("Version 1": one-way upload).
// The command post's local SpacetimeDB stays the only source of truth. This module only
// accepts uploads from granted uplink identities and never sends anything back: it has no
// reducer that a command post reads, and no reducer that changes confirmed state anywhere.
// Rows are the local wire JSON, byte for byte, validated against the same contract
// (packages/domain) the local desk uses.
import './url-shim';
import { schema, table, t, SenderError } from 'spacetimedb/server';
import { validateWire, type IncidentView, type Report, type ReportRelation, type ReviewEvent } from '../../packages/domain/src/index';
import { sha256Hex } from '../../packages/domain/src/sha256';

const spacetimedb = schema({
  // The publishing identity; it grants uplink identities.
  admin: table({}, { identity: t.identity().primaryKey() }),
  // Which identity uploads for which command post. The site comes from here, never from the payload.
  uploader: table({}, { identity: t.identity().primaryKey(), siteId: t.string() }),
  // One row per command post. epoch changes when the local database is wiped and starts over.
  site: table(
    { public: true },
    {
      siteId: t.string().primaryKey(),
      epoch: t.string(),
      runId: t.string(),
      runNumber: t.u32(),
      // Mirror receive time of the latest accepted upload (backend clock, not the uplink's).
      lastIngestAt: t.timestamp(),
    },
  ),
  // key = siteId/epoch/<id>. hash = sha256 of json; the uplink diffs against it to find what to send.
  mirror_report: table(
    { public: true },
    { key: t.string().primaryKey(), siteId: t.string().index('btree'), epoch: t.string(), runId: t.string(), reportId: t.string(), hash: t.string(), json: t.string() },
  ),
  mirror_incident: table(
    { public: true },
    {
      key: t.string().primaryKey(),
      siteId: t.string().index('btree'),
      epoch: t.string(),
      runId: t.string(),
      incidentId: t.string(),
      revision: t.u32(),
      hash: t.string(),
      json: t.string(),
    },
  ),
  mirror_relation: table(
    { public: true },
    { key: t.string().primaryKey(), siteId: t.string().index('btree'), epoch: t.string(), runId: t.string(), relationId: t.string(), hash: t.string(), json: t.string() },
  ),
  mirror_review_event: table(
    { public: true },
    { key: t.string().primaryKey(), siteId: t.string().index('btree'), epoch: t.string(), runId: t.string(), sequence: t.u32(), hash: t.string(), json: t.string() },
  ),
});
export default spacetimedb;

type Ctx = Parameters<Parameters<typeof spacetimedb.reducer>[1]>[0];

// One upload call. Bounded so a single reducer call stays small; the uplink chunks.
const MAX_BATCH_BYTES = 512 * 1024;
const MAX_ID = 128;

const deny = (code: string, message: string): never => {
  throw new SenderError(`${code}: ${message}`);
};

function identityFromHex(ctx: Ctx, hex: string) {
  const Identity = ctx.sender.constructor as new (hex: string) => typeof ctx.sender;
  return new Identity(hex.replace(/^0x/, ''));
}

function checkId(name: string, value: unknown): string {
  if (typeof value !== 'string' || value.length === 0 || value.length > MAX_ID || value.includes('/')) {
    deny('INVALID_INPUT', `${name} must be a non-empty id of at most ${MAX_ID} characters without '/'`);
  }
  return value as string;
}

/** Parse one local wire row and validate it against the shared contract. */
function wire<T>(type: string, raw: unknown): T {
  if (typeof raw !== 'string') deny('INVALID_INPUT', `${type}: rows are sent as the local JSON text`);
  let value: unknown;
  try {
    value = JSON.parse(raw as string);
  } catch {
    deny('INVALID_INPUT', `${type}: not valid JSON`);
  }
  const r = validateWire<T>(type, value);
  if (!r.ok) deny(r.error.code, r.error.message);
  return (r as { ok: true; value: T }).value;
}

export const init = spacetimedb.init((ctx) => {
  ctx.db.admin.insert({ identity: ctx.sender });
});

/** Admin grants an identity the right to upload for one site (one command post). */
export const grant_uploader = spacetimedb.reducer({ identityHex: t.string(), siteId: t.string() }, (ctx, { identityHex, siteId }) => {
  if (!ctx.db.admin.identity.find(ctx.sender)) deny('UNAUTHORIZED', 'only the mirror admin grants uploaders');
  checkId('siteId', siteId);
  const identity = identityFromHex(ctx, identityHex);
  if (ctx.db.uploader.identity.find(identity)) ctx.db.uploader.identity.update({ identity, siteId });
  else ctx.db.uploader.insert({ identity, siteId });
});

type Batch = {
  siteId: string;
  epoch: string;
  runId: string;
  runNumber: number;
  reports: string[];
  incidents: string[];
  relations: string[];
  reviewEvents: string[];
};

/**
 * Upload rows from the command post. Idempotent: resending a row changes nothing.
 * Reports, relations and review events are immutable here: the same key with different
 * content is a CONFLICT and the whole batch fails. An incident is replaced only by an
 * equal or newer revision; an older one (a late, out-of-order upload) is ignored, so a
 * stale upload never rolls the mirror back.
 */
export const ingest = spacetimedb.reducer({ batchJson: t.string() }, (ctx, { batchJson }) => {
  const up = ctx.db.uploader.identity.find(ctx.sender) ?? deny('UNAUTHORIZED', 'this identity is not a granted uplink');
  const siteId = up.siteId;
  if (batchJson.length > MAX_BATCH_BYTES) deny('INVALID_INPUT', `batch is over ${MAX_BATCH_BYTES} bytes; send smaller chunks`);
  let b: Batch;
  try {
    b = JSON.parse(batchJson) as Batch;
  } catch {
    return deny('INVALID_INPUT', 'batch is not valid JSON');
  }
  if (b.siteId !== siteId) deny('UNAUTHORIZED', `this uplink is granted site ${siteId}, not ${String(b.siteId).slice(0, MAX_ID)}`);
  const epoch = checkId('epoch', b.epoch);
  const runId = checkId('runId', b.runId);
  if (!Number.isInteger(b.runNumber) || b.runNumber < 1) deny('INVALID_INPUT', 'runNumber must be a positive integer');
  for (const k of ['reports', 'incidents', 'relations', 'reviewEvents'] as const) {
    if (!Array.isArray(b[k])) deny('INVALID_INPUT', `${k} must be an array`);
  }

  const site = ctx.db.site.siteId.find(siteId);
  const row = { siteId, epoch, runId, runNumber: b.runNumber, lastIngestAt: ctx.timestamp };
  if (!site) ctx.db.site.insert(row);
  else if (site.epoch === epoch && b.runNumber < site.runNumber) deny('WRONG_RUN', `site ${siteId} is already at run ${site.runNumber}`);
  else ctx.db.site.siteId.update(row);

  const prefix = `${siteId}/${epoch}/`;
  const immutable = <R extends { key: string; hash: string }>(existing: R | null | undefined, key: string, hash: string) => {
    if (existing && existing.hash !== hash) deny('CONFLICT', `${key} already mirrored with different content`);
    return !existing;
  };

  for (const raw of b.reports) {
    const r = wire<Report>('Report', raw);
    const key = prefix + checkId('reportId', r.reportId);
    const hash = sha256Hex(raw);
    if (immutable(ctx.db.mirror_report.key.find(key), key, hash)) {
      ctx.db.mirror_report.insert({ key, siteId, epoch, runId: r.input.runId, reportId: r.reportId, hash, json: raw });
    }
  }
  for (const raw of b.relations) {
    const r = wire<ReportRelation>('ReportRelation', raw);
    const key = prefix + checkId('relationId', r.relationId);
    const hash = sha256Hex(raw);
    if (immutable(ctx.db.mirror_relation.key.find(key), key, hash)) {
      ctx.db.mirror_relation.insert({ key, siteId, epoch, runId: r.runId, relationId: r.relationId, hash, json: raw });
    }
  }
  for (const raw of b.reviewEvents) {
    const e = wire<ReviewEvent>('ReviewEvent', raw);
    const key = `${prefix}${e.sequence}`;
    const hash = sha256Hex(raw);
    if (immutable(ctx.db.mirror_review_event.key.find(key), key, hash)) {
      ctx.db.mirror_review_event.insert({ key, siteId, epoch, runId: e.runId, sequence: e.sequence, hash, json: raw });
    }
  }
  for (const raw of b.incidents) {
    const v = wire<IncidentView>('IncidentView', raw);
    const key = `${prefix}${checkId('runId', v.runId)}/${checkId('incidentId', v.incidentId)}`;
    const hash = sha256Hex(raw);
    const next = { key, siteId, epoch, runId: v.runId, incidentId: v.incidentId, revision: v.revision, hash, json: raw };
    const cur = ctx.db.mirror_incident.key.find(key);
    if (!cur) ctx.db.mirror_incident.insert(next);
    else if (v.revision >= cur.revision && cur.hash !== hash) ctx.db.mirror_incident.key.update(next);
  }
});
