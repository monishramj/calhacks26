// G6 TEST · deskInvariants: the checks every DeskState must pass, run by these tests,
// the replay adapter's tests (ws/web), and the live-DB tests (G3) alike.
import { describe, expect, it } from 'vitest';
import { deskInvariants, type DeskState } from '../../src/index.ts';
import { afterR07Confirmed, confirm, deliver, propose, rid, startDesk, suggest } from './desk.ts';

describe('valid states pass', () => {
  it('at every exercise step', () => {
    const state = startDesk();
    expect(deskInvariants(state)).toEqual([]);
    for (const id of ['R07', 'R08', 'R09', 'R10', 'R11', 'R12']) {
      deliver(state, id);
      suggest(state, id, { action: 'ATTACH_REPORT', candidate: 'inc-school', attention: null });
      expect(deskInvariants(state), id).toEqual([]);
    }
    confirm(state, 'inc-school', { attention: 'POSSIBLE_LIFE_SAFETY', addReportIds: [rid('R07')] });
    expect(deskInvariants(state)).toEqual([]);
  });
});

describe('violations are reported', () => {
  const cases: [string, (s: DeskState) => void][] = [
    ['duplicate receive sequence', (s) => (s.reports[1]!.receiveSequence = 1)],
    ['non-positive receive sequence', (s) => (s.reports[0]!.receiveSequence = 0)],
    ['duplicate report ID', (s) => (s.reports[1]!.reportId = s.reports[0]!.reportId)],
    ['a retransmission stored twice (same run, source, message ID)', (s) => void s.reports.push({ ...structuredClone(s.reports[0]!), reportId: 'rep-copy', receiveSequence: 99 })],
    ['a confirmed report that does not exist', (s) => s.incidents[0]!.confirmedReportIds.push('rep-missing')],
    ['a report confirmed in two incidents', (s) => s.incidents[1]!.confirmedReportIds.push(s.incidents[0]!.confirmedReportIds[0]!)],
    ['an incident from another run', (s) => (s.incidents[0]!.runId = 'run-000')],
    ['a report from another run', (s) => (s.reports[0]!.input.runId = 'run-000')],
    ['an open cycle starting at a sequence no report has', (s) => (s.incidents[0]!.openCycleStartSequence = 999)],
    ['a confirmed relation without a reviewer', (s) =>
      void s.relations.push({ runId: s.runId, relationId: 'rel-x', reportId: rid('R04'), targetReportId: rid('R02'), kind: 'REPEAT', incidentId: 'inc-shelter', state: 'CONFIRMED', proposalId: null, reviewer: null })],
    ['a pending proposal citing a report that does not exist', (s) =>
      void propose(s, { incidentId: 'inc-school', addMessageIds: ['R99'] })],
  ];
  it.each(cases)('%s', (_name, corrupt) => {
    const state = afterR07Confirmed();
    expect(deskInvariants(state)).toEqual([]);
    corrupt(state);
    const v = deskInvariants(state);
    expect(v.length).toBeGreaterThan(0);
    for (const msg of v) expect(typeof msg).toBe('string');
  });
});
