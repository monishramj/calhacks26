import type { DeskAdapter, DeskState } from '../contract';
import { confirmedQueue, needsReassessment, reviewBand, timeline } from '../derived';
import { createExerciseReplay } from '.';

function setup() {
  const adapter = createExerciseReplay();
  let state!: DeskState;
  adapter.subscribeState((s) => (state = s));
  return { adapter, get: () => state };
}

let n = 0;
const cmd = () => `cmd-${++n}`;

async function advance(adapter: DeskAdapter, runId: string) {
  const r = await adapter.advanceScenario({ runId, commandId: cmd() });
  if (!r.ok) throw new Error(r.error.message);
  return r.value;
}

const queueIds = (s: DeskState) => confirmedQueue(s.incidents).map((i) => i.incidentId);
const msg = (s: DeskState, reportId: string) => s.reports.find((r) => r.reportId === reportId)!.input.messageId;

describe('replay adapter over the §18 exercise', () => {
  it('starts from the authored R01–R06 state, all labeled fixture', () => {
    const { get } = setup();
    const s = get();
    expect(s.mode).toBe('LOCAL REPLAY');
    expect(s.reports.map((r) => r.input.messageId)).toEqual(['R01', 'R02', 'R03', 'R04', 'R05', 'R06']);
    expect(s.reports.every((r) => r.provenance === 'fixture')).toBe(true);
    expect(queueIds(s)).toEqual(['INC-residence', 'INC-shelter', 'INC-school']);
    expect(reviewBand(s)).toEqual([]);
    expect(s.scenario).toEqual({ delivered: 6, total: 12, nextMessageId: 'R07' });
  });

  it('R07 lands in the review band before confirmation and does not move the confirmed queue', async () => {
    const { adapter, get } = setup();
    const id = await advance(adapter, get().runId);
    const s = get();
    expect(id?.reportId && msg(s, id.reportId)).toBe('R07');
    expect(s.reports.at(-1)!.receiveSequence).toBe(7);
    const band = reviewBand(s);
    expect(band).toHaveLength(1);
    expect(band[0].kind).toBe('POSSIBLE_LIFE_SAFETY');
    expect(band[0].label).toMatch(/unconfirmed/);
    expect(needsReassessment(s).has('INC-school')).toBe(true);
    expect(queueIds(s)).toEqual(['INC-residence', 'INC-shelter', 'INC-school']);
    expect(s.suggestions[0].scores).toEqual([]); // no fabricated model scores
  });

  it('operator approval of R07 moves the school to the top by earlier open cycle', async () => {
    const { adapter, get } = setup();
    await advance(adapter, get().runId);
    const proposal = get().proposals[0];
    const r = await adapter.approveProposal({ runId: get().runId, commandId: cmd(), proposalId: proposal.proposalId });
    expect(r.ok).toBe(true);
    const s = get();
    expect(queueIds(s)).toEqual(['INC-school', 'INC-residence', 'INC-shelter']);
    const school = s.incidents.find((i) => i.incidentId === 'INC-school')!;
    expect(school.revision).toBe(2);
    expect(school.openCycleStartSequence).toBe(1); // update keeps the incident's age
    expect(s.reviewEvents.at(-1)!.actor).toBe('operator');
    expect(reviewBand(s)).toEqual([]);
  });

  it('repeated command IDs are idempotent', async () => {
    const { adapter, get } = setup();
    await advance(adapter, get().runId);
    const c = { runId: get().runId, commandId: 'same', proposalId: get().proposals[0].proposalId };
    const a = await adapter.approveProposal(c);
    const b = await adapter.approveProposal(c);
    expect(b).toEqual(a);
    expect(get().incidents.find((i) => i.incidentId === 'INC-school')!.revision).toBe(2);
  });

  it('rejects a stale approval made against an older revision', async () => {
    const { adapter, get } = setup();
    const runId = get().runId;
    await advance(adapter, runId); // R07
    await advance(adapter, runId); // R08, proposal based on school@1
    const [p7, p8] = get().proposals;
    await adapter.approveProposal({ runId, commandId: cmd(), proposalId: p7.proposalId });
    const r = await adapter.approveProposal({ runId, commandId: cmd(), proposalId: p8.proposalId });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('STALE_REVISION');
    expect(get().proposals[1].reviewState).toBe('PENDING');
  });

  it('a duplicate report adds no severity, and late R11 does not erase R07', async () => {
    const { adapter, get } = setup();
    const runId = get().runId;
    await advance(adapter, runId); // R07
    await adapter.approveProposal({ runId, commandId: cmd(), proposalId: get().proposals[0].proposalId });
    for (let i = 0; i < 5; i++) await advance(adapter, runId); // R08..R12
    let s = get();
    for (const p of s.proposals.filter((p) => p.reviewState === 'PENDING')) {
      const current = s.incidents.find((i) => i.incidentId === p.incidentId)!;
      // Operator re-reviews each against the current revision (fresh operator proposal).
      const fresh = { ...p, proposalId: `${p.proposalId}-op`, provider: 'operator' as const, baseIncidentVersions: { [current.incidentId]: current.revision } };
      expect((await adapter.submitIncidentProposal(fresh)).ok).toBe(true);
      expect((await adapter.approveProposal({ runId, commandId: cmd(), proposalId: fresh.proposalId })).ok).toBe(true);
      s = get();
    }
    const school = s.incidents.find((i) => i.incidentId === 'INC-school')!;
    expect(school.attention).toBe('POSSIBLE_LIFE_SAFETY');
    expect(school.status).toBe('OPEN');
    const r11 = s.reports.find((r) => r.input.messageId === 'R11')!;
    const r07 = s.reports.find((r) => r.input.messageId === 'R07')!;
    expect(r11.input.sentAt! < r07.input.sentAt!).toBe(true);
    expect(r11.receiveSequence).toBeGreaterThan(r07.receiveSequence);
    // Every original is still in the school timeline, in receive order; R10 (a question,
    // no proposal) stays visible there as a pending review item.
    expect(timeline(s, 'INC-school').map((r) => r.input.messageId)).toEqual(['R01', 'R05', 'R07', 'R08', 'R09', 'R10', 'R11', 'R12']);
    expect(reviewBand(s).map((i) => msg(s, i.reportId))).toEqual(['R10']);
    expect(s.reports).toHaveLength(12);
  });

  it('an override needs a reason; reopening starts a new cycle', async () => {
    const { adapter, get } = setup();
    const runId = get().runId;
    const noReason = await adapter.operatorEdit({ runId, commandId: cmd(), incidentId: 'INC-shelter', baseRevision: 1, status: 'RESOLVED', reason: ' ' });
    expect(noReason.ok).toBe(false);
    await adapter.operatorEdit({ runId, commandId: cmd(), incidentId: 'INC-shelter', baseRevision: 1, status: 'RESOLVED', reason: 'Blankets delivered' });
    expect(queueIds(get())).not.toContain('INC-shelter');
    await adapter.operatorEdit({ runId, commandId: cmd(), incidentId: 'INC-shelter', baseRevision: 2, status: 'OPEN', reason: 'Need returned' });
    const shelter = get().incidents.find((i) => i.incidentId === 'INC-shelter')!;
    expect(shelter.openCycleStartSequence).toBe(6);
    expect(queueIds(get())).toEqual(['INC-residence', 'INC-shelter', 'INC-school']);
  });

  it('reset starts a new run and commands for the old run are rejected', async () => {
    const { adapter, get } = setup();
    const oldRun = get().runId;
    await advance(adapter, oldRun);
    await adapter.resetRun();
    expect(get().runId).not.toBe(oldRun);
    expect(get().reports).toHaveLength(6);
    const r = await adapter.advanceScenario({ runId: oldRun, commandId: cmd() });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('WRONG_RUN');
  });

  it('refuses radio-origin input and inference work in replay', async () => {
    const { adapter, get } = setup();
    const base = get().reports[0].input;
    const radio = await adapter.receiveReport({ ...base, messageId: 'X1', origin: 'radio' });
    expect(radio.ok || radio.error.code).toBe('UNAUTHORIZED');
    const job = await adapter.claimJob({ runId: get().runId, workerId: 'w' });
    expect(job.ok || job.error.code).toBe('SERVICE_UNAVAILABLE');
  });
});
