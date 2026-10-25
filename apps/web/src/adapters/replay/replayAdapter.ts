// In-browser LOCAL REPLAY adapter (§10, §19 dev:replay, G8). Same command surface as
// live, no DB, models, credentials, or network. Every record it creates is labeled
// `fixture`, operator commands are labeled `operator`, and each reset starts a new
// run ID so nothing from a replay run can be mistaken for, or written into, live state.
import type {
  AdapterError,
  Attention,
  DeskAdapter,
  DeskState,
  ErrorCode,
  IncidentProposal,
  IncidentView,
  LocalAction,
  ProposalRecord,
  RelationKind,
  ReportInput,
  ReportRecord,
  Result,
  ReviewEvent,
} from '../contract';

export type ReplayFixture = {
  exerciseVersion: string;
  reports: Record<string, { sourceId: string; placeId: string | null; sentAt: string | null; text: string }>;
  initial: {
    deliver: string[];
    incidents: { incidentId: string; placeId: string | null; attention: Attention | null; messageIds: string[]; summary: string | null }[];
  };
  script: string[];
  authored: Record<
    string,
    {
      suggestion: { action: LocalAction; candidateIncidentId: string | null; attention: Attention | null } | null;
      proposal: {
        incidentId: string;
        relations: { kind: RelationKind; target: string }[];
        suggestedAttention: Attention | null;
        uncertainties: string[];
      } | null;
    }
  >;
};

type Options = { now?: () => string };

const ok = <T>(value: T): Result<T> => ({ ok: true, value });
const fail = (code: ErrorCode, message: string): { ok: false; error: AdapterError } => ({
  ok: false,
  error: { code, message },
});

let runCounter = 0;

export function createReplayAdapter(fixture: ReplayFixture, options: Options = {}): DeskAdapter {
  const now = options.now ?? (() => new Date().toISOString());
  const listeners = new Set<(s: DeskState) => void>();
  let state: DeskState;
  let commandResults = new Map<string, Result<unknown>>();
  let scriptPosition = 0;

  const byMessageId = () => new Map(state.reports.map((r) => [r.input.messageId, r.reportId]));

  function emit() {
    const snapshot = structuredClone(state);
    for (const l of listeners) l(snapshot);
  }

  function deliver(messageId: string): ReportRecord {
    const src = fixture.reports[messageId];
    const seq = state.reports.length + 1;
    const input: ReportInput = {
      runId: state.runId,
      sourceId: src.sourceId,
      messageId,
      text: src.text,
      origin: 'scenario',
      sentAt: src.sentAt,
      reportedEventAt: null,
      reportedLocation: src.placeId ? { placeId: src.placeId, source: 'sender_explicit' } : null,
      transport: {
        verification: 'not_applicable',
        encoding: 'not_applicable',
        measurementSource: 'not_applicable',
        originalBytes: null,
        applicationPacketBytes: null,
      },
    };
    const record: ReportRecord = {
      reportId: `rpt-${String(seq).padStart(3, '0')}`,
      receiveSequence: seq,
      receivedAt: now(),
      input,
      provenance: 'fixture',
    };
    state.reports.push(record);
    return record;
  }

  function signature(incident: IncidentView, extraReportIds: string[]): string {
    return `${[...incident.confirmedReportIds, ...extraReportIds].join(',')}|${incident.incidentId}@${incident.revision}`;
  }

  function attachAuthored(report: ReportRecord) {
    const authored = fixture.authored[report.input.messageId];
    if (!authored) return; // no authored output: the report stays an unknown for manual review
    const ids = byMessageId();
    const s = authored.suggestion;
    if (s) {
      const incident = state.incidents.find((i) => i.incidentId === s.candidateIncidentId);
      state.suggestions.push({
        runId: state.runId,
        reportId: report.reportId,
        action: s.action,
        candidateIncidentId: s.candidateIncidentId,
        attention: s.attention,
        scores: [], // no model ran in replay; never fabricate scores
        evidenceReportIds: [report.reportId],
        baseIncidentVersions: incident ? { [incident.incidentId]: incident.revision } : {},
        inputSignature: incident ? signature(incident, [report.reportId]) : report.reportId,
        provider: 'fixture',
      });
    }
    const p = authored.proposal;
    if (p) {
      const incident = state.incidents.find((i) => i.incidentId === p.incidentId)!;
      const relations = p.relations.map((r) => ({ reportId: report.reportId, targetReportId: ids.get(r.target)!, kind: r.kind }));
      state.proposals.push({
        runId: state.runId,
        proposalId: `prop-${report.reportId}`,
        incidentId: incident.incidentId,
        baseIncidentVersions: { [incident.incidentId]: incident.revision },
        inputSignature: signature(incident, [report.reportId]),
        addReportIds: [report.reportId],
        relations,
        suggestedStatus: null,
        suggestedAttention: p.suggestedAttention,
        suggestedSummary: null,
        evidenceReportIds: [report.reportId, ...relations.map((r) => r.targetReportId)],
        uncertainties: p.uncertainties,
        provider: 'fixture',
        reviewState: 'PENDING',
      });
    }
  }

  function pushEvent(e: Omit<ReviewEvent, 'sequence'>) {
    state.reviewEvents.push({ ...e, sequence: state.reviewEvents.length + 1 });
  }

  function start() {
    runCounter += 1;
    const runId = `replay-${Date.now().toString(36)}-${runCounter}`;
    state = {
      runId,
      mode: 'LOCAL REPLAY',
      sourceProvenance: `fixture · §18 exercise ${fixture.exerciseVersion}`,
      inferenceProvenance: 'fixture · authored outputs, no model ran',
      reports: [],
      incidents: [],
      suggestions: [],
      proposals: [],
      reviewEvents: [],
      scenario: { delivered: 0, total: 0, nextMessageId: null },
    };
    commandResults = new Map();
    scriptPosition = 0;
    for (const m of fixture.initial.deliver) deliver(m);
    const ids = byMessageId();
    for (const inc of fixture.initial.incidents) {
      const confirmedReportIds = inc.messageIds.map((m) => ids.get(m)!);
      const firstSeq = Math.min(...confirmedReportIds.map((id) => state.reports.find((r) => r.reportId === id)!.receiveSequence));
      state.incidents.push({
        runId,
        incidentId: inc.incidentId,
        revision: 1,
        status: 'OPEN',
        attention: inc.attention,
        confirmedPlaceId: inc.placeId,
        confirmedReportIds,
        summary: inc.summary,
        openCycleStartSequence: firstSeq,
      });
      pushEvent({
        commandId: `seed-${inc.incidentId}`,
        actor: 'fixture',
        incidentId: inc.incidentId,
        proposalId: null,
        priorRevision: 0,
        newRevision: 1,
        changes: [`authored starting state: ${inc.attention ?? 'unknown'}, reports ${inc.messageIds.join(', ')}`],
        reason: 'Authored §18 starting condition (fixture), not a model output',
      });
    }
    updateScenario();
  }

  function updateScenario() {
    const total = fixture.initial.deliver.length + fixture.script.length;
    state.scenario = {
      delivered: fixture.initial.deliver.length + scriptPosition,
      total,
      nextMessageId: fixture.script[scriptPosition] ?? null,
    };
  }

  /** Runs a mutating command once per commandId; repeats return the recorded result. */
  function once<T>(runId: string, commandId: string, body: () => Result<T>): Promise<Result<T>> {
    if (runId !== state.runId) return Promise.resolve(fail('WRONG_RUN', `Run ${runId} is not the active replay run`));
    if (!commandId) return Promise.resolve(fail('INVALID_INPUT', 'commandId is required'));
    const prior = commandResults.get(commandId);
    if (prior) return Promise.resolve(prior as Result<T>);
    const result = body();
    commandResults.set(commandId, result);
    if (result.ok) emit();
    return Promise.resolve(result);
  }

  function staleCheck(base: Record<string, number>): Result<null> {
    for (const [incidentId, rev] of Object.entries(base)) {
      const current = state.incidents.find((i) => i.incidentId === incidentId);
      if (!current) return fail('INVALID_INPUT', `Unknown incident ${incidentId}`);
      if (current.revision !== rev)
        return fail('STALE_REVISION', `${incidentId} is at revision ${current.revision}, proposal was made against ${rev}`);
    }
    return ok(null);
  }

  start();

  return {
    subscribeState(listener) {
      listeners.add(listener);
      listener(structuredClone(state));
      return () => listeners.delete(listener);
    },

    receiveReport(input) {
      if (input.runId !== state.runId) return Promise.resolve(fail('WRONG_RUN', 'Report is for another run'));
      if (input.origin === 'radio')
        return Promise.resolve(fail('UNAUTHORIZED', 'Replay has no authorized radio bridge identity'));
      if (!input.text) return Promise.resolve(fail('INVALID_INPUT', 'Report text is empty'));
      const seq = state.reports.length + 1;
      const record: ReportRecord = {
        reportId: `rpt-${String(seq).padStart(3, '0')}`,
        receiveSequence: seq,
        receivedAt: now(),
        input: structuredClone(input),
        provenance: input.origin === 'operator' ? 'operator' : 'fixture',
      };
      state.reports.push(record);
      emit();
      return Promise.resolve(ok({ reportId: record.reportId }));
    },

    submitLocalSuggestion() {
      return Promise.resolve(fail('SERVICE_UNAVAILABLE', 'No local inference worker in browser replay'));
    },

    claimJob() {
      return Promise.resolve(fail('SERVICE_UNAVAILABLE', 'No jobs in browser replay'));
    },

    submitIncidentProposal(proposal: IncidentProposal) {
      if (proposal.runId !== state.runId) return Promise.resolve(fail('WRONG_RUN', 'Proposal is for another run'));
      if (proposal.provider !== 'operator')
        return Promise.resolve(fail('UNAUTHORIZED', 'Only operator-authored proposals are accepted in replay'));
      const stale = staleCheck(proposal.baseIncidentVersions);
      if (!stale.ok) return Promise.resolve(stale);
      const known = new Set(state.reports.map((r) => r.reportId));
      if (proposal.addReportIds.some((id) => !known.has(id)))
        return Promise.resolve(fail('INVALID_SOURCE', 'Proposal references an unknown report'));
      if (state.proposals.some((p) => p.proposalId === proposal.proposalId))
        return Promise.resolve(ok({ proposalId: proposal.proposalId }));
      state.proposals.push({ ...structuredClone(proposal), reviewState: 'PENDING' });
      emit();
      return Promise.resolve(ok({ proposalId: proposal.proposalId }));
    },

    approveProposal({ runId, commandId, proposalId }) {
      return once(runId, commandId, () => {
        const proposal = state.proposals.find((p) => p.proposalId === proposalId);
        if (!proposal) return fail('INVALID_INPUT', `Unknown proposal ${proposalId}`);
        if (proposal.reviewState !== 'PENDING') return fail('INVALID_INPUT', `Proposal is already ${proposal.reviewState}`);
        const stale = staleCheck(proposal.baseIncidentVersions);
        if (!stale.ok) return stale;
        const incident = state.incidents.find((i) => i.incidentId === proposal.incidentId)!;
        const changes = applyProposal(incident, proposal);
        const prior = incident.revision;
        incident.revision += 1;
        proposal.reviewState = 'APPROVED';
        pushEvent({
          commandId,
          actor: 'operator',
          incidentId: incident.incidentId,
          proposalId,
          priorRevision: prior,
          newRevision: incident.revision,
          changes,
          reason: null,
        });
        return ok({ incidentId: incident.incidentId, revision: incident.revision });
      });
    },

    rejectProposal({ runId, commandId, proposalId, reason }) {
      return once(runId, commandId, () => {
        const proposal = state.proposals.find((p) => p.proposalId === proposalId);
        if (!proposal) return fail('INVALID_INPUT', `Unknown proposal ${proposalId}`);
        if (proposal.reviewState !== 'PENDING') return fail('INVALID_INPUT', `Proposal is already ${proposal.reviewState}`);
        if (!reason.trim()) return fail('INVALID_INPUT', 'A rejection needs a reason');
        proposal.reviewState = 'REJECTED';
        const incident = state.incidents.find((i) => i.incidentId === proposal.incidentId);
        pushEvent({
          commandId,
          actor: 'operator',
          incidentId: proposal.incidentId,
          proposalId,
          priorRevision: incident?.revision ?? 0,
          newRevision: incident?.revision ?? 0,
          changes: ['proposal rejected; originals kept'],
          reason,
        });
        return ok(null);
      });
    },

    operatorEdit({ runId, commandId, incidentId, baseRevision, attention, status, reason }) {
      return once(runId, commandId, () => {
        if (!reason.trim()) return fail('INVALID_INPUT', 'An override needs a reason');
        const incident = state.incidents.find((i) => i.incidentId === incidentId);
        if (!incident) return fail('INVALID_INPUT', `Unknown incident ${incidentId}`);
        if (incident.revision !== baseRevision)
          return fail('STALE_REVISION', `${incidentId} is at revision ${incident.revision}, edit was made against ${baseRevision}`);
        const changes: string[] = [];
        if (attention !== undefined && attention !== incident.attention) {
          changes.push(`attention ${incident.attention ?? 'unknown'} → ${attention ?? 'unknown'}`);
          incident.attention = attention;
        }
        if (status && status !== incident.status) {
          changes.push(`status ${incident.status} → ${status}`);
          if (status === 'OPEN') {
            // Reopening keeps the ID and history but starts a new unresolved cycle (§17).
            incident.openCycleStartSequence = state.reports.length;
            changes.push(`new open cycle from sequence ${incident.openCycleStartSequence}`);
          }
          incident.status = status;
        }
        if (changes.length === 0) return fail('INVALID_INPUT', 'Edit changes nothing');
        const prior = incident.revision;
        incident.revision += 1;
        pushEvent({ commandId, actor: 'operator', incidentId, proposalId: null, priorRevision: prior, newRevision: incident.revision, changes, reason });
        return ok({ incidentId, revision: incident.revision });
      });
    },

    advanceScenario({ runId, commandId }) {
      return once(runId, commandId, () => {
        const messageId = fixture.script[scriptPosition];
        if (!messageId) return ok(null);
        const report = deliver(messageId);
        attachAuthored(report);
        scriptPosition += 1;
        updateScenario();
        return ok({ reportId: report.reportId });
      });
    },

    resetRun() {
      start();
      emit();
      return Promise.resolve(ok({ runId: state.runId }));
    },
  };

  function applyProposal(incident: IncidentView, proposal: ProposalRecord): string[] {
    const changes: string[] = [];
    const messageOf = new Map(state.reports.map((r) => [r.reportId, r.input.messageId]));
    for (const id of proposal.addReportIds) {
      if (!incident.confirmedReportIds.includes(id)) {
        incident.confirmedReportIds.push(id);
        changes.push(`linked ${messageOf.get(id)}`);
      }
    }
    for (const r of proposal.relations) {
      changes.push(`${messageOf.get(r.reportId)} ${r.kind.toLowerCase()} of ${messageOf.get(r.targetReportId)}`);
    }
    if (proposal.suggestedAttention && proposal.suggestedAttention !== incident.attention) {
      changes.push(`attention ${incident.attention ?? 'unknown'} → ${proposal.suggestedAttention}`);
      incident.attention = proposal.suggestedAttention;
    }
    if (proposal.suggestedStatus && proposal.suggestedStatus !== incident.status) {
      changes.push(`status ${incident.status} → ${proposal.suggestedStatus}`);
      incident.status = proposal.suggestedStatus;
    }
    if (proposal.suggestedSummary) {
      incident.summary = proposal.suggestedSummary;
      changes.push('summary updated');
    }
    return changes;
  }
}
