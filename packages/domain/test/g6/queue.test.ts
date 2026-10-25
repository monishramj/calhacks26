// G6 TEST · confirmed queue (§5 attention policy): confirmed category, then oldest
// unresolved cycle, then stable incident ID. Priority is never confidence, and
// duplicate volume never raises severity.
import { describe, expect, it } from 'vitest';
import { ATTENTION_LABEL, confirmedQueue, type DeskState, type IncidentView } from '../../src/index.ts';
import { RUN, afterR07Confirmed, confirm, deepFreeze, deliver, expectations, ids, incident, propose, rid, startDesk, suggest } from './desk.ts';

describe('confirmed queue order', () => {
  it('starts with the authored state: residence (life safety), shelter (active need), school (information)', () => {
    expect(ids(confirmedQueue(startDesk()))).toEqual(['inc-residence', 'inc-shelter', 'inc-school']);
  });

  it('after R07 is confirmed, school leads by its earlier open cycle (§18 expectation)', () => {
    const state = afterR07Confirmed();
    expect(ids(confirmedQueue(state))).toEqual(expectations.afterR07Confirmed.confirmedQueue);
    for (const [id, attention] of Object.entries(expectations.afterR07Confirmed.attention)) {
      expect(incident(state, id).attention).toBe(attention);
    }
  });

  it('confirming new evidence does not reset the incident age', () => {
    const state = afterR07Confirmed();
    expect(incident(state, 'inc-school').openCycleStartSequence).toBe(1);
    expect(confirmedQueue(state).find((i) => i.incidentId === 'inc-school')?.openCycleStartSequence).toBe(1);
  });
});

describe('only confirmed state changes the confirmed rank', () => {
  it('an unconfirmed possible-life-safety hint for R07 leaves the queue as it was', () => {
    const state = startDesk();
    deliver(state, 'R07');
    suggest(state, 'R07', { action: 'FLAG_CORRECTION', candidate: 'inc-school', attention: 'POSSIBLE_LIFE_SAFETY', score: 0.99 });
    propose(state, { incidentId: 'inc-school', addMessageIds: ['R07'], suggestedAttention: 'POSSIBLE_LIFE_SAFETY' });
    expect(ids(confirmedQueue(state))).toEqual(['inc-residence', 'inc-shelter', 'inc-school']);
  });

  it('a pending resolve proposal (late older all-clear R11) does not drop the school from the queue', () => {
    const state = afterR07Confirmed();
    for (const id of ['R08', 'R09', 'R10', 'R11']) deliver(state, id);
    propose(state, { incidentId: 'inc-school', addMessageIds: ['R11'], suggestedStatus: 'RESOLVED', suggestedAttention: 'INFORMATION' });
    expect(ids(confirmedQueue(state))[0]).toBe('inc-school');
    expect(confirmedQueue(state)[0]?.attention).toBe('POSSIBLE_LIFE_SAFETY');
  });

  it('the queue is identical with every suggestion and proposal removed', () => {
    const state = startDesk();
    deliver(state, 'R07');
    suggest(state, 'R07', { action: 'FLAG_CORRECTION', candidate: 'inc-school', attention: 'POSSIBLE_LIFE_SAFETY', score: 0.9 });
    propose(state, { incidentId: 'inc-shelter', addMessageIds: ['R07'], suggestedAttention: 'POSSIBLE_LIFE_SAFETY' });
    const bare: DeskState = { ...structuredClone(state), suggestions: [], proposals: [] };
    expect(confirmedQueue(state).length).toBe(3);
    expect(confirmedQueue(state)).toEqual(confirmedQueue(bare));
  });
});

describe('priority is not confidence; volume is not severity', () => {
  it('a near-certain model score does not move an incident', () => {
    const state = startDesk();
    deliver(state, 'R07');
    suggest(state, 'R07', { action: 'ATTACH_REPORT', candidate: 'inc-shelter', attention: 'POSSIBLE_LIFE_SAFETY', score: 0.999 });
    expect(ids(confirmedQueue(state))).toEqual(['inc-residence', 'inc-shelter', 'inc-school']);
  });

  it('ten confirmed repeats of the shelter request neither raise its attention nor its rank', () => {
    const state = startDesk();
    const repeats: string[] = [];
    for (let k = 0; k < 10; k++) {
      const r = deliver(state, 'R04', { messageId: `R04-again-${k}` });
      repeats.push(r.reportId);
    }
    confirm(state, 'inc-shelter', { addReportIds: repeats });
    const q = confirmedQueue(state);
    expect(ids(q)).toEqual(['inc-residence', 'inc-shelter', 'inc-school']);
    expect(q.find((i) => i.incidentId === 'inc-shelter')?.attention).toBe('ACTIVE_NEED');
  });
});

describe('membership and ties', () => {
  const mk = (incidentId: string, attention: IncidentView['attention'], openCycleStartSequence: number, extra: Partial<IncidentView> = {}): IncidentView => ({
    runId: RUN,
    incidentId,
    revision: 1,
    status: 'OPEN',
    attention,
    confirmedPlaceId: null,
    confirmedReportIds: [],
    summary: null,
    openCycleStartSequence,
    ...extra,
  });
  const desk = (incidents: IncidentView[]): DeskState => ({ ...startDesk(), incidents });

  it('breaks exact ties by incident ID, whatever the input order', () => {
    const a = mk('inc-a', 'ACTIVE_NEED', 4);
    const b = mk('inc-b', 'ACTIVE_NEED', 4);
    const c = mk('inc-c', 'ACTIVE_NEED', 4);
    for (const order of [[a, b, c], [c, b, a], [b, c, a], [c, a, b]]) {
      expect(ids(confirmedQueue(desk(order)))).toEqual(['inc-a', 'inc-b', 'inc-c']);
    }
  });

  it('category beats age, and age beats ID', () => {
    const q = confirmedQueue(
      desk([mk('inc-a', 'INFORMATION', 1), mk('inc-z', 'POSSIBLE_LIFE_SAFETY', 9), mk('inc-m', 'POSSIBLE_LIFE_SAFETY', 2), mk('inc-b', 'ACTIVE_NEED', 1)]),
    );
    expect(ids(q)).toEqual(['inc-m', 'inc-z', 'inc-b', 'inc-a']);
  });

  it('leaves resolved incidents out and puts unknown attention last (it needs review, not burial)', () => {
    const q = confirmedQueue(desk([mk('inc-done', 'POSSIBLE_LIFE_SAFETY', 1, { status: 'RESOLVED' }), mk('inc-unknown', null, 1), mk('inc-info', 'INFORMATION', 5)]));
    expect(ids(q)).toEqual(['inc-info', 'inc-unknown']);
  });

  it('ignores incidents from another run', () => {
    const q = confirmedQueue(desk([mk('inc-old', 'POSSIBLE_LIFE_SAFETY', 1, { runId: 'run-000' }), mk('inc-now', 'INFORMATION', 1)]));
    expect(ids(q)).toEqual(['inc-now']);
  });

  it('does not mutate the state it reads', () => {
    const state = deepFreeze(afterR07Confirmed());
    expect(() => confirmedQueue(state)).not.toThrow();
    expect(ids(confirmedQueue(state))).toEqual(['inc-school', 'inc-residence', 'inc-shelter']);
  });

  it('every attention category has a written label (§7: never color alone)', () => {
    expect(ATTENTION_LABEL.POSSIBLE_LIFE_SAFETY ?? '').toMatch(/life/i);
    expect(ATTENTION_LABEL.ACTIVE_NEED ?? '').toMatch(/need/i);
    expect(ATTENTION_LABEL.INFORMATION ?? '').toMatch(/information/i);
  });
});

void rid;
