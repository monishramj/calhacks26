// Plays back one recorded live run (scripts/record_run.ts): step k is the database after the k-th delivered
// report. Rebuilds the same DeskState the live adapter does. No model or database runs in the browser, and
// operator commands are part of the recording.
import type { ContractError, DeskAdapter, DeskState } from '../contract';

export type Recording = {
  exerciseVersion: string;
  runId: string;
  steps: { messageId: string; add: Record<string, string[]>; remove: Record<string, string[]> }[];
};

const fail = (message: string): { ok: false; error: ContractError } => ({ ok: false, error: { code: 'SERVICE_UNAVAILABLE', message } });

export function createRecordingAdapter(rec: Recording): DeskAdapter {
  const listeners = new Set<(s: DeskState) => void>();
  let position = 0;
  let resets = 0;
  let tables = new Map<string, Set<string>>();

  const runId = () => `${rec.runId}·${resets}`;

  function apply(step: Recording['steps'][number]) {
    for (const [t, rows] of Object.entries(step.remove)) for (const r of rows) tables.get(t)?.delete(r);
    for (const [t, rows] of Object.entries(step.add)) {
      if (!tables.has(t)) tables.set(t, new Set());
      for (const r of rows) tables.get(t)!.add(r);
    }
  }

  function state(): DeskState {
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

  const recorded = () => Promise.resolve(fail('Operator actions in this run are part of the recording'));

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
      resets += 1;
      emit();
      return { ok: true, value: { runId: runId() } };
    },
    receiveReport: recorded,
    submitLocalSuggestion: recorded,
    claimJob: recorded,
    submitIncidentProposal: recorded,
    approveProposal: recorded,
    rejectProposal: recorded,
    operatorEdit: recorded,
  };
}
