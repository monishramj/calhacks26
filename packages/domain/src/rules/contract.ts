// Contract rules shared by the live SpacetimeDB module and the replay adapter:
// intake identity, idempotency, permissions, provenance, freshness, source
// ownership, and the model-facing job input. Pure functions, no I/O.
import { sha256Hex } from '../sha256';
import type {
  AdapterMethod,
  IncidentProposal,
  IncidentView,
  JobInput,
  JobKind,
  LocalSuggestion,
  Report,
  ReportInput,
  ReportProvenance,
  Result,
  Role,
} from '../types';
import { fail, isId, validateWire } from '../validate';

export const ATTENTIONS = Object.freeze(['POSSIBLE_LIFE_SAFETY', 'ACTIVE_NEED', 'INFORMATION'] as const);
export const LOCAL_ACTIONS = Object.freeze(['NEW_INCIDENT', 'ATTACH_REPORT', 'FLAG_CORRECTION', 'FLAG_CONFLICT', 'REQUEST_REVIEW'] as const);
export const PROVIDERS = Object.freeze(['local_laya', 'claude', 'gemini', 'operator', 'recording', 'fixture', 'rule'] as const);
export const ERROR_CODES = Object.freeze([
  'STALE_REVISION',
  'INVALID_SOURCE',
  'INVALID_INPUT',
  'UNAUTHORIZED',
  'WRONG_RUN',
  'SERVICE_UNAVAILABLE',
] as const);
export const ROLES = Object.freeze(['bridge', 'operator', 'simulator', 'worker'] as const);
export const ADAPTER_METHODS = Object.freeze([
  'subscribeState',
  'receiveReport',
  'submitLocalSuggestion',
  'submitIncidentProposal',
  'approveProposal',
  'rejectProposal',
  'operatorEdit',
  'claimJob',
  'advanceScenario',
  'resetRun',
] as const);

const OK = { ok: true, value: null } as const;

// ---- intake ----------------------------------------------------------------------------

/** Backend-assigned report fields. Checked at runtime against the Report schema. */
export type Assigned = { reportId: string; receiveSequence: number; receivedAt: string; provenance: ReportProvenance | (string & {}) };

/** Backend side of receiveReport: wrap a validated input with backend-assigned fields. */
export function acceptReport(input: unknown, assigned: Assigned): Result<Report> {
  const checked = validateWire<ReportInput>('ReportInput', input);
  if (!checked.ok) return checked;
  return validateWire<Report>('Report', { ...assigned, input: checked.value });
}

/** Classify an incoming report against stored reports by (runId, sourceId, messageId). */
export function classifyIntake(
  existing: readonly Report[],
  input: ReportInput,
): Result<{ kind: 'new' } | { kind: 'duplicate'; reportId: string }> {
  const same = existing.find(
    (r) => r.input.runId === input.runId && r.input.sourceId === input.sourceId && r.input.messageId === input.messageId,
  );
  if (!same) return { ok: true, value: { kind: 'new' } };
  if (same.input.text !== input.text) {
    return fail('INVALID_INPUT', `message ${input.messageId} from ${input.sourceId} was already received with different text`);
  }
  return { ok: true, value: { kind: 'duplicate', reportId: same.reportId } };
}

// ---- idempotent commands -----------------------------------------------------------------

/** Key-order-independent JSON, used for command fingerprints and signatures. */
export function canonicalJson(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonicalJson).join(',')}]`;
  if (v && typeof v === 'object') {
    const entries = Object.entries(v as Record<string, unknown>)
      .filter(([, x]) => x !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, x]) => `${JSON.stringify(k)}:${canonicalJson(x)}`).join(',')}}`;
  }
  return JSON.stringify(v);
}

type LedgerEntry = { fingerprint: string; result: unknown };
export type CommandLedger = ReadonlyMap<string, LedgerEntry>;

/** Return a ledger that also holds `result` for `commandId` (the input ledger is unchanged). */
export function recordCommand(ledger: ReadonlyMap<string, unknown>, commandId: string, payload: unknown, result: unknown): CommandLedger {
  const next = new Map(ledger as CommandLedger);
  next.set(commandId, { fingerprint: canonicalJson(payload), result });
  return next;
}

/** Idempotency for mutating commands keyed by commandId. */
export function recallCommand(
  ledger: ReadonlyMap<string, unknown>,
  commandId: string,
  payload: unknown,
): Result<{ kind: 'new' } | { kind: 'repeat'; result: unknown }> {
  if (!isId(commandId)) return fail('INVALID_INPUT', 'commandId is not a valid identifier');
  const entry = (ledger as CommandLedger).get(commandId);
  if (!entry) return { ok: true, value: { kind: 'new' } };
  if (entry.fingerprint !== canonicalJson(payload)) {
    return fail('INVALID_INPUT', `commandId ${commandId} was already used for a different command`);
  }
  return { ok: true, value: { kind: 'repeat', result: entry.result } };
}

// ---- permissions and provenance ------------------------------------------------------------

const ONLY: Partial<Record<AdapterMethod, readonly Role[]>> = {
  subscribeState: ROLES,
  submitLocalSuggestion: ['worker'],
  approveProposal: ['operator'],
  rejectProposal: ['operator'],
  operatorEdit: ['operator'],
  claimJob: ['worker'],
  advanceScenario: ['operator'],
  resetRun: ['operator'],
};
const INTAKE_ROLE: Record<string, Role> = { radio: 'bridge', scenario: 'simulator', operator: 'operator' };

/**
 * May a caller with backend-verified `role` call `method`? `ctx.origin` is required
 * for receiveReport, `ctx.provider` for submitIncidentProposal.
 */
export function authorize(role: string, method: string, ctx?: { origin?: string; provider?: string; [k: string]: unknown }): Result<null> {
  if (!(ADAPTER_METHODS as readonly string[]).includes(method)) return fail('INVALID_INPUT', `unknown method ${method.slice(0, 64)}`);
  if (!(ROLES as readonly string[]).includes(role)) return fail('UNAUTHORIZED', 'caller has no desk role');
  const deny = fail('UNAUTHORIZED', `${role} may not ${method}${ctx?.origin ? ` (${ctx.origin})` : ''}${ctx?.provider ? ` as ${ctx.provider}` : ''}`);

  if (method === 'receiveReport') {
    const needed = INTAKE_ROLE[ctx?.origin ?? ''];
    if (!needed) return fail('INVALID_INPUT', 'receiveReport needs a known origin');
    return role === needed ? OK : deny;
  }
  if (method === 'submitIncidentProposal') {
    const provider = ctx?.provider;
    if (provider === 'operator') return role === 'operator' ? OK : deny;
    if (provider === 'claude' || provider === 'gemini' || provider === 'recording' || provider === 'fixture') return role === 'worker' ? OK : deny;
    return fail('INVALID_INPUT', 'submitIncidentProposal needs a known provider');
  }
  return ONLY[method as AdapterMethod]!.includes(role as Role) ? OK : deny;
}

const ALLOWED_PROVIDERS: Record<string, Record<string, readonly string[]>> = {
  live: { submitLocalSuggestion: ['local_laya', 'recording'], submitIncidentProposal: ['claude', 'gemini', 'operator', 'recording'] },
  replay: { submitLocalSuggestion: ['fixture', 'recording'], submitIncidentProposal: ['fixture', 'recording', 'operator'] },
};

/** A fixture never stands in for a live provider, and replay never claims live inference. */
export function checkProviderAllowed(mode: string, method: string, provider: string): Result<null> {
  const byMethod = ALLOWED_PROVIDERS[mode];
  if (!byMethod) return fail('INVALID_INPUT', `unknown run kind ${mode.slice(0, 32)}`);
  const allowed = byMethod[method];
  if (!allowed) return fail('INVALID_INPUT', `${method.slice(0, 64)} carries no provider`);
  return allowed.includes(provider) ? OK : fail('INVALID_SOURCE', `${provider} output is not accepted for ${method} in a ${mode} run`);
}

// ---- freshness ---------------------------------------------------------------------------------

export type SignatureInput = { runId: string; orderedReportIds: readonly string[]; incidentRevisions: Readonly<Record<string, number>> };

/** Backend-computed freshness token over ordered relevant reports and incident revisions. */
export function computeInputSignature(input: SignatureInput): string {
  const revisions = Object.entries(input.incidentRevisions).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `sig1:${sha256Hex(JSON.stringify(['sig1', input.runId, input.orderedReportIds, revisions]))}`;
}

export type FreshnessSubmitted = { runId: string; baseIncidentVersions: Readonly<Record<string, number>>; inputSignature: string };
export type FreshnessCurrent = { activeRunId: string; incidentRevisions: Readonly<Record<string, number>>; inputSignature: string };

/** WRONG_RUN first, then STALE_REVISION for any moved incident or any new relevant evidence. */
export function checkFreshness(submitted: FreshnessSubmitted, current: FreshnessCurrent): Result<null> {
  if (submitted.runId !== current.activeRunId) return fail('WRONG_RUN', `result is for run ${submitted.runId}, active run is ${current.activeRunId}`);
  for (const [incidentId, base] of Object.entries(submitted.baseIncidentVersions)) {
    const now = Object.hasOwn(current.incidentRevisions, incidentId) ? current.incidentRevisions[incidentId] : undefined;
    if (now === undefined ? base !== 0 : base !== now) {
      return fail('STALE_REVISION', `${incidentId} is at revision ${now ?? 'none'}; the result was based on ${base}`);
    }
  }
  if (submitted.inputSignature !== current.inputSignature) {
    return fail('STALE_REVISION', 'relevant reports changed since this result was computed');
  }
  return OK;
}

// ---- source ownership ----------------------------------------------------------------------------

/** Every report ID an IncidentProposal or LocalSuggestion cites, sorted and unique. */
export function citedReportIds(x: IncidentProposal | LocalSuggestion): string[] {
  const out = new Set<string>(x.evidenceReportIds);
  if ('relations' in x) {
    x.addReportIds.forEach((id) => out.add(id));
    x.relations.forEach((r) => (out.add(r.reportId), out.add(r.targetReportId)));
  } else {
    out.add(x.reportId);
  }
  return [...out].sort();
}

export function checkSourceOwnership(runId: string, reportIds: readonly string[], known: ReadonlyMap<string, { runId: string }>): Result<null> {
  const bad = reportIds.filter((id) => known.get(id)?.runId !== runId);
  return bad.length === 0 ? OK : fail('INVALID_SOURCE', `not reports of run ${runId}: ${bad.slice(0, 5).join(', ')}`);
}

// ---- model-facing job input --------------------------------------------------------------------------

export type BuildJobInputArgs = {
  runId: string;
  jobId: string;
  /** Checked at runtime against the JobInput schema. */
  kind: JobKind | (string & {});
  targetReportId: string | null;
  incidentId: string | null;
  /** Delivered, stored reports only. */
  reports: readonly unknown[];
  incidents: readonly unknown[];
  places: readonly { placeId: string; aliases: readonly string[] }[];
};

/**
 * Build the model-facing job input from delivered state only. Fields are copied by
 * name, so anything else the caller has in scope (scenario script, expectations,
 * desired rankings) cannot reach a model.
 */
export function buildJobInput(args: BuildJobInputArgs): Result<JobInput> {
  const reports: Report[] = [];
  for (const r of args.reports) {
    const checked = validateWire<Report>('Report', r);
    if (!checked.ok) return fail('INVALID_INPUT', `job input accepts delivered reports only: ${checked.error.message}`);
    if (checked.value.input.runId !== args.runId) return fail('INVALID_SOURCE', `report ${checked.value.reportId} is not from run ${args.runId}`);
    reports.push(checked.value);
  }
  reports.sort((a, b) => a.receiveSequence - b.receiveSequence);
  if (new Set(reports.map((r) => r.reportId)).size !== reports.length) return fail('INVALID_INPUT', 'duplicate report in job input');

  const incidents: IncidentView[] = [];
  for (const i of args.incidents) {
    const checked = validateWire<IncidentView>('IncidentView', i);
    if (!checked.ok) return checked;
    if (checked.value.runId !== args.runId) return fail('INVALID_SOURCE', `incident ${checked.value.incidentId} is not from run ${args.runId}`);
    incidents.push(checked.value);
  }

  if (args.kind === 'LOCAL_SUGGESTION' && !reports.some((r) => r.reportId === args.targetReportId)) {
    return fail('INVALID_INPUT', 'the target report must be one of the job reports');
  }

  const orderedReportIds = reports.map((r) => r.reportId);
  const incidentRevisions = Object.fromEntries(incidents.map((i) => [i.incidentId, i.revision]));
  const input: JobInput = {
    runId: args.runId,
    jobId: args.jobId,
    kind: args.kind as JobKind,
    inputSignature: computeInputSignature({ runId: args.runId, orderedReportIds, incidentRevisions }),
    targetReportId: args.targetReportId,
    incidentId: args.incidentId,
    reports: reports.map((r) => ({
      reportId: r.reportId,
      receiveSequence: r.receiveSequence,
      text: r.input.text,
      sentAt: r.input.sentAt,
      reportedEventAt: r.input.reportedEventAt,
      reportedLocation: r.input.reportedLocation,
    })),
    candidateIncidents: incidents,
    places: args.places.map((p) => ({ placeId: p.placeId, aliases: [...p.aliases] })),
  };
  return validateWire<JobInput>('JobInput', input);
}
