// G6 TEST · immutable chronology and grouping (§5): receive order, never sent order;
// every original stays inspectable; confirmed and provisional links stay distinct.
import { describe, expect, it } from 'vitest';
import { incidentGroups, timeline, type DeskState } from '../../src/index.ts';
import { afterR07Confirmed, confirm, deepFreeze, deliver, propose, relate, rid, startDesk, suggest } from './desk.ts';

function fullRun(): DeskState {
  const state = afterR07Confirmed();
  for (const id of ['R08', 'R09', 'R10', 'R11', 'R12']) deliver(state, id);
  return state;
}

describe('timeline', () => {
  it('lists every original once, in receive order (R11 after R10, not by its earlier sent time)', () => {
    const t = timeline(fullRun());
    expect(t.map((e) => e.report.input.messageId)).toEqual(['R01', 'R02', 'R03', 'R04', 'R05', 'R06', 'R07', 'R08', 'R09', 'R10', 'R11', 'R12']);
    expect(t.map((e) => e.report.receiveSequence)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  });

  it('is in receive order even when the stored array is not', () => {
    const state = fullRun();
    state.reports.reverse();
    expect(timeline(state).map((e) => e.report.receiveSequence)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  });

  it('keeps text and all three times exactly as stored, nulls included', () => {
    const state = fullRun();
    const byId = new Map(state.reports.map((r) => [r.reportId, r]));
    for (const e of timeline(state)) {
      const stored = byId.get(e.report.reportId)!;
      expect(e.report.input.text).toBe(stored.input.text);
      expect(e.report.input.sentAt).toBe(stored.input.sentAt);
      expect(e.report.input.reportedEventAt).toBe(stored.input.reportedEventAt);
      expect(e.report.receivedAt).toBe(stored.receivedAt);
    }
    expect(timeline(state).find((e) => e.report.input.messageId === 'R10')?.report.input.sentAt).toBeNull();
  });

  it('marks R11 as a late older report and nothing else in the exercise', () => {
    const late = timeline(fullRun()).filter((e) => e.lateOlder).map((e) => e.report.input.messageId);
    expect(late).toEqual(['R11']);
  });

  it('labels standing: confirmed, provisional (pending link), or unassigned', () => {
    const state = fullRun();
    suggest(state, 'R08', { action: 'ATTACH_REPORT', candidate: 'inc-school', attention: null });
    const t = new Map(timeline(state).map((e) => [e.report.input.messageId, e]));
    expect(t.get('R07')).toMatchObject({ standing: 'CONFIRMED', incidentId: 'inc-school' });
    expect(t.get('R08')).toMatchObject({ standing: 'PROVISIONAL', incidentId: 'inc-school' });
    expect(t.get('R10')).toMatchObject({ standing: 'UNASSIGNED', incidentId: null });
  });

  it('a repeat with a new message ID is its own entry, carrying its relation', () => {
    const state = startDesk();
    relate(state, 'R04', 'R02', 'REPEAT', 'inc-shelter', true);
    const t = timeline(state);
    expect(t.filter((e) => e.report.input.text.includes('blankets'))).toHaveLength(2);
    expect(t.find((e) => e.report.reportId === rid('R04'))?.relations.map((r) => r.kind)).toEqual(['REPEAT']);
  });

  it('an incident timeline holds its confirmed and provisional reports only', () => {
    const state = startDesk();
    deliver(state, 'R07');
    suggest(state, 'R07', { action: 'FLAG_CORRECTION', candidate: 'inc-school', attention: 'POSSIBLE_LIFE_SAFETY' });
    expect(timeline(state, 'inc-school').map((e) => e.report.input.messageId)).toEqual(['R01', 'R05', 'R07']);
  });

  it('a resolved and reopened incident keeps its whole history', () => {
    const state = fullRun();
    confirm(state, 'inc-school', { status: 'RESOLVED' });
    confirm(state, 'inc-school', { status: 'OPEN', openCycleStartSequence: 12, addReportIds: [rid('R12')] });
    const msgs = timeline(state, 'inc-school').map((e) => e.report.input.messageId);
    expect(msgs).toEqual(expect.arrayContaining(['R01', 'R05', 'R07', 'R12']));
    expect(msgs[0]).toBe('R01');
  });

  it('does not mutate the state it reads', () => {
    const state = deepFreeze(fullRun());
    expect(() => timeline(state)).not.toThrow();
    expect(timeline(state)).toHaveLength(12);
  });
});

describe('incident groups', () => {
  it('separates confirmed from provisional reports', () => {
    const state = startDesk();
    deliver(state, 'R07');
    suggest(state, 'R07', { action: 'FLAG_CORRECTION', candidate: 'inc-school', attention: 'POSSIBLE_LIFE_SAFETY' });
    const school = incidentGroups(state).find((g) => g.incident.incidentId === 'inc-school');
    expect(school?.confirmed.map((r) => r.input.messageId)).toEqual(['R01', 'R05']);
    expect(school?.provisional.map((r) => r.input.messageId)).toEqual(['R07']);
  });

  it('rejected and stale proposals do not create provisional links', () => {
    const state = startDesk();
    deliver(state, 'R07');
    deliver(state, 'R08');
    propose(state, { incidentId: 'inc-school', addMessageIds: ['R07'], reviewState: 'REJECTED' });
    propose(state, { incidentId: 'inc-school', addMessageIds: ['R08'], reviewState: 'STALE' });
    const school = incidentGroups(state).find((g) => g.incident.incidentId === 'inc-school');
    expect(school?.provisional).toEqual([]);
  });

  it('has one group per incident in this run, with its relations', () => {
    const state = startDesk();
    relate(state, 'R04', 'R02', 'REPEAT', 'inc-shelter', true);
    const groups = incidentGroups(state);
    expect(groups.map((g) => g.incident.incidentId).sort()).toEqual(['inc-residence', 'inc-school', 'inc-shelter']);
    expect(groups.find((g) => g.incident.incidentId === 'inc-shelter')?.relations).toHaveLength(1);
  });
});
