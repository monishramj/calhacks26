// In-browser LOCAL REPLAY adapter (§10, §19 dev:replay, G8). Same command surface as
// live, no DB, models, credentials, or network. Every record it creates is labeled
// `fixture`, operator commands are labeled `operator`, and each reset starts a new
// run ID so nothing from a replay run can be mistaken for, or written into, live state.
import type {
  Attention,
  ChangeField,
  ContractError,
  DeskAdapter,
  DeskState,
  ErrorCode,
  IncidentProposal,
  IncidentView,
  LocalAction,
  RelationKind,
  Report,
  ReportInput,
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
const fail = (code: ErrorCode, message: string): { ok: false; error: ContractError } => ({
  ok: false,
  error: { code, message },
});

let runCounter = 0;

/** Replay identity for operator commands; there is no SpacetimeDB identity in the browser. */
const REPLAY_OPERATOR = 'replay-operator';

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

  function deliver(messageId: string): Report {
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
    const record: Report = {
      reportId: `rpt-${String(seq).padStart(3, '0')}`,
      receiveSequence: seq,
      receivedAt: now(),
      input,
      provenance: 'fixture',
    };
    state.reports.push(record);
    return record;
  }

  // ponytail: replay signature is the incident revision, not the backend's sha256 over
  // the job input; the live adapter supplies real ones in state.inputSignatures.
  function signature(incident: IncidentView): string {
    return `replay:${incident.incidentId}@r${incident.revision}`;
  }

  function refreshSignatures() {
    state.inputSignatures = Object.fromEntries(state.incidents.map((i) => [i.incidentId, signature(i)]));
  }

  function attachAuthored(report: Report) {
    const authored = fixture.authored[report.input.messageId];
    if (!authored) return; // no authored output: the report stays an unknown for manual review
    const ids = byMessageId();
    const s = authored.suggestion;
    if (s) {
      const incident = state.incidents.find((i) => i.incidentId === s.candidateIncidentId);
      state.suggestions.push({
        suggestionId: `sug-${report.reportId}`,
        jobId: `job-${report.reportId}`,
        reviewState: 'PENDING',
        suggestion: {
        runId: state.runId,
        reportId: report.reportId,
        action: s.action,
        candidateIncidentId: s.candidateIncidentId,
        attention: s.attention,
        scores: [], // no model ran in replay; never fabricate scores
        evidenceReportIds: [report.reportId],
        baseIncidentVersions: incident ? { [incident.incidentId]: incident.revision } : {},
        inputSignature: incident ? signature(incident) : `replay:${report.reportId}`,
        provider: 'fixture',
        },
      });
    }
    const p = authored.proposal;
    if (p) {
      const incident = state.incidents.find((i) => i.incidentId === p.incidentId)!;
      const relations = p.relations.map((r) => ({ reportId: report.reportId, targetReportId: ids.get(r.target)!, kind: r.kind }));
      const proposalId = `prop-${report.reportId}`;
      state.proposals.push({
        jobId: `job-${report.reportId}`,
        submittedByRole: 'worker',
        reviewState: 'PENDING',
        proposal: {
        runId: state.runId,
        proposalId,
        incidentId: incident.incidentId,
        baseIncidentVersions: { [incident.incidentId]: incident.revision },
        inputSignature: signature(incident),
        addReportIds: [report.reportId],
        relations,
        suggestedStatus: null,
        suggestedAttention: p.suggestedAttention,
        suggestedSummary: null,
        evidenceReportIds: [report.reportId, ...relations.map((r) => r.targetReportId)],
        uncertainties: p.uncertainties,
        provider: 'fixture',
        },
      });
      addProvisionalRelations(state.proposals.at(-1)!.proposal);
    }
  }

  function addProvisionalRelations(proposal: IncidentProposal) {
    proposal.relations.forEach((r, i) =>
      state.relations.push({
        runId: state.runId,
        relationId: `rel-${proposal.proposalId}-${i}`,
        ...r,
        incidentId: proposal.incidentId,
        state: 'PROVISIONAL',
        proposalId: proposal.proposalId,
        reviewer: null,
      }),
    );
  }

  function pushEvent(e: Omit<ReviewEvent, 'sequence' | 'runId' | 'actorRole' | 'actorIdentity'>) {
    state.reviewEvents.push({
      ...e,
      runId: state.runId,
      actorRole: 'operator',
      actorIdentity: REPLAY_OPERATOR,
      sequence: state.reviewEvents.length + 1,
    });
  }

  function start() {
    runCounter += 1;
    const runId = `replay-${Date.now().toString(36)}-${runCounter}`;
    state = {
      runId,
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
    }
    updateScenario();
  }

  function updateScenario() {
    refreshSignatures();
    const done = scriptPosition >= fixture.script.length;
    state.scenario = {
      runId: state.runId,
      exerciseVersion: fixture.exerciseVersion,
      seed: 'none · fixed authored order',
      logicalClock: scriptPosition,
      deliveredCount: fixture.initial.deliver.length + scriptPosition,
      totalCount: fixture.initial.deliver.length + fixture.script.length,
      awaitingPresenter: !done,
      nextGate: done ? null : 'SEND_NEXT_REPORT',
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
      const dup = state.reports.find((r) => r.input.sourceId === input.sourceId && r.input.messageId === input.messageId);
      if (dup) return Promise.resolve(ok({ reportId: dup.reportId, duplicate: true }));
      if (input.runId !== state.runId) return Promise.resolve(fail('WRONG_RUN', 'Report is for another run'));
      if (input.origin === 'radio')
        return Promise.resolve(fail('UNAUTHORIZED', 'Replay has no authorized radio bridge identity'));
      if (!input.text) return Promise.resolve(fail('INVALID_INPUT', 'Report text is empty'));
      const seq = state.reports.length + 1;
      const record: Report = {
        reportId: `rpt-${String(seq).padStart(3, '0')}`,
        receiveSequence: seq,
        receivedAt: now(),
        input: structuredClone(input),
        // Typed into a browser replay, not received live.
        provenance: input.origin === 'operator' ? 'simulated' : 'fixture',
      };
      state.reports.push(record);
      emit();
      return Promise.resolve(ok({ reportId: record.reportId, duplicate: false }));
    },

    submitLocalSuggestion() {
      return Promise.resolve(fail('SERVICE_UNAVAILABLE', 'No local inference worker in browser replay'));
    },

    claimJob() {
      return Promise.resolve(fail('SERVICE_UNAVAILABLE', 'No jobs in browser replay'));
    },

    submitIncidentProposal({ proposal }) {
      if (proposal.runId !== state.runId) return Promise.resolve(fail('WRONG_RUN', 'Proposal is for another run'));
      if (proposal.provider !== 'operator')
        return Promise.resolve(fail('UNAUTHORIZED', 'Only operator-authored proposals are accepted in replay'));
      const stale = staleCheck(proposal.baseIncidentVersions);
      if (!stale.ok) return Promise.resolve(stale);
      const known = new Set(state.reports.map((r) => r.reportId));
      if (proposal.addReportIds.some((id) => !known.has(id)))
        return Promise.resolve(fail('INVALID_SOURCE', 'Proposal references an unknown report'));
      if (proposal.inputSignature !== state.inputSignatures[proposal.incidentId])
        return Promise.resolve(fail('STALE_REVISION', 'Proposal signature does not match the current incident'));
      if (state.proposals.some((p) => p.proposal.proposalId === proposal.proposalId))
        return Promise.resolve(ok({ proposalId: proposal.proposalId }));
      state.proposals.push({ jobId: null, submittedByRole: 'operator', reviewState: 'PENDING', proposal: structuredClone(proposal) });
      addProvisionalRelations(proposal);
      emit();
      return Promise.resolve(ok({ proposalId: proposal.proposalId }));
    },

    approveProposal({ runId, commandId, proposalId, inputSignature, baseIncidentVersions }) {
      return once(runId, commandId, () => {
        const record = state.proposals.find((p) => p.proposal.proposalId === proposalId);
        if (!record) return fail('INVALID_INPUT', `Unknown proposal ${proposalId}`);
        if (record.reviewState !== 'PENDING') return fail('INVALID_INPUT', `Proposal is already ${record.reviewState}`);
        const proposal = record.proposal;
        // Re-validate what the operator saw and what the proposal was made against.
        const stale = staleCheck(baseIncidentVersions);
        if (!stale.ok) return stale;
        const staleProposal = staleCheck(proposal.baseIncidentVersions);
        if (!staleProposal.ok) return staleProposal;
        if (inputSignature !== state.inputSignatures[proposal.incidentId])
          return fail('STALE_REVISION', `${proposal.incidentId} changed since this proposal was shown`);
        const incident = state.incidents.find((i) => i.incidentId === proposal.incidentId)!;
        const acceptedChanges = applyProposal(incident, proposal);
        const prior = incident.revision;
        incident.revision += 1;
        record.reviewState = 'APPROVED';
        for (const rel of state.relations)
          if (rel.proposalId === proposalId) Object.assign(rel, { state: 'CONFIRMED', reviewer: REPLAY_OPERATOR });
        refreshSignatures();
        pushEvent({
          commandId,
          incidentId: incident.incidentId,
          proposalId,
          priorRevision: prior,
          newRevision: incident.revision,
          acceptedChanges,
          reason: null,
          sourceReportIds: proposal.evidenceReportIds,
        });
        return ok({ incidentId: incident.incidentId, revision: incident.revision });
      });
    },

    rejectProposal({ runId, commandId, proposalId, reason }) {
      return once(runId, commandId, () => {
        const record = state.proposals.find((p) => p.proposal.proposalId === proposalId);
        if (!record) return fail('INVALID_INPUT', `Unknown proposal ${proposalId}`);
        if (record.reviewState !== 'PENDING') return fail('INVALID_INPUT', `Proposal is already ${record.reviewState}`);
        if (!reason.trim()) return fail('INVALID_INPUT', 'A rejection needs a reason');
        record.reviewState = 'REJECTED';
        // Provisional links from a rejected proposal go away; the originals stay.
        state.relations = state.relations.filter((rel) => rel.proposalId !== proposalId);
        const incident = state.incidents.find((i) => i.incidentId === record.proposal.incidentId);
        pushEvent({
          commandId,
          incidentId: record.proposal.incidentId,
          proposalId,
          priorRevision: incident?.revision ?? 0,
          newRevision: incident?.revision ?? 0,
          acceptedChanges: [],
          reason,
          sourceReportIds: [],
        });
        return ok(null);
      });
    },

    operatorEdit({ runId, commandId, incidentId, baseRevision, changes: edit, reason, sourceReportIds }) {
      return once(runId, commandId, () => {
        if (!reason?.trim() && sourceReportIds.length === 0) return fail('INVALID_INPUT', 'An override needs a reason');
        const { attention, status } = edit;
        const incident = state.incidents.find((i) => i.incidentId === incidentId);
        if (!incident) return fail('INVALID_INPUT', `Unknown incident ${incidentId}`);
        if (incident.revision !== baseRevision)
          return fail('STALE_REVISION', `${incidentId} is at revision ${incident.revision}, edit was made against ${baseRevision}`);
        const acceptedChanges: ChangeField[] = [];
        if (attention !== undefined && attention !== incident.attention) {
          acceptedChanges.push('attention');
          incident.attention = attention;
        }
        if (status && status !== incident.status) {
          acceptedChanges.push('status');
          // Reopening keeps the ID and history but starts a new unresolved cycle (§17).
          if (status === 'OPEN') incident.openCycleStartSequence = state.reports.length;
          incident.status = status;
        }
        if (acceptedChanges.length === 0) return fail('INVALID_INPUT', 'Edit changes nothing');
        const prior = incident.revision;
        incident.revision += 1;
        refreshSignatures();
        pushEvent({ commandId, incidentId, proposalId: null, priorRevision: prior, newRevision: incident.revision, acceptedChanges, reason, sourceReportIds });
        return ok({ incidentId, revision: incident.revision });
      });
    },

    advanceScenario({ runId, commandId, expectedDeliveredCount }) {
      return once(runId, commandId, () => {
        if (expectedDeliveredCount !== state.scenario!.deliveredCount)
          return fail('STALE_REVISION', `Scenario is at ${state.scenario!.deliveredCount} delivered, not ${expectedDeliveredCount}`);
        const messageId = fixture.script[scriptPosition];
        if (!messageId) return ok(null);
        const report = deliver(messageId);
        attachAuthored(report);
        scriptPosition += 1;
        updateScenario();
        return ok({ reportId: report.reportId });
      });
    },

    resetRun({ runId }) {
      if (runId !== state.runId) return Promise.resolve(fail('WRONG_RUN', `Run ${runId} is not the active replay run`));
      start();
      emit();
      return Promise.resolve(ok({ runId: state.runId }));
    },
  };

  function applyProposal(incident: IncidentView, proposal: IncidentProposal): ChangeField[] {
    const changes: ChangeField[] = [];
    const added = proposal.addReportIds.filter((id) => !incident.confirmedReportIds.includes(id));
    if (added.length) {
      incident.confirmedReportIds.push(...added);
      changes.push('addReportIds');
    }
    if (proposal.relations.length) changes.push('relations');
    if (proposal.suggestedAttention && proposal.suggestedAttention !== incident.attention) {
      changes.push('attention');
      incident.attention = proposal.suggestedAttention;
    }
    if (proposal.suggestedStatus && proposal.suggestedStatus !== incident.status) {
      changes.push('status');
      incident.status = proposal.suggestedStatus;
    }
    if (proposal.suggestedSummary) {
      incident.summary = proposal.suggestedSummary;
      changes.push('summary');
    }
    return changes;
  }
}
