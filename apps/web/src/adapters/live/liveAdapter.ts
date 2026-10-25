// LIVE adapter: SpacetimeDB subscription -> replay-shaped DeskState; each command -> its reducer.
// Rows are subscribed through the generated bindings; reducers are called over HTTP so a rejected
// call comes back as "CODE: message" (HTTP 530) and maps straight to a contract Result error.
import type { ContractError, DeskAdapter, DeskState, ErrorCode, Result, ReportInput } from '../contract';
import type { ReplayFixture } from '../replay';
import { DbConnection } from './module_bindings';

type Settings = { uri: string; database: string; token?: string; simToken?: string };

const CODES = new Set<string>([
  'WRONG_RUN', 'INVALID_INPUT', 'INVALID_SOURCE', 'STALE_REVISION', 'UNAUTHORIZED', 'SERVICE_UNAVAILABLE',
]);
const fail = (code: ErrorCode, message: string): { ok: false; error: ContractError } => ({ ok: false, error: { code, message } });
const ok = <T>(value: T): Result<T> => ({ ok: true, value });

export function createLiveAdapter(fixture: ReplayFixture, s: Settings): DeskAdapter {
  const http = s.uri.replace(/^ws/, 'http');
  const listeners = new Set<(st: DeskState) => void>();
  let state: DeskState | null = null;
  let conn: DbConnection | null = null;
  const order = [...fixture.initial.deliver, ...fixture.script];

  async function call(reducer: string, arg: unknown, token = s.token): Promise<Result<null>> {
    try {
      const res = await fetch(`${http}/v1/database/${s.database}/call/${reducer}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify(Array.isArray(arg) ? arg : [typeof arg === 'string' ? arg : JSON.stringify(arg)]),
      });
      if (res.ok) return ok(null);
      const text = (await res.text()).trim();
      const code = text.split(':')[0];
      return CODES.has(code) ? fail(code as ErrorCode, text.slice(code.length + 1).trim()) : fail('SERVICE_UNAVAILABLE', text || `HTTP ${res.status}`);
    } catch (e) {
      return fail('SERVICE_UNAVAILABLE', `SpacetimeDB unreachable: ${(e as Error).message}`);
    }
  }

  /** Resolves with pick(state) once the subscription shows it (a reducer returns no value). */
  function seen<T>(pick: (st: DeskState) => T | undefined): Promise<T | undefined> {
    return new Promise((resolve) => {
      const done = (v: T | undefined) => (listeners.delete(check), clearTimeout(timer), resolve(v));
      const check = (st: DeskState) => {
        const v = pick(st);
        if (v !== undefined) done(v);
      };
      const timer = setTimeout(() => done(undefined), 3000);
      listeners.add(check);
      if (state) check(state);
    });
  }

  /** Runs a reducer, then waits for its effect to appear; a timeout is a live-state error, not success. */
  async function run<T>(reducer: string, arg: unknown, pick: (st: DeskState) => T | undefined, token?: string): Promise<Result<T>> {
    const r = await call(reducer, arg, token);
    if (!r.ok) return r;
    const v = await seen(pick);
    return v === undefined ? fail('SERVICE_UNAVAILABLE', `${reducer} accepted, but the result has not arrived`) : ok(v);
  }

  function rebuild() {
    if (!conn) return;
    const desk = [...conn.db.desk.iter()][0];
    if (!desk) return;
    const rows = <R extends { runId: string; json: string }>(it: Iterable<R>) =>
      [...it].filter((r) => r.runId === desk.runId).map((r) => JSON.parse(r.json));
    const reports = rows(conn.db.report.iter()).sort((a, b) => a.receiveSequence - b.receiveSequence);
    const delivered = reports.filter((r) => r.input.origin === 'scenario').length;
    state = {
      runId: desk.runId,
      mode: 'LIVE',
      reports,
      incidents: rows(conn.db.incident.iter()),
      relations: rows(conn.db.relation.iter()),
      suggestions: rows(conn.db.suggestion.iter()),
      proposals: rows(conn.db.proposal.iter()),
      reviewEvents: rows(conn.db.reviewEvent.iter()).sort((a, b) => a.sequence - b.sequence),
      scenario: {
        runId: desk.runId,
        exerciseVersion: fixture.exerciseVersion,
        seed: 'none · fixed authored order',
        logicalClock: delivered,
        deliveredCount: delivered,
        totalCount: order.length,
        awaitingPresenter: delivered < order.length,
        nextGate: delivered < order.length ? 'SEND_NEXT_REPORT' : null,
      },
      // ponytail: operator proposals for a not-yet-existing incident (desk.newIncidentSignature) are not offered by the UI yet.
      inputSignatures: Object.fromEntries([...conn.db.incidentSignature.iter()].filter((r) => r.runId === desk.runId).map((r) => [r.incidentId, r.signature])),
    };
    for (const l of [...listeners]) l(structuredClone(state));
  }

  function connect() {
    if (conn) return;
    conn = DbConnection.builder()
      .withUri(s.uri)
      .withDatabaseName(s.database)
      .withToken(s.token)
      .onConnect((c) => {
        const tables = [c.db.desk, c.db.report, c.db.incident, c.db.relation, c.db.suggestion, c.db.proposal, c.db.reviewEvent, c.db.incidentSignature];
        for (const t of tables) (t as any).onInsert(rebuild), (t as any).onUpdate(rebuild), (t as any).onDelete(rebuild);
        c.subscriptionBuilder().onApplied(rebuild).subscribeToAllTables();
      })
      .build();
  }

  return {
    subscribeState(listener) {
      listeners.add(listener);
      connect();
      if (state) listener(structuredClone(state));
      return () => listeners.delete(listener);
    },

    receiveReport(input) {
      return run('receive_report', input, (st) => {
        const r = st.reports.find((x) => x.input.sourceId === input.sourceId && x.input.messageId === input.messageId);
        return r && { reportId: r.reportId, duplicate: false };
      });
    },

    submitLocalSuggestion(cmd) {
      return run('submit_local_suggestion', cmd, (st) => {
        const x = st.suggestions.find((r) => r.jobId === cmd.jobId);
        return x && { suggestionId: x.suggestionId };
      });
    },

    submitIncidentProposal(cmd) {
      return run('submit_incident_proposal', cmd, (st) =>
        st.proposals.some((p) => p.proposal.proposalId === cmd.proposal.proposalId) ? { proposalId: cmd.proposal.proposalId } : undefined,
      );
    },

    approveProposal(cmd) {
      return run('approve_proposal', cmd, (st) => {
        const p = st.proposals.find((x) => x.proposal.proposalId === cmd.proposalId);
        const i = p && st.incidents.find((x) => x.incidentId === p.proposal.incidentId);
        return p && p.reviewState !== 'PENDING' && i ? { incidentId: i.incidentId, revision: i.revision } : undefined;
      });
    },

    async rejectProposal(cmd) {
      return call('reject_proposal', cmd);
    },

    operatorEdit(cmd) {
      return run('operator_edit', cmd, (st) => {
        const i = st.incidents.find((x) => x.incidentId === cmd.incidentId);
        return i && i.revision > cmd.baseRevision ? { incidentId: i.incidentId, revision: i.revision } : undefined;
      });
    },

    askClaude(incidentId) {
      return call('issue_incident_job', [incidentId, '']);
    },

    async claimJob() {
      return fail('SERVICE_UNAVAILABLE', 'Jobs are claimed by the worker identity, not the dashboard');
    },

    async advanceScenario({ runId, expectedDeliveredCount }) {
      if (!state) return fail('SERVICE_UNAVAILABLE', 'Not connected');
      if (!s.simToken) return fail('UNAUTHORIZED', 'No simulator token (VITE_STDB_SIM_TOKEN); run scripts/stdb-setup.sh');
      if (runId !== state.runId) return fail('WRONG_RUN', `Run ${runId} is not the active run`);
      const delivered = state.scenario!.deliveredCount;
      if (expectedDeliveredCount !== delivered) return fail('STALE_REVISION', `Scenario is at ${delivered} delivered, not ${expectedDeliveredCount}`);
      const messageId = order[delivered];
      if (!messageId) return ok(null);
      const src = fixture.reports[messageId];
      // Authored text only: no labels, no later reports.
      const input: ReportInput = {
        runId,
        sourceId: src.sourceId,
        messageId,
        text: src.text,
        origin: 'scenario',
        sentAt: src.sentAt,
        reportedEventAt: null,
        reportedLocation: src.placeId ? { placeId: src.placeId, source: 'sender_explicit' } : null,
        transport: { verification: 'not_applicable', encoding: 'not_applicable', measurementSource: 'not_applicable', originalBytes: null, applicationPacketBytes: null },
      };
      const r = await call('receive_report', input, s.simToken);
      if (!r.ok) return r;
      const v = await seen((st) => st.reports.find((x) => x.input.messageId === messageId)?.reportId);
      return v ? ok({ reportId: v }) : fail('SERVICE_UNAVAILABLE', 'Report accepted, but has not arrived yet');
    },

    async resetRun(cmd) {
      const r = await call('reset_run', cmd);
      if (!r.ok) return r;
      const v = await seen((st) => (st.runId !== cmd.runId ? st.runId : undefined));
      return v ? ok({ runId: v }) : fail('SERVICE_UNAVAILABLE', 'Reset accepted, but the new run has not arrived yet');
    },
  };
}
