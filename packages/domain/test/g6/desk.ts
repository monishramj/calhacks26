// Builds DeskState snapshots from the authored §18 exercise for the G6 view tests.
// Confirmed changes are applied by hand here (not through applyIncidentChange) so a
// queue or band test fails only on the view under test.
import type {
  Attention,
  DeskState,
  IncidentProposal,
  IncidentView,
  LocalAction,
  LocalSuggestion,
  ProposalRecord,
  RelationKind,
  Report,
  ReportRelation,
  SuggestionRecord,
} from '../../src/index.ts';
import { EXERCISE_PATH, EXPECTATIONS_PATH, readJsonIfExists } from '../helpers.ts';

export const RUN = 'run-001';
export const exercise = readJsonIfExists(EXERCISE_PATH);
export const expectations = readJsonIfExists(EXPECTATIONS_PATH);
const SIG = 'sig1:0000000000000000000000000000000000000000000000000000000000000000';

/** Canonical report ID for an exercise message in these tests. */
export const rid = (messageId: string) => `rep-${messageId}`;

export function emptyDesk(): DeskState {
  return {
    runId: RUN,
    mode: 'LOCAL REPLAY',
    reports: [],
    incidents: [],
    relations: [],
    suggestions: [],
    proposals: [],
    reviewEvents: [],
    scenario: null,
    inputSignatures: {},
  };
}

/** Deliver one exercise message: the next receive sequence, original input unchanged. */
export function deliver(state: DeskState, messageId: string, overrides: Partial<Report['input']> = {}): Report {
  const event = exercise.events.find((e: any) => e.input.messageId === messageId);
  if (!event) throw new Error(`no exercise event ${messageId}`);
  const seq = state.reports.length + 1;
  const report: Report = {
    reportId: rid(overrides.messageId ?? messageId),
    receiveSequence: seq,
    receivedAt: `2026-10-25T16:${String(seq).padStart(2, '0')}:00Z`,
    provenance: 'fixture',
    input: { ...structuredClone(event.input), runId: state.runId, ...overrides },
  };
  state.reports.push(report);
  return report;
}

/** R01–R06 delivered and the authored, operator-reviewed starting incidents (§18). */
export function startDesk(): DeskState {
  const state = emptyDesk();
  for (const id of ['R01', 'R02', 'R03', 'R04', 'R05', 'R06']) deliver(state, id);
  for (const i of exercise.startingState.incidents) {
    const reportIds = i.reportMessageIds.map(rid);
    const seqs = reportIds.map((r: string) => state.reports.find((x) => x.reportId === r)!.receiveSequence);
    state.incidents.push({
      runId: RUN,
      incidentId: i.incidentId,
      revision: 1,
      status: 'OPEN',
      attention: i.attention,
      confirmedPlaceId: i.placeId,
      confirmedReportIds: reportIds,
      summary: null,
      openCycleStartSequence: Math.min(...seqs),
    });
  }
  return state;
}

export function incident(state: DeskState, incidentId: string): IncidentView {
  const found = state.incidents.find((i) => i.incidentId === incidentId);
  if (!found) throw new Error(`no incident ${incidentId}`);
  return found;
}

/** Operator-confirmed change, applied directly (revision + 1). */
export function confirm(
  state: DeskState,
  incidentId: string,
  change: { attention?: Attention | null; addReportIds?: string[]; status?: 'OPEN' | 'RESOLVED'; openCycleStartSequence?: number },
): void {
  const i = incident(state, incidentId);
  i.revision += 1;
  if (change.attention !== undefined) i.attention = change.attention;
  if (change.status) i.status = change.status;
  if (change.openCycleStartSequence !== undefined) i.openCycleStartSequence = change.openCycleStartSequence;
  for (const r of change.addReportIds ?? []) if (!i.confirmedReportIds.includes(r)) i.confirmedReportIds.push(r);
}

let n = 0;

/** A pending Laya suggestion for a delivered report. */
export function suggest(
  state: DeskState,
  messageId: string,
  s: { action: LocalAction; candidate: string | null; attention: Attention | null; score?: number; reviewState?: SuggestionRecord['reviewState'] },
): SuggestionRecord {
  const suggestion: LocalSuggestion = {
    runId: state.runId,
    reportId: rid(messageId),
    action: s.action,
    candidateIncidentId: s.candidate,
    attention: s.attention,
    scores: s.attention && s.score !== undefined ? [{ label: s.attention, value: s.score, kind: 'probability' }] : [],
    evidenceReportIds: [rid(messageId)],
    baseIncidentVersions: s.candidate ? { [s.candidate]: incident(state, s.candidate).revision } : {},
    inputSignature: SIG,
    provider: 'fixture',
  };
  const record: SuggestionRecord = { suggestionId: `sug-${++n}`, jobId: `job-${n}`, reviewState: s.reviewState ?? 'PENDING', suggestion };
  state.suggestions.push(record);
  return record;
}

/** A pending proposal (Claude or operator-authored). */
export function propose(
  state: DeskState,
  p: {
    incidentId: string;
    addMessageIds: string[];
    relations?: { from: string; to: string; kind: RelationKind }[];
    suggestedAttention?: Attention | null;
    suggestedStatus?: 'OPEN' | 'RESOLVED' | null;
    reviewState?: ProposalRecord['reviewState'];
  },
): ProposalRecord {
  const proposal: IncidentProposal = {
    runId: state.runId,
    proposalId: `prop-${++n}`,
    incidentId: p.incidentId,
    baseIncidentVersions: { [p.incidentId]: incident(state, p.incidentId).revision },
    inputSignature: SIG,
    addReportIds: p.addMessageIds.map(rid),
    relations: (p.relations ?? []).map((r) => ({ reportId: rid(r.from), targetReportId: rid(r.to), kind: r.kind })),
    suggestedStatus: p.suggestedStatus ?? null,
    suggestedAttention: p.suggestedAttention ?? null,
    suggestedSummary: null,
    evidenceReportIds: p.addMessageIds.map(rid),
    uncertainties: [],
    provider: 'fixture',
  };
  const record: ProposalRecord = { jobId: `job-${n}`, submittedByRole: 'worker', reviewState: p.reviewState ?? 'PENDING', proposal };
  state.proposals.push(record);
  return record;
}

export function relate(state: DeskState, from: string, to: string, kind: RelationKind, incidentId: string, confirmed = false): ReportRelation {
  const rel: ReportRelation = {
    runId: state.runId,
    relationId: `rel-${++n}`,
    reportId: rid(from),
    targetReportId: rid(to),
    kind,
    incidentId,
    state: confirmed ? 'CONFIRMED' : 'PROVISIONAL',
    proposalId: null,
    reviewer: confirmed ? 'id:op-1' : null,
  };
  state.relations.push(rel);
  return rel;
}

/** School after the operator confirms R07's concern (§18). */
export function afterR07Confirmed(): DeskState {
  const state = startDesk();
  deliver(state, 'R07');
  confirm(state, 'inc-school', { attention: 'POSSIBLE_LIFE_SAFETY', addReportIds: [rid('R07')] });
  return state;
}

export function deepFreeze<T>(v: T): T {
  if (v && typeof v === 'object') {
    Object.freeze(v);
    for (const x of Object.values(v)) deepFreeze(x);
  }
  return v;
}

export const ids = (xs: { incidentId: string }[]) => xs.map((x) => x.incidentId);
