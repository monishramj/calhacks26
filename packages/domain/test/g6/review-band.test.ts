// G6 TEST · pinned review band and reassessment flags (§5, §10, §17): unconfirmed
// possible harm stays prominent, contradictions and unknowns stay reviewable, and new
// evidence flags its incident before any model finishes.
import { describe, expect, it } from 'vitest';
import { needsReassessment, reviewBand, type DeskState } from '../../src/index.ts';
import { afterR07Confirmed, confirm, deliver, propose, relate, rid, startDesk, suggest } from './desk.ts';

const kinds = (state: DeskState) => reviewBand(state).map((i) => [i.reportId, i.kind]);

describe('review band contents', () => {
  it('the authored start has nothing to review', () => {
    expect(reviewBand(startDesk())).toEqual([]);
  });

  it('R07 with no model output yet is an unknown for review, already tied to the school by its named place', () => {
    const state = startDesk();
    deliver(state, 'R07');
    const band = reviewBand(state);
    expect(band).toHaveLength(1);
    expect(band[0]).toMatchObject({ kind: 'UNKNOWN', reportId: rid('R07'), incidentId: 'inc-school' });
    expect(band[0]!.label).toMatch(/review/i);
  });

  it('a possible life-safety hint is prominent even at a low model score (low confidence never downgrades)', () => {
    const state = startDesk();
    deliver(state, 'R07');
    deliver(state, 'R08');
    suggest(state, 'R08', { action: 'ATTACH_REPORT', candidate: 'inc-school', attention: 'INFORMATION', score: 0.97 });
    suggest(state, 'R07', { action: 'FLAG_CORRECTION', candidate: 'inc-school', attention: 'POSSIBLE_LIFE_SAFETY', score: 0.05 });
    const band = reviewBand(state);
    expect(band[0]).toMatchObject({ kind: 'POSSIBLE_LIFE_SAFETY', reportId: rid('R07') });
    expect(band[0]!.label).toMatch(/life.safety/i);
    expect(band[0]!.label).toMatch(/unconfirmed/i);
  });

  it('contradictions from a FLAG_CONFLICT suggestion or a CONFLICT relation are their own kind', () => {
    const state = afterR07Confirmed();
    deliver(state, 'R08');
    deliver(state, 'R09');
    suggest(state, 'R08', { action: 'FLAG_CONFLICT', candidate: 'inc-school', attention: null });
    propose(state, { incidentId: 'inc-school', addMessageIds: ['R09'], relations: [{ from: 'R09', to: 'R07', kind: 'CONFLICT' }] });
    expect(kinds(state)).toEqual([
      [rid('R08'), 'CONTRADICTION'],
      [rid('R09'), 'CONTRADICTION'],
    ]);
  });

  it('orders possible harm, then contradictions, then unknowns, then pending changes; each by receive order', () => {
    const state = afterR07Confirmed();
    for (const id of ['R08', 'R09', 'R10', 'R11', 'R12']) deliver(state, id);
    suggest(state, 'R08', { action: 'ATTACH_REPORT', candidate: 'inc-school', attention: null }); // pending change
    suggest(state, 'R11', { action: 'FLAG_CONFLICT', candidate: 'inc-school', attention: null }); // contradiction
    suggest(state, 'R12', { action: 'ATTACH_REPORT', candidate: 'inc-school', attention: 'POSSIBLE_LIFE_SAFETY' }); // harm
    // R09, R10: no model output -> unknown
    expect(kinds(state)).toEqual([
      [rid('R12'), 'POSSIBLE_LIFE_SAFETY'],
      [rid('R11'), 'CONTRADICTION'],
      [rid('R09'), 'UNKNOWN'],
      [rid('R10'), 'UNKNOWN'],
      [rid('R08'), 'PENDING_CHANGE'],
    ]);
  });

  it('a repeat report is one pending item, not extra severity', () => {
    const state = afterR07Confirmed();
    deliver(state, 'R08');
    suggest(state, 'R08', { action: 'ATTACH_REPORT', candidate: 'inc-school', attention: null });
    relate(state, 'R08', 'R07', 'REPEAT', 'inc-school');
    expect(kinds(state)).toEqual([[rid('R08'), 'PENDING_CHANGE']]);
  });

  it('confirmed reports never appear in the band', () => {
    const state = afterR07Confirmed();
    deliver(state, 'R08');
    suggest(state, 'R07', { action: 'FLAG_CORRECTION', candidate: 'inc-school', attention: 'POSSIBLE_LIFE_SAFETY' });
    expect(reviewBand(state).map((i) => i.reportId)).toEqual([rid('R08')]);
  });

  it('a rejected proposal leaves its report reviewable as an unknown', () => {
    const state = startDesk();
    deliver(state, 'R07');
    propose(state, { incidentId: 'inc-school', addMessageIds: ['R07'], suggestedAttention: 'POSSIBLE_LIFE_SAFETY', reviewState: 'REJECTED' });
    expect(kinds(state)).toEqual([[rid('R07'), 'UNKNOWN']]);
  });

  it('a confirmed incident with unknown attention is listed as an incident-level unknown', () => {
    const state = startDesk();
    confirm(state, 'inc-shelter', { attention: null });
    const item = reviewBand(state).find((i) => i.incidentId === 'inc-shelter');
    expect(item).toMatchObject({ kind: 'UNKNOWN', reportId: null });
  });

  it('every item cites existing reports and has a written label', () => {
    const state = afterR07Confirmed();
    for (const id of ['R08', 'R11', 'R12']) deliver(state, id);
    suggest(state, 'R12', { action: 'ATTACH_REPORT', candidate: 'inc-school', attention: 'POSSIBLE_LIFE_SAFETY' });
    const known = new Set(state.reports.map((r) => r.reportId));
    const band = reviewBand(state);
    expect(band.length).toBe(3);
    for (const item of band) {
      expect(item.label.length).toBeGreaterThan(0);
      expect(item.sourceReportIds.length).toBeGreaterThan(0);
      for (const r of item.sourceReportIds) expect(known.has(r)).toBe(true);
    }
  });
});

describe('R11 must not erase R07', () => {
  it('a late older all-clear is a pending item while the school keeps its confirmed concern', () => {
    const state = afterR07Confirmed();
    for (const id of ['R08', 'R09', 'R10', 'R11']) deliver(state, id);
    suggest(state, 'R11', { action: 'ATTACH_REPORT', candidate: 'inc-school', attention: 'INFORMATION', score: 0.95 });
    const item = reviewBand(state).find((i) => i.reportId === rid('R11'));
    expect(item?.kind).toBe('PENDING_CHANGE');
    expect(state.incidents.find((i) => i.incidentId === 'inc-school')?.attention).toBe('POSSIBLE_LIFE_SAFETY');
  });
});

describe('needsReassessment', () => {
  it('flags the school the moment R07 arrives, before any model output', () => {
    const state = startDesk();
    deliver(state, 'R07');
    expect([...needsReassessment(state)]).toEqual(['inc-school']);
  });

  it('flags an incident a pending proposal targets', () => {
    const state = startDesk();
    deliver(state, 'R07');
    confirm(state, 'inc-school', { addReportIds: [rid('R07')] });
    propose(state, { incidentId: 'inc-shelter', addMessageIds: ['R04'], suggestedAttention: 'ACTIVE_NEED' });
    expect([...needsReassessment(state)]).toEqual(['inc-shelter']);
  });

  it('clears once the evidence is confirmed and nothing is pending', () => {
    expect([...needsReassessment(afterR07Confirmed())]).toEqual([]);
  });
});
