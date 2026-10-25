// G3 incident desk module (§9, §17). Authoritative local state; no model calls here.
// Contract rules come from packages/domain so live and replay validate the same way.
// Nested contract records are stored as their exact wire JSON in `json` columns, with
// a few plain columns for the lookups the queue, sources, identities and jobs need.
import './url-shim';
import { schema, table, t, SenderError } from 'spacetimedb/server';
import {
  acceptReport,
  applyIncidentChange,
  authorize,
  autoConfirmDecision,
  buildJobInput,
  changeFlags,
  checkFreshness,
  checkPicture,
  checkProviderAllowed,
  checkSourceOwnership,
  citedReportIds,
  classifyIntake,
  computeInputSignature,
  nearestOpenIncidents,
  parseWire,
  recallCommand,
  recordCommand,
  validateWire,
  type ApproveProposalCommand,
  type ChangeField,
  type ClaudeCheck,
  type ClaimJobCommand,
  type DeskState,
  type IncidentChange,
  type IncidentPicture,
  type IncidentProposal,
  type IncidentView,
  type Job,
  type JobInput,
  type JobKind,
  type OperatorEditCommand,
  type ProposalRecord,
  type RejectProposalCommand,
  type Report,
  type ReportInput,
  type ReportRelation,
  type PlacePosition,
  type ResetRunCommand,
  type Result,
  type ReviewEvent,
  type SubmitClaudeCheckCommand,
  type SubmitIncidentPictureCommand,
  type SubmitIncidentProposalCommand,
  type SubmitLocalSuggestionCommand,
  type SuggestionRecord,
} from '../../packages/domain/src/index';

const spacetimedb = schema({
  // Singleton (id 0): the active run. Reset starts a new run; old rows stay as history.
  // newIncidentSignature: what an operator-authored proposal for a not-yet-existing incident copies.
  desk: table(
    { public: true },
    { id: t.u32().primaryKey(), runId: t.string(), runNumber: t.u32(), mode: t.string(), newIncidentSignature: t.string() },
  ),
  // Backend-verified caller roles. Private: clients learn their own role by trying.
  role: table({}, { identity: t.identity().primaryKey(), role: t.string() }),
  // json = Report: backend-assigned reportId/receiveSequence/receivedAt + the original input, unchanged.
  report: table(
    { public: true },
    {
      reportId: t.string().primaryKey(),
      runId: t.string().index('btree'),
      receiveSequence: t.u32(),
      sourceId: t.string(),
      messageId: t.string(),
      json: t.string(),
    },
  ),
  incident: table({ public: true }, { incidentId: t.string().primaryKey(), runId: t.string().index('btree'), json: t.string() }),
  relation: table({ public: true }, { relationId: t.string().primaryKey(), runId: t.string().index('btree'), json: t.string() }),
  suggestion: table({ public: true }, { suggestionId: t.string().primaryKey(), runId: t.string().index('btree'), json: t.string() }),
  // scopeJson: incidents + target report the proposal's inputSignature covers.
  proposal: table(
    { public: true },
    { proposalId: t.string().primaryKey(), runId: t.string().index('btree'), scopeJson: t.string(), json: t.string() },
  ),
  job: table(
    { public: true },
    {
      jobId: t.string().primaryKey(),
      runId: t.string().index('btree'),
      state: t.string(),
      // Scope the signature is computed over: incidents and target report (JSON).
      scopeJson: t.string(),
      json: t.string(),
      // JobInput as of the latest claim; empty until claimed.
      inputJson: t.string(),
    },
  ),
  review_event: table({ public: true }, { sequence: t.u32().primaryKey(), runId: t.string().index('btree'), json: t.string() }),
  // Claude working picture per incident (IncidentPicture JSON). Unconfirmed working state, never the queue.
  incident_picture: table({ public: true }, { incidentId: t.string().primaryKey(), runId: t.string().index('btree'), json: t.string() }),
  // Current inputSignature per incident (DeskState.inputSignatures) for operator-authored proposals.
  incident_signature: table({ public: true }, { incidentId: t.string().primaryKey(), runId: t.string(), signature: t.string() }),
  // Idempotency ledger: repeated commandIds return the recorded result.
  command: table({ public: true }, { commandId: t.string().primaryKey(), fingerprint: t.string(), resultJson: t.string() }),
  // Claude's check (ClaudeCheck JSON) per report Laya suggested on, for side-by-side review. Never the queue.
  claude_check: table({ public: true }, { reportId: t.string().primaryKey(), runId: t.string().index('btree'), json: t.string() }),
  // positionJson: {x, z} in exercise map units, or null. Used only to pick the nearest candidate incidents.
  place: table({ public: true }, { placeId: t.string().primaryKey(), aliasesJson: t.string(), positionJson: t.string() }),
  counter: table({}, { name: t.string().primaryKey(), value: t.u32() }),
});
export default spacetimedb;

type Ctx = Parameters<Parameters<typeof spacetimedb.reducer>[1]>[0];

const RUN_MODE = 'live';
const LEASE_MICROS = 60_000_000n;
// A claim that lapses this many times is FAILED, so one bad job cannot block its incident forever.
const MAX_JOB_ATTEMPTS = 3;

// Contract errors surface to callers as "CODE: message" (the reducer call fails, nothing commits).
function must<T>(r: Result<T>): T {
  if (!r.ok) throw new SenderError(`${r.error.code}: ${r.error.message}`);
  return r.value;
}
const deny = (code: string, message: string): never => {
  throw new SenderError(`${code}: ${message}`);
};

function next(ctx: Ctx, name: string): number {
  const row = ctx.db.counter.name.find(name);
  const value = (row?.value ?? 0) + 1;
  if (row) ctx.db.counter.name.update({ name, value });
  else ctx.db.counter.insert({ name, value });
  return value;
}

function desk(ctx: Ctx) {
  return ctx.db.desk.id.find(0)!;
}

function roleOf(ctx: Ctx): string {
  return ctx.db.role.identity.find(ctx.sender)?.role ?? 'none';
}

function allow(ctx: Ctx, method: string, extra?: { origin?: string; provider?: string }) {
  must(authorize(roleOf(ctx), method, extra));
}

function sameRun(runId: string, active: string) {
  if (runId !== active) deny('WRONG_RUN', `command is for run ${runId}, active run is ${active}`);
}

// ---- state ---------------------------------------------------------------------------------

function loadState(ctx: Ctx, runId: string): DeskState {
  const parse = <T>(rows: Iterable<{ json: string }>) => [...rows].map((r) => JSON.parse(r.json) as T);
  return {
    runId,
    mode: 'LIVE',
    reports: parse<Report>(ctx.db.report.runId.filter(runId)).sort((a, b) => a.receiveSequence - b.receiveSequence),
    incidents: parse<IncidentView>(ctx.db.incident.runId.filter(runId)),
    relations: parse<ReportRelation>(ctx.db.relation.runId.filter(runId)),
    suggestions: parse<SuggestionRecord>(ctx.db.suggestion.runId.filter(runId)),
    proposals: parse<ProposalRecord>(ctx.db.proposal.runId.filter(runId)),
    reviewEvents: [],
    scenario: null,
    inputSignatures: {},
  };
}

// confirmedOnly: Laya and Claude-check jobs see only the target and the candidates' confirmed reports.
// suggestionId: the Laya suggestion a LOCAL_CHECK job checks.
type Scope = { incidentIds: string[]; targetReportId: string | null; confirmedOnly?: boolean; suggestionId?: string };

/**
 * Relevant reports for a scope: the target, every confirmed report of the scoped
 * incidents, and (unless confirmedOnly) every unconfirmed report that the shared G6 rules
 * flag as affecting them (pending links, named place). So a new pending correction makes
 * results stale, not only a confirmed revision change (§17).
 */
function relevantReports(state: DeskState, scope: Scope): Report[] {
  const ids = new Set<string>(scope.targetReportId ? [scope.targetReportId] : []);
  for (const incidentId of scope.incidentIds) {
    const incident = state.incidents.find((i) => i.incidentId === incidentId);
    if (!incident) continue;
    incident.confirmedReportIds.forEach((id) => ids.add(id));
    if (!scope.confirmedOnly) changeFlags(state, incidentId).forEach((f) => ids.add(f.reportId));
  }
  return state.reports.filter((r) => ids.has(r.reportId));
}

function revisions(state: DeskState, incidentIds: string[]): Record<string, number> {
  return Object.fromEntries(state.incidents.filter((i) => incidentIds.includes(i.incidentId)).map((i) => [i.incidentId, i.revision]));
}

const emptySignature = (runId: string) => computeInputSignature({ runId, orderedReportIds: [], incidentRevisions: {} });

function signatureFor(state: DeskState, scope: Scope): string {
  return computeInputSignature({
    runId: state.runId,
    orderedReportIds: relevantReports(state, scope).map((r) => r.reportId),
    incidentRevisions: revisions(state, scope.incidentIds),
  });
}

/** Current revisions for freshness checks: every incident of the run. */
function freshness(state: DeskState, scope: Scope) {
  return {
    activeRunId: state.runId,
    incidentRevisions: Object.fromEntries(state.incidents.map((i) => [i.incidentId, i.revision])),
    inputSignature: signatureFor(state, scope),
  };
}

/** Recompute DeskState.inputSignatures after every mutation. */
// ponytail: recomputes every incident each write; fine at exercise scale (tens of reports), index by incident if it grows.
function refreshSignatures(ctx: Ctx) {
  const runId = desk(ctx).runId;
  const state = loadState(ctx, runId);
  for (const i of state.incidents) {
    const signature = signatureFor(state, { incidentIds: [i.incidentId], targetReportId: null });
    const row = ctx.db.incident_signature.incidentId.find(i.incidentId);
    if (row) ctx.db.incident_signature.incidentId.update({ ...row, runId, signature });
    else ctx.db.incident_signature.insert({ incidentId: i.incidentId, runId, signature });
  }
}

function knownReports(state: DeskState) {
  return new Map(state.reports.map((r) => [r.reportId, { runId: r.input.runId }]));
}

/** A report confirmed in one incident cannot be added to another. */
function checkNotConfirmedElsewhere(state: DeskState, incidentId: string, reportIds: string[]) {
  for (const i of state.incidents) {
    if (i.incidentId === incidentId) continue;
    const taken = reportIds.filter((id) => i.confirmedReportIds.includes(id));
    if (taken.length) deny('INVALID_SOURCE', `already confirmed in ${i.incidentId}: ${taken.join(', ')}`);
  }
}

function putIncident(ctx: Ctx, view: IncidentView) {
  const row = { incidentId: view.incidentId, runId: view.runId, json: JSON.stringify(view) };
  if (ctx.db.incident.incidentId.find(view.incidentId)) ctx.db.incident.incidentId.update(row);
  else ctx.db.incident.insert(row);
}

/** Pending proposals based on an incident's old revision can no longer be approved. */
function staleOthers(ctx: Ctx, runId: string, incidentId: string, exceptProposalId: string | null) {
  for (const row of ctx.db.proposal.runId.filter(runId)) {
    const rec = JSON.parse(row.json) as ProposalRecord;
    if (rec.reviewState !== 'PENDING' || rec.proposal.proposalId === exceptProposalId) continue;
    if (!Object.hasOwn(rec.proposal.baseIncidentVersions, incidentId)) continue;
    ctx.db.proposal.proposalId.update({ ...row, json: JSON.stringify({ ...rec, reviewState: 'STALE' }) });
  }
}

function appendReviewEvent(ctx: Ctx, event: Omit<ReviewEvent, 'sequence' | 'actorRole' | 'actorIdentity'>, actorRole: ReviewEvent['actorRole'] = 'operator') {
  const full: ReviewEvent = { ...event, sequence: next(ctx, 'review'), actorRole, actorIdentity: ctx.sender.toHexString() };
  must(validateWire('ReviewEvent', full));
  ctx.db.review_event.insert({ sequence: full.sequence, runId: full.runId, json: JSON.stringify(full) });
}

function ledger(ctx: Ctx, commandId: string) {
  const row = ctx.db.command.commandId.find(commandId);
  return new Map(row ? [[commandId, { fingerprint: row.fingerprint, result: JSON.parse(row.resultJson) }]] : []);
}

/** True if this commandId already ran with the same payload (its result is in the command table). */
function isRepeat(ctx: Ctx, commandId: string, payload: unknown): boolean {
  return must(recallCommand(ledger(ctx, commandId), commandId, payload)).kind === 'repeat';
}

function record(ctx: Ctx, commandId: string, payload: unknown, result: unknown) {
  const entry = recordCommand(new Map(), commandId, payload, result).get(commandId)!;
  ctx.db.command.insert({ commandId, fingerprint: entry.fingerprint, resultJson: JSON.stringify(result) });
}

function issueJob(ctx: Ctx, runId: string, kind: JobKind, scope: Scope, incidentId: string | null) {
  const jobId = `${runId}:job${next(ctx, 'job')}`;
  const job: Job = {
    runId,
    jobId,
    kind,
    reportId: scope.targetReportId,
    incidentId,
    baseIncidentVersions: {},
    inputSignature: 'sig1:unclaimed',
    state: 'QUEUED',
    attempts: 0,
    claim: null,
  };
  ctx.db.job.insert({ jobId, runId, state: job.state, scopeJson: JSON.stringify(scope), json: JSON.stringify(job), inputJson: '' });
  return jobId;
}

/**
 * Queue a Claude working-picture job for an incident whose confirmed state changed. One active job per
 * incident: a queued or claimed job already covers new reports (its input is built at claim time).
 */
function askClaude(ctx: Ctx, runId: string, incidentId: string, targetReportId: string | null) {
  for (const row of ctx.db.job.runId.filter(runId)) {
    if (row.state !== 'QUEUED' && row.state !== 'CLAIMED') continue;
    const j = JSON.parse(row.json) as Job;
    if (j.kind === 'INCIDENT_PROPOSAL' && j.incidentId === incidentId) return;
  }
  issueJob(ctx, runId, 'INCIDENT_PROPOSAL', { incidentIds: [incidentId], targetReportId }, incidentId);
}

function pictures(ctx: Ctx, runId: string): IncidentPicture[] {
  return [...ctx.db.incident_picture.runId.filter(runId)].map((r) => JSON.parse(r.json) as IncidentPicture);
}

function putPicture(ctx: Ctx, picture: IncidentPicture) {
  const row = { incidentId: picture.incidentId, runId: picture.runId, json: JSON.stringify(picture) };
  if (ctx.db.incident_picture.incidentId.find(picture.incidentId)) ctx.db.incident_picture.incidentId.update(row);
  else ctx.db.incident_picture.insert(row);
}

/** A report newly confirmed into an incident, newer than its picture's input, makes that picture stale. */
function markPictureStale(ctx: Ctx, incidentId: string, added: Report[]) {
  const row = ctx.db.incident_picture.incidentId.find(incidentId);
  if (!row) return;
  const p = JSON.parse(row.json) as IncidentPicture;
  const first = added.filter((r) => r.receiveSequence > p.throughSequence).sort((a, b) => a.receiveSequence - b.receiveSequence)[0];
  if (p.status === 'CURRENT' && first) putPicture(ctx, { ...p, status: 'STALE', staleSinceReportId: first.reportId });
}

function placePositions(ctx: Ctx): Map<string, PlacePosition> {
  const out = new Map<string, PlacePosition>();
  for (const p of ctx.db.place.iter()) {
    const pos = JSON.parse(p.positionJson) as PlacePosition | null;
    if (pos) out.set(p.placeId, pos);
  }
  return out;
}

// ---- lifecycle ---------------------------------------------------------------------------------

export const init = spacetimedb.init((ctx) => {
  ctx.db.desk.insert({ id: 0, runId: 'live-1', runNumber: 1, mode: RUN_MODE, newIncidentSignature: emptySignature('live-1') });
  // The publishing identity is the first operator; it grants every other role.
  ctx.db.role.insert({ identity: ctx.sender, role: 'operator' });
});

/** Operator grants a role to a backend identity (hex). The bridge, simulator and workers each get one. */
export const grant_role = spacetimedb.reducer({ identityHex: t.string(), role: t.string() }, (ctx, { identityHex, role }) => {
  if (roleOf(ctx) !== 'operator') deny('UNAUTHORIZED', 'only an operator grants roles');
  if (!['operator', 'bridge', 'simulator', 'worker'].includes(role)) deny('INVALID_INPUT', `unknown role ${role.slice(0, 32)}`);
  const Identity = ctx.sender.constructor as new (hex: string) => typeof ctx.sender;
  const identity = new Identity(identityHex.replace(/^0x/, ''));
  if (ctx.db.role.identity.find(identity)) ctx.db.role.identity.update({ identity, role });
  else ctx.db.role.insert({ identity, role });
});

/** Named places the models may cite (placeId + aliases) and their map position ({x, z} or null). Operator-maintained. */
export const put_place = spacetimedb.reducer({ placeId: t.string(), aliasesJson: t.string(), positionJson: t.string() }, (ctx, { placeId, aliasesJson, positionJson }) => {
  if (roleOf(ctx) !== 'operator') deny('UNAUTHORIZED', 'only an operator edits places');
  const aliases = JSON.parse(aliasesJson);
  if (!Array.isArray(aliases) || aliases.some((a) => typeof a !== 'string')) deny('INVALID_INPUT', 'aliases must be a string array');
  const pos = JSON.parse(positionJson);
  if (pos !== null && !(Number.isFinite(pos?.x) && Number.isFinite(pos?.z))) deny('INVALID_INPUT', 'position must be {x, z} numbers or null');
  const row = { placeId, aliasesJson: JSON.stringify(aliases), positionJson: JSON.stringify(pos && { x: pos.x, z: pos.z }) };
  if (ctx.db.place.placeId.find(placeId)) ctx.db.place.placeId.update(row);
  else ctx.db.place.insert(row);
});

// ---- intake ------------------------------------------------------------------------------------

/**
 * Radio bridge / simulator / operator intake. Body is one ReportInput JSON string.
 * Idempotent on (runId, sourceId, messageId): a retransmission is stored once.
 */
export const receive_report = spacetimedb.reducer({ reportInputJson: t.string() }, (ctx, { reportInputJson }) => {
  const input = must(parseWire<ReportInput>('ReportInput', reportInputJson));
  allow(ctx, 'receiveReport', { origin: input.origin });
  const { runId } = desk(ctx);
  sameRun(input.runId, runId);

  const state = loadState(ctx, runId);
  const intake = must(classifyIntake(state.reports, input));
  if (intake.kind === 'duplicate') {
    console.info(`duplicate ${input.sourceId}/${input.messageId} -> ${intake.reportId}; not stored again`);
    return;
  }

  const receiveSequence = next(ctx, `seq:${runId}`);
  const report = must(
    acceptReport(input, {
      reportId: `${runId}:r${receiveSequence}`,
      receiveSequence,
      receivedAt: ctx.timestamp.toISOString(),
      provenance: input.origin === 'scenario' ? 'simulated' : 'live',
    }),
  );
  ctx.db.report.insert({
    reportId: report.reportId,
    runId,
    receiveSequence,
    sourceId: input.sourceId,
    messageId: input.messageId,
    json: JSON.stringify(report),
  });
  // Every new report gets a local suggestion job; its candidate incidents are picked at claim time.
  // Claude pictures follow confirmed changes only (approval or auto-confirm), not every report.
  issueJob(ctx, runId, 'LOCAL_SUGGESTION', { incidentIds: [], targetReportId: report.reportId, confirmedOnly: true }, null);
  refreshSignatures(ctx);
});

// ---- jobs --------------------------------------------------------------------------------------

/** Operator asks for an incident proposal (Claude enrichment) on one incident, optionally about one report. */
export const issue_incident_job = spacetimedb.reducer(
  { incidentId: t.string(), targetReportId: t.string() },
  (ctx, { incidentId, targetReportId }) => {
    if (roleOf(ctx) !== 'operator') deny('UNAUTHORIZED', 'only an operator requests an incident proposal');
    const { runId } = desk(ctx);
    const state = loadState(ctx, runId);
    if (!state.incidents.some((i) => i.incidentId === incidentId)) deny('INVALID_INPUT', `no incident ${incidentId} in ${runId}`);
    const target = targetReportId === '' ? null : targetReportId;
    if (target && !state.reports.some((r) => r.reportId === target)) deny('INVALID_SOURCE', `no report ${target} in ${runId}`);
    askClaude(ctx, runId, incidentId, target);
  },
);

/**
 * Worker claims the oldest available job of the given kinds. Reducers return nothing,
 * so the worker reads its claimed job row (claim.workerIdentity, inputJson) from the
 * `job` table. The input and signature are rebuilt at claim time from delivered state.
 */
export const claim_job = spacetimedb.reducer({ commandJson: t.string() }, (ctx, { commandJson }) => {
  const cmd = must(parseWire<ClaimJobCommand>('ClaimJobCommand', commandJson));
  allow(ctx, 'claimJob');
  const { runId } = desk(ctx);
  sameRun(cmd.runId, runId);
  const me = ctx.sender.toHexString();
  const now = ctx.timestamp.microsSinceUnixEpoch;

  const rows = [...ctx.db.job.runId.filter(runId)].sort((a, b) => Number(a.jobId.split('job')[1]) - Number(b.jobId.split('job')[1]));
  const failed = new Set<string>();
  for (const r of rows) {
    const job = JSON.parse(r.json) as Job;
    const lapsed = job.state === 'CLAIMED' && BigInt(Date.parse(job.claim!.leaseExpiresAt)) * 1000n < now;
    // At the cap, a job that would be re-offered (lapsed, or re-claimed by its own worker) fails instead of looping.
    if (cmd.kinds.includes(job.kind) && (lapsed || (job.state === 'CLAIMED' && job.claim!.workerIdentity === me)) && job.attempts >= MAX_JOB_ATTEMPTS) {
      ctx.db.job.jobId.update({ ...r, state: 'FAILED', json: JSON.stringify({ ...job, state: 'FAILED', claim: null }) });
      failed.add(r.jobId);
    }
  }
  const row = rows.find((r) => {
    if (failed.has(r.jobId)) return false;
    const job = JSON.parse(r.json) as Job;
    if (!cmd.kinds.includes(job.kind)) return false;
    if (job.state === 'QUEUED') return true;
    // A lapsed lease, or the (single) Laya loop re-claiming after a stale result, gets fresh input. Claude runs
    // several jobs at once on one identity, so its own claimed jobs are in flight, never re-offered to it.
    if (job.state !== 'CLAIMED') return false;
    const reclaim = job.kind === 'LOCAL_SUGGESTION' && job.claim!.workerIdentity === me;
    return reclaim || (BigInt(Date.parse(job.claim!.leaseExpiresAt)) * 1000n < now);
  });
  if (!row) return;

  const job = JSON.parse(row.json) as Job;
  const scope = JSON.parse(row.scopeJson) as Scope;
  const state = loadState(ctx, runId);
  let places = [...ctx.db.place.iter()].map((p) => ({ placeId: p.placeId, aliases: JSON.parse(p.aliasesJson) as string[] }));
  if (job.kind === 'LOCAL_SUGGESTION' || job.kind === 'LOCAL_CHECK') {
    const target = state.reports.find((r) => r.reportId === scope.targetReportId)!;
    // Laya's option limit: the open incidents at or nearest the stated place, picked now (a LOCAL_CHECK keeps its suggestion's).
    if (job.kind === 'LOCAL_SUGGESTION') {
      scope.incidentIds = nearestOpenIncidents(state.incidents, target.input.reportedLocation?.placeId ?? null, placePositions(ctx)).map((i) => i.incidentId);
    }
    // Only the places this job can mention, so the input stays inside Laya's context.
    const near = new Set([target.input.reportedLocation?.placeId, ...state.incidents.filter((i) => scope.incidentIds.includes(i.incidentId)).map((i) => i.confirmedPlaceId)]);
    places = places.filter((p) => near.has(p.placeId));
  }
  const input = must(
    buildJobInput({
      runId,
      jobId: job.jobId,
      kind: job.kind,
      targetReportId: scope.targetReportId,
      incidentId: job.incidentId,
      reports: relevantReports(state, scope),
      incidents: state.incidents.filter((i) => scope.incidentIds.includes(i.incidentId)),
      places,
      pictures: pictures(ctx, runId),
    }),
  );
  const leaseExpiresAt = new Date(Number((now + LEASE_MICROS) / 1000n)).toISOString();
  const claimed: Job = {
    ...job,
    state: 'CLAIMED',
    attempts: job.attempts + 1,
    claim: { workerIdentity: me, leaseExpiresAt },
    baseIncidentVersions: revisions(state, scope.incidentIds),
    inputSignature: input.inputSignature,
  };
  must(validateWire('Job', claimed));
  ctx.db.job.jobId.update({ ...row, state: claimed.state, scopeJson: JSON.stringify(scope), json: JSON.stringify(claimed), inputJson: JSON.stringify(input) });
});

function claimedJob(ctx: Ctx, jobId: string, kind: JobKind) {
  const row = ctx.db.job.jobId.find(jobId) ?? deny('INVALID_INPUT', `no job ${jobId}`);
  const job = JSON.parse(row.json) as Job;
  if (job.kind !== kind) deny('INVALID_INPUT', `job ${jobId} is a ${job.kind} job`);
  if (job.state === 'INVALIDATED') deny('WRONG_RUN', `job ${jobId} was invalidated by a reset`);
  if (job.state !== 'CLAIMED' || job.claim?.workerIdentity !== ctx.sender.toHexString()) deny('UNAUTHORIZED', `job ${jobId} is not claimed by this worker`);
  return { row, job, scope: JSON.parse(row.scopeJson) as Scope };
}

function finishJob(ctx: Ctx, row: { jobId: string; json: string }, job: Job) {
  const done: Job = { ...job, state: 'DONE', claim: null };
  ctx.db.job.jobId.update({ ...ctx.db.job.jobId.find(row.jobId)!, state: done.state, json: JSON.stringify(done) });
}

/** Laya (or a recording) returns a local suggestion. Proposals only; never confirmed state. */
export const submit_local_suggestion = spacetimedb.reducer({ commandJson: t.string() }, (ctx, { commandJson }) => {
  const cmd = must(parseWire<SubmitLocalSuggestionCommand>('SubmitLocalSuggestionCommand', commandJson));
  allow(ctx, 'submitLocalSuggestion');
  const s = cmd.suggestion;
  must(checkProviderAllowed(RUN_MODE, 'submitLocalSuggestion', s.provider));
  const { runId } = desk(ctx);
  sameRun(s.runId, runId);
  const { row, job, scope } = claimedJob(ctx, cmd.jobId, 'LOCAL_SUGGESTION');
  if (s.reportId !== job.reportId) deny('INVALID_SOURCE', `job ${job.jobId} is about ${job.reportId}, not ${s.reportId}`);

  const state = loadState(ctx, runId);
  must(checkSourceOwnership(runId, citedReportIds(s), knownReports(state)));
  if (s.candidateIncidentId && !state.incidents.some((i) => i.incidentId === s.candidateIncidentId)) {
    deny('INVALID_SOURCE', `no incident ${s.candidateIncidentId} in ${runId}`);
  }
  must(checkFreshness(s, freshness(state, scope)));

  const suggestionId = `${runId}:s${next(ctx, 'suggestion')}`;
  const rec: SuggestionRecord = { suggestionId, jobId: job.jobId, reviewState: 'PENDING', suggestion: s };
  must(validateWire('SuggestionRecord', rec));
  ctx.db.suggestion.insert({ suggestionId, runId, json: JSON.stringify(rec) });
  finishJob(ctx, row, job);
  // Claude checks every Laya suggestion, against the same candidates.
  if (s.provider === 'local_laya') issueJob(ctx, runId, 'LOCAL_CHECK', { ...scope, suggestionId }, null);
  refreshSignatures(ctx);
});

function putCheck(ctx: Ctx, check: ClaudeCheck) {
  const row = { reportId: check.reportId, runId: check.runId, json: JSON.stringify(check) };
  if (ctx.db.claude_check.reportId.find(check.reportId)) ctx.db.claude_check.reportId.update(row);
  else ctx.db.claude_check.insert(row);
}

/**
 * Claude's check of a Laya suggestion (worker only). If both agree on a safe change (shared rule
 * autoConfirmDecision) it is confirmed now, recorded with actor claude_check. Otherwise the check is
 * stored and the report stays in review, where Laya and Claude can be shown side by side. A stale check
 * goes back to the queue for a fresh look instead of failing.
 */
export const auto_confirm = spacetimedb.reducer({ commandJson: t.string() }, (ctx, { commandJson }) => {
  const cmd = must(parseWire<SubmitClaudeCheckCommand>('SubmitClaudeCheckCommand', commandJson));
  allow(ctx, 'autoConfirm');
  const c = cmd.check;
  const { runId } = desk(ctx);
  sameRun(c.runId, runId);
  const { row, job, scope } = claimedJob(ctx, cmd.jobId, 'LOCAL_CHECK');
  if (c.reportId !== job.reportId) deny('INVALID_SOURCE', `job ${job.jobId} is about ${job.reportId}, not ${c.reportId}`);
  if (c.candidateIncidentId !== null && !scope.incidentIds.includes(c.candidateIncidentId)) deny('INVALID_SOURCE', `${c.candidateIncidentId} is not a candidate of job ${job.jobId}`);

  const state = loadState(ctx, runId);
  must(checkSourceOwnership(runId, [c.reportId, ...c.evidenceReportIds], knownReports(state)));
  if (!checkFreshness(c, freshness(state, scope)).ok) {
    const again: Job = { ...job, state: job.attempts >= MAX_JOB_ATTEMPTS ? 'FAILED' : 'QUEUED', claim: null };
    ctx.db.job.jobId.update({ ...row, state: again.state, json: JSON.stringify(again) });
    return;
  }
  putCheck(ctx, c);
  finishJob(ctx, row, job);

  const sRow = scope.suggestionId ? ctx.db.suggestion.suggestionId.find(scope.suggestionId) : undefined;
  const rec = sRow ? (JSON.parse(sRow.json) as SuggestionRecord) : null;
  if (!sRow || !rec || rec.reviewState !== 'PENDING') return;
  const loc = state.reports.find((r) => r.reportId === c.reportId)!.input.reportedLocation;
  const d = autoConfirmDecision({ suggestion: rec.suggestion, check: c, placeId: loc?.source === 'sender_explicit' ? loc.placeId : null, incidents: state.incidents });
  if (!d.confirm) return;

  let incidentId = d.incidentId;
  while (incidentId === null || (d.incidentId === null && state.incidents.some((i) => i.incidentId === incidentId))) incidentId = `${runId}:i${next(ctx, 'incident')}`;
  const { prior, next: view } = commitChange(ctx, state, incidentId, d.change, false);
  appendReviewEvent(
    ctx,
    {
      runId,
      commandId: `${job.jobId}:auto`,
      incidentId,
      proposalId: null,
      priorRevision: prior?.revision ?? 0,
      newRevision: view.revision,
      acceptedChanges: Object.keys(d.change) as ChangeField[],
      reason: d.reason,
      sourceReportIds: [c.reportId],
    },
    'claude_check',
  );
  ctx.db.suggestion.suggestionId.update({ ...sRow, json: JSON.stringify({ ...rec, reviewState: 'APPROVED' }) });
  staleOthers(ctx, runId, incidentId, null);
  askClaude(ctx, runId, incidentId, null);
  refreshSignatures(ctx);
});

/** Claude/recording worker result (with a job) or an operator-authored proposal (no job). */
export const submit_incident_proposal = spacetimedb.reducer({ commandJson: t.string() }, (ctx, { commandJson }) => {
  const cmd = must(parseWire<SubmitIncidentProposalCommand>('SubmitIncidentProposalCommand', commandJson));
  const p = cmd.proposal;
  allow(ctx, 'submitIncidentProposal', { provider: p.provider });
  must(checkProviderAllowed(RUN_MODE, 'submitIncidentProposal', p.provider));
  const { runId } = desk(ctx);
  sameRun(p.runId, runId);
  if (ctx.db.proposal.proposalId.find(p.proposalId)) deny('INVALID_INPUT', `proposal ${p.proposalId} already exists`);

  const role = roleOf(ctx);
  let jobRef: ReturnType<typeof claimedJob> | null = null;
  if (role === 'worker') {
    if (cmd.jobId === null) deny('INVALID_INPUT', 'a worker proposal needs its job');
    jobRef = claimedJob(ctx, cmd.jobId!, 'INCIDENT_PROPOSAL');
    if (p.incidentId !== jobRef.job.incidentId) deny('INVALID_SOURCE', `job ${jobRef.job.jobId} is about ${jobRef.job.incidentId}`);
  } else if (cmd.jobId !== null) {
    deny('INVALID_INPUT', 'operator-authored proposals have no job');
  }
  const scope = jobRef?.scope ?? { incidentIds: Object.keys(p.baseIncidentVersions), targetReportId: null };

  const state = loadState(ctx, runId);
  must(checkSourceOwnership(runId, citedReportIds(p), knownReports(state)));
  must(checkFreshness(p, freshness(state, scope)));

  const rec: ProposalRecord = { jobId: cmd.jobId, submittedByRole: role as 'worker' | 'operator', reviewState: 'PENDING', proposal: p };
  must(validateWire('ProposalRecord', rec));
  ctx.db.proposal.insert({ proposalId: p.proposalId, runId, scopeJson: JSON.stringify(scope), json: JSON.stringify(rec) });
  // A worker's job finishes with its picture (submit_incident_picture), not with a proposal.
  refreshSignatures(ctx);
});

/** Claude's working picture for one incident (worker only). Validated against the job's own input, then stored. */
export const submit_incident_picture = spacetimedb.reducer({ commandJson: t.string() }, (ctx, { commandJson }) => {
  const cmd = must(parseWire<SubmitIncidentPictureCommand>('SubmitIncidentPictureCommand', commandJson));
  allow(ctx, 'submitIncidentPicture');
  const { runId } = desk(ctx);
  sameRun(cmd.picture.runId, runId);
  const { row, job, scope } = claimedJob(ctx, cmd.jobId, 'INCIDENT_PROPOSAL');
  if (cmd.picture.incidentId !== job.incidentId) deny('INVALID_SOURCE', `job ${job.jobId} is about ${job.incidentId}`);
  const input = JSON.parse(ctx.db.job.jobId.find(job.jobId)!.inputJson) as JobInput;
  const picture = must(checkPicture(cmd.picture, input));

  const throughSequence = Math.max(0, ...input.reports.map((r) => r.receiveSequence));
  const newer = relevantReports(loadState(ctx, runId), scope).filter((r) => r.receiveSequence > throughSequence);
  putPicture(ctx, {
    ...picture,
    status: newer.length ? 'STALE' : 'CURRENT',
    staleSinceReportId: newer[0]?.reportId ?? null,
    throughSequence,
  });
  finishJob(ctx, row, job);
  // Reports that arrived while this job ran are not in the picture yet: queue the next pass.
  if (newer.length) askClaude(ctx, runId, job.incidentId!, null);
  refreshSignatures(ctx);
});

// ---- operator review ---------------------------------------------------------------------------

/** Shared commit path for approvals and edits: one atomic incident change + review event. */
function commitChange(
  ctx: Ctx,
  state: DeskState,
  incidentId: string,
  change: IncidentChange,
  relationsOnly: boolean,
): { prior: IncidentView | null; next: IncidentView } {
  const current = state.incidents.find((i) => i.incidentId === incidentId) ?? null;
  const adds = change.addReportIds ?? [];
  checkNotConfirmedElsewhere(state, incidentId, adds);
  const seqs = state.reports.filter((r) => adds.includes(r.reportId)).map((r) => r.receiveSequence);
  if (current === null && seqs.length === 0) deny('INVALID_INPUT', `a new incident ${incidentId} needs at least one source report`);
  // New cycle: first source report; reopened cycle: newest added report, else the newest report received.
  const reopenSequence = current === null ? Math.min(...seqs) : seqs.length ? Math.max(...seqs) : state.reports.at(-1)!.receiveSequence;

  if (relationsOnly && current) {
    const next = { ...current, revision: current.revision + 1 };
    putIncident(ctx, next);
    return { prior: current, next };
  }
  const next = must(applyIncidentChange(current, change, { runId: state.runId, incidentId, reopenSequence }));
  putIncident(ctx, next);
  markPictureStale(ctx, incidentId, state.reports.filter((r) => adds.includes(r.reportId)));
  return { prior: current, next };
}

export const approve_proposal = spacetimedb.reducer({ commandJson: t.string() }, (ctx, { commandJson }) => {
  const cmd = must(parseWire<ApproveProposalCommand>('ApproveProposalCommand', commandJson));
  allow(ctx, 'approveProposal');
  if (isRepeat(ctx, cmd.commandId, cmd)) return;
  const { runId } = desk(ctx);
  sameRun(cmd.runId, runId);

  const row = ctx.db.proposal.proposalId.find(cmd.proposalId) ?? deny('INVALID_INPUT', `no proposal ${cmd.proposalId}`);
  const rec = JSON.parse(row.json) as ProposalRecord;
  const scope = JSON.parse(row.scopeJson) as Scope;
  const p: IncidentProposal = rec.proposal;
  sameRun(p.runId, runId);
  if (rec.reviewState !== 'PENDING') deny('STALE_REVISION', `proposal ${p.proposalId} is ${rec.reviewState}`);
  // What the operator saw must still be what the proposal says.
  if (cmd.inputSignature !== p.inputSignature || JSON.stringify(Object.entries(cmd.baseIncidentVersions).sort()) !== JSON.stringify(Object.entries(p.baseIncidentVersions).sort())) {
    deny('STALE_REVISION', 'the approval does not match the proposal the operator saw');
  }

  const all = loadState(ctx, runId);
  // Validate against current state without this proposal's own pending links.
  const state = { ...all, proposals: all.proposals.filter((x) => x.proposal.proposalId !== p.proposalId) };
  must(checkFreshness(p, freshness(state, scope)));
  must(checkSourceOwnership(runId, citedReportIds(p), knownReports(state)));

  const current = state.incidents.find((i) => i.incidentId === p.incidentId) ?? null;
  const change: IncidentChange = { addReportIds: p.addReportIds };
  if (p.suggestedStatus !== null) change.status = p.suggestedStatus;
  else if (current === null) change.status = 'OPEN';
  if (p.suggestedAttention !== null) change.attention = p.suggestedAttention;
  if (p.suggestedSummary !== null) change.summary = p.suggestedSummary;
  const newAdds = p.addReportIds.filter((id) => !current?.confirmedReportIds.includes(id));
  const fieldChange =
    current === null ||
    newAdds.length > 0 ||
    (change.status !== undefined && change.status !== current.status) ||
    (change.attention !== undefined && change.attention !== current.attention) ||
    (change.summary !== undefined && change.summary !== current.summary);
  if (!fieldChange && p.relations.length === 0) deny('INVALID_INPUT', `proposal ${p.proposalId} changes nothing`);

  const { prior, next: view } = commitChange(ctx, state, p.incidentId, change, !fieldChange);
  askClaude(ctx, runId, p.incidentId, null);
  const reviewer = ctx.sender.toHexString();
  p.relations.forEach((r, n) => {
    const rel: ReportRelation = {
      runId,
      relationId: `${p.proposalId}:rel${n}`,
      reportId: r.reportId,
      targetReportId: r.targetReportId,
      kind: r.kind,
      incidentId: p.incidentId,
      state: 'CONFIRMED',
      proposalId: p.proposalId,
      reviewer,
    };
    must(validateWire('ReportRelation', rel));
    ctx.db.relation.insert({ relationId: rel.relationId, runId, json: JSON.stringify(rel) });
  });

  const accepted = (['status', 'attention', 'summary'] as const).filter((k) => change[k] !== undefined && (prior === null || change[k] !== prior[k]));
  appendReviewEvent(ctx, {
    runId,
    commandId: cmd.commandId,
    incidentId: p.incidentId,
    proposalId: p.proposalId,
    priorRevision: prior?.revision ?? 0,
    newRevision: view.revision,
    acceptedChanges: [...accepted, ...(newAdds.length ? (['addReportIds'] as const) : []), ...(p.relations.length ? (['relations'] as const) : [])],
    reason: null,
    sourceReportIds: citedReportIds(p),
  });
  ctx.db.proposal.proposalId.update({ ...row, json: JSON.stringify({ ...rec, reviewState: 'APPROVED' }) });
  staleOthers(ctx, runId, p.incidentId, p.proposalId);
  record(ctx, cmd.commandId, cmd, { incidentId: view.incidentId, revision: view.revision });
  refreshSignatures(ctx);
});

export const reject_proposal = spacetimedb.reducer({ commandJson: t.string() }, (ctx, { commandJson }) => {
  const cmd = must(parseWire<RejectProposalCommand>('RejectProposalCommand', commandJson));
  allow(ctx, 'rejectProposal');
  if (isRepeat(ctx, cmd.commandId, cmd)) return;
  sameRun(cmd.runId, desk(ctx).runId);
  const row = ctx.db.proposal.proposalId.find(cmd.proposalId) ?? deny('INVALID_INPUT', `no proposal ${cmd.proposalId}`);
  const rec = JSON.parse(row.json) as ProposalRecord;
  if (rec.reviewState !== 'PENDING') deny('STALE_REVISION', `proposal ${cmd.proposalId} is ${rec.reviewState}`);
  ctx.db.proposal.proposalId.update({ ...row, json: JSON.stringify({ ...rec, reviewState: 'REJECTED' }) });
  record(ctx, cmd.commandId, cmd, null);
  refreshSignatures(ctx);
});

export const operator_edit = spacetimedb.reducer({ commandJson: t.string() }, (ctx, { commandJson }) => {
  const cmd = must(parseWire<OperatorEditCommand>('OperatorEditCommand', commandJson));
  allow(ctx, 'operatorEdit');
  if (isRepeat(ctx, cmd.commandId, cmd)) return;
  const { runId } = desk(ctx);
  sameRun(cmd.runId, runId);
  if (cmd.reason === null && cmd.sourceReportIds.length === 0) deny('INVALID_INPUT', 'an edit needs a reason or source reports');

  const state = loadState(ctx, runId);
  const current = state.incidents.find((i) => i.incidentId === cmd.incidentId) ?? null;
  if ((current?.revision ?? 0) !== cmd.baseRevision) {
    deny('STALE_REVISION', `${cmd.incidentId} is at revision ${current?.revision ?? 0}; the edit was based on ${cmd.baseRevision}`);
  }
  must(checkSourceOwnership(runId, [...(cmd.changes.addReportIds ?? []), ...cmd.sourceReportIds], knownReports(state)));

  const { prior, next: view } = commitChange(ctx, state, cmd.incidentId, cmd.changes, false);
  askClaude(ctx, runId, cmd.incidentId, null);
  const keys = Object.keys(cmd.changes) as (keyof typeof cmd.changes)[];
  appendReviewEvent(ctx, {
    runId,
    commandId: cmd.commandId,
    incidentId: cmd.incidentId,
    proposalId: null,
    priorRevision: prior?.revision ?? 0,
    newRevision: view.revision,
    acceptedChanges: keys,
    reason: cmd.reason,
    sourceReportIds: cmd.sourceReportIds,
  });
  staleOthers(ctx, runId, cmd.incidentId, null);
  record(ctx, cmd.commandId, cmd, { incidentId: view.incidentId, revision: view.revision });
  refreshSignatures(ctx);
});

/** Start a new run. Old rows stay as history under their runId; old jobs are invalidated. */
export const reset_run = spacetimedb.reducer({ commandJson: t.string() }, (ctx, { commandJson }) => {
  const cmd = must(parseWire<ResetRunCommand>('ResetRunCommand', commandJson));
  allow(ctx, 'resetRun');
  if (isRepeat(ctx, cmd.commandId, cmd)) return;
  const d = desk(ctx);
  sameRun(cmd.runId, d.runId);
  for (const row of ctx.db.job.runId.filter(d.runId)) {
    const job = JSON.parse(row.json) as Job;
    if (job.state === 'DONE') continue;
    ctx.db.job.jobId.update({ ...row, state: 'INVALIDATED', json: JSON.stringify({ ...job, state: 'INVALIDATED', claim: null }) });
  }
  const runNumber = d.runNumber + 1;
  const runId = `live-${runNumber}`;
  ctx.db.desk.id.update({ ...d, runId, runNumber, newIncidentSignature: emptySignature(runId) });
  record(ctx, cmd.commandId, cmd, { runId });
});
