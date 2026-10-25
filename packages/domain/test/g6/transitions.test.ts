// G6 TEST · the reviewed-change transition both replay and the DB reducer apply:
// operator override, explicit resolve and reopen, and cycle age (§5, §17).
import { describe, expect, it } from 'vitest';
import { applyIncidentChange, confirmedQueue, validateWire, type DeskState, type IncidentView } from '../../src/index.ts';
import { RUN, deepFreeze, ids, incident, rid, startDesk } from './desk.ts';

const ctx = (incidentId: string, reopenSequence = 12) => ({ runId: RUN, incidentId, reopenSequence });
const school = (): IncidentView => structuredClone(incident(startDesk(), 'inc-school'));

function ok(r: ReturnType<typeof applyIncidentChange>): IncidentView {
  expect(r.ok).toBe(true);
  if (!r.ok) throw new Error(r.error.message);
  return r.value;
}

describe('applyIncidentChange', () => {
  it('creates a new incident at revision 1 with the given cycle start', () => {
    const v = ok(applyIncidentChange(null, { status: 'OPEN', attention: 'ACTIVE_NEED', addReportIds: [rid('R02')] }, ctx('inc-new', 2)));
    expect(v).toMatchObject({ incidentId: 'inc-new', runId: RUN, revision: 1, status: 'OPEN', attention: 'ACTIVE_NEED', openCycleStartSequence: 2 });
    expect(v.confirmedReportIds).toEqual([rid('R02')]);
    expect(validateWire('IncidentView', v).ok).toBe(true);
  });

  it('an attention override bumps the revision and keeps the age and everything else', () => {
    const before = school();
    const v = ok(applyIncidentChange(before, { attention: 'POSSIBLE_LIFE_SAFETY' }, ctx('inc-school')));
    expect(v).toEqual({ ...before, revision: before.revision + 1, attention: 'POSSIBLE_LIFE_SAFETY' });
  });

  it('adding reports appends without duplicates and never removes any', () => {
    const before = school();
    const v = ok(applyIncidentChange(before, { addReportIds: [rid('R07'), rid('R01')] }, ctx('inc-school')));
    expect(v.confirmedReportIds).toEqual([rid('R01'), rid('R05'), rid('R07')]);
  });

  it('resolving keeps the cycle start, and the incident leaves the queue', () => {
    const before = school();
    const v = ok(applyIncidentChange(before, { status: 'RESOLVED' }, ctx('inc-school')));
    expect(v).toMatchObject({ status: 'RESOLVED', openCycleStartSequence: before.openCycleStartSequence, revision: before.revision + 1 });
    const state: DeskState = { ...startDesk() };
    state.incidents = state.incidents.map((i) => (i.incidentId === 'inc-school' ? v : i));
    expect(ids(confirmedQueue(state))).toEqual(['inc-residence', 'inc-shelter']);
  });

  it('reopening keeps the ID and history but starts a new cycle, so it ranks by its new age', () => {
    const resolved = ok(applyIncidentChange(school(), { status: 'RESOLVED' }, ctx('inc-school')));
    const reopened = ok(applyIncidentChange(resolved, { status: 'OPEN', attention: 'POSSIBLE_LIFE_SAFETY' }, ctx('inc-school', 12)));
    expect(reopened).toMatchObject({ incidentId: 'inc-school', status: 'OPEN', openCycleStartSequence: 12, revision: resolved.revision + 1 });
    expect(reopened.confirmedReportIds).toEqual(resolved.confirmedReportIds);
    const state = startDesk();
    state.incidents = state.incidents.map((i) => (i.incidentId === 'inc-school' ? reopened : i));
    expect(ids(confirmedQueue(state))).toEqual(['inc-residence', 'inc-school', 'inc-shelter']);
  });

  it('rejects a reopen cycle that starts before the old one', () => {
    const resolved = ok(applyIncidentChange(school(), { status: 'RESOLVED' }, ctx('inc-school')));
    expect(applyIncidentChange(resolved, { status: 'OPEN' }, ctx('inc-school', 0))).toMatchObject({ ok: false, error: { code: 'INVALID_INPUT' } });
  });

  it('transitions are explicit: resolving a resolved incident or an empty change is invalid', () => {
    const resolved = ok(applyIncidentChange(school(), { status: 'RESOLVED' }, ctx('inc-school')));
    expect(applyIncidentChange(resolved, { status: 'RESOLVED' }, ctx('inc-school'))).toMatchObject({ ok: false, error: { code: 'INVALID_INPUT' } });
    expect(applyIncidentChange(school(), {}, ctx('inc-school'))).toMatchObject({ ok: false, error: { code: 'INVALID_INPUT' } });
  });

  it('a new incident must be created OPEN', () => {
    expect(applyIncidentChange(null, { attention: 'INFORMATION' }, ctx('inc-new', 3))).toMatchObject({ ok: false, error: { code: 'INVALID_INPUT' } });
  });

  it('refuses a change for another run or another incident', () => {
    expect(applyIncidentChange(school(), { attention: 'ACTIVE_NEED' }, { ...ctx('inc-school'), runId: 'run-000' })).toMatchObject({
      ok: false,
      error: { code: 'WRONG_RUN' },
    });
    expect(applyIncidentChange(school(), { attention: 'ACTIVE_NEED' }, ctx('inc-shelter'))).toMatchObject({ ok: false, error: { code: 'INVALID_INPUT' } });
  });

  it('does not mutate the incident it was given', () => {
    const before = deepFreeze(school());
    expect(() => applyIncidentChange(before, { attention: 'ACTIVE_NEED', addReportIds: [rid('R07')] }, ctx('inc-school'))).not.toThrow();
    expect(before.revision).toBe(1);
  });
});
