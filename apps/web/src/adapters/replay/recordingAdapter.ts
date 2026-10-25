// Plays back one recorded live run (scripts/record_run.ts): step k is the database after the k-th delivered
// report. Rebuilds the same DeskState the live adapter does. No model or database runs in the browser, and
// operator commands are part of the recording.
import type { Attention, ContractError, DeskAdapter, DeskState } from '../contract';

export type Recording = {
  exerciseVersion: string;
  runId: string;
  steps: { messageId: string; add: Record<string, string[]>; remove: Record<string, string[]> }[];
};

const HOLD = 6;
const fail = (message: string): { ok: false; error: ContractError } => ({ ok: false, error: { code: 'SERVICE_UNAVAILABLE', message } });

export function createRecordingAdapter(rec: Recording): DeskAdapter {
  const listeners = new Set<(s: DeskState) => void>();
  let position = 0;
  let tables = new Map<string, Set<string>>();

  // The recorded rows carry this run ID; the shared view rules only count rows of the state's run.
  const runId = () => rec.runId;

  function apply(step: Recording['steps'][number]) {
    for (const [t, rows] of Object.entries(step.remove)) for (const r of rows) tables.get(t)?.delete(r);
    for (const [t, rows] of Object.entries(step.add)) {
      if (!tables.has(t)) tables.set(t, new Set());
      for (const r of rows) tables.get(t)!.add(r);
    }
  }

  // The presenter's own Approve / Reject clicks, applied on top of the recording (the recorded operator
  // may make the same decision a few reports later; applying it twice changes nothing).
  let decisions = new Map<string, 'APPROVED' | 'REJECTED'>();
  let edits: { incidentId: string; reportIds: string[]; attention: Attention | null; placeId: string | null }[] = [];

  function overlay(s: DeskState): DeskState {
    for (const p of s.proposals) {
      const d = decisions.get(p.proposal.proposalId);
      if (!d || p.reviewState !== 'PENDING') continue;
      p.reviewState = d;
      const inc = s.incidents.find((i) => i.incidentId === p.proposal.incidentId);
      if (d === 'APPROVED' && inc) {
        for (const id of p.proposal.addReportIds) if (!inc.confirmedReportIds.includes(id)) inc.confirmedReportIds.push(id);
        if (p.proposal.suggestedAttention) inc.attention = p.proposal.suggestedAttention;
      }
    }
    for (const e of edits) {
      const inc = s.incidents.find((i) => i.incidentId === e.incidentId);
      if (inc) {
        for (const id of e.reportIds) if (!inc.confirmedReportIds.includes(id)) inc.confirmedReportIds.push(id);
        if (e.attention) inc.attention = e.attention;
      } else {
        const seq = Math.min(...e.reportIds.map((id) => s.reports.find((r) => r.reportId === id)?.receiveSequence ?? 0));
        s.incidents.push({ runId: s.runId, incidentId: e.incidentId, revision: 1, status: 'OPEN', attention: e.attention,
          confirmedPlaceId: e.placeId, confirmedReportIds: [...e.reportIds], summary: null, openCycleStartSequence: seq });
      }
    }
    return s;
  }

  /** Reports the presenter approved themselves; their recorded approval is never held back. */
  let approvedByPresenter = new Set<string>();
  const stepOf = new Map(rec.steps.map((s, i) => [s.messageId, i]));

  /**
   * Holds back the recorded operator's approvals for the newest HOLD reports, so they sit in the review band
   * with working Approve / Reject until the presenter acts or the recorded operator catches up.
   */
  function hold(s: DeskState): DeskState {
    const recent = new Set(s.reports.filter((r) => position - (stepOf.get(r.input.messageId) ?? 0) <= HOLD && !approvedByPresenter.has(r.reportId)).map((r) => r.reportId));
    const byOperator = s.reviewEvents.filter((e) => e.actorRole === 'operator');
    const held = new Set<string>();
    const heldEvents = new Set<number>();
    for (const e of byOperator) {
      const proposal = e.proposalId ? s.proposals.find((p) => p.proposal.proposalId === e.proposalId) : undefined;
      const ids = proposal ? proposal.proposal.addReportIds : e.sourceReportIds;
      if (ids.length === 0 || !ids.every((id) => recent.has(id))) continue;
      ids.forEach((id) => held.add(id));
      heldEvents.add(e.sequence);
      if (proposal && proposal.reviewState !== 'PENDING') proposal.reviewState = 'PENDING';
    }
    if (held.size === 0) return s;
    s.reviewEvents = s.reviewEvents.filter((e) => !heldEvents.has(e.sequence));
    for (const i of s.incidents) i.confirmedReportIds = i.confirmedReportIds.filter((id) => !held.has(id));
    s.incidents = s.incidents.filter((i) => i.confirmedReportIds.length > 0);
    for (const sg of s.suggestions) if (held.has(sg.suggestion.reportId)) sg.reviewState = 'PENDING';
    return s;
  }

  function state(): DeskState {
    return overlay(hold(recorded()));
  }

  function recorded(): DeskState {
    const rows = (t: string) => [...(tables.get(t) ?? [])].map((j) => JSON.parse(j));
    const done = position >= rec.steps.length;
    return {
      runId: runId(),
      mode: 'LOCAL REPLAY',
      reports: rows('report').sort((a, b) => a.receiveSequence - b.receiveSequence),
      incidents: rows('incident'),
      relations: rows('relation'),
      suggestions: rows('suggestion'),
      proposals: rows('proposal'),
      reviewEvents: rows('review_event').sort((a, b) => a.sequence - b.sequence),
      scenario: {
        runId: runId(),
        exerciseVersion: rec.exerciseVersion,
        seed: 'none · fixed authored order',
        logicalClock: position,
        deliveredCount: position,
        totalCount: rec.steps.length,
        awaitingPresenter: !done,
        nextGate: done ? null : 'SEND_NEXT_REPORT',
      },
      inputSignatures: Object.fromEntries(rows('incident_signature').map((r) => [r.incidentId, r.signature])),
      pictures: rows('incident_picture'),
      checks: rows('claude_check'),
    };
  }

  function emit() {
    const s = state();
    for (const l of listeners) l(structuredClone(s));
  }

  const unavailable = () => Promise.resolve(fail('No live inputs during playback'));

  return {
    subscribeState(listener) {
      listeners.add(listener);
      listener(state());
      return () => listeners.delete(listener);
    },
    async advanceScenario({ runId: r, expectedDeliveredCount }) {
      if (r !== runId()) return { ok: false, error: { code: 'WRONG_RUN', message: `Run ${r} is not the active run` } };
      if (expectedDeliveredCount !== position)
        return { ok: false, error: { code: 'STALE_REVISION', message: `Scenario is at ${position} delivered, not ${expectedDeliveredCount}` } };
      const step = rec.steps[position];
      if (!step) return { ok: true, value: null };
      apply(step);
      position += 1;
      emit();
      const report = state().reports.find((x) => x.input.messageId === step.messageId);
      return { ok: true, value: { reportId: report?.reportId ?? step.messageId } };
    },
    async resetRun() {
      tables = new Map();
      position = 0;
      decisions = new Map();
      edits = [];
      approvedByPresenter = new Set();
      emit();
      return { ok: true, value: { runId: runId() } };
    },
    async approveProposal({ proposalId }) {
      const p = state().proposals.find((x) => x.proposal.proposalId === proposalId);
      if (!p || p.reviewState !== 'PENDING') return fail('This item was already decided');
      decisions.set(proposalId, 'APPROVED');
      p.proposal.addReportIds.forEach((id) => approvedByPresenter.add(id));
      emit();
      const inc = state().incidents.find((i) => i.incidentId === p.proposal.incidentId);
      return { ok: true, value: { incidentId: p.proposal.incidentId, revision: inc?.revision ?? 1 } };
    },
    async rejectProposal({ proposalId }) {
      decisions.set(proposalId, 'REJECTED');
      emit();
      return { ok: true, value: null };
    },
    async operatorEdit({ incidentId, changes }) {
      (changes.addReportIds ?? []).forEach((id) => approvedByPresenter.add(id));
      edits.push({ incidentId, reportIds: changes.addReportIds ?? [], attention: changes.attention ?? null, placeId: changes.confirmedPlaceId ?? null });
      emit();
      return { ok: true, value: { incidentId, revision: 1 } };
    },
    receiveReport: unavailable,
    submitLocalSuggestion: unavailable,
    claimJob: unavailable,
    submitIncidentProposal: unavailable,
  };
}
