// Claude checks Laya: a change confirms without a person only when both models agree on a safe change.
import { describe, expect, it } from 'vitest';
import { autoConfirmDecision, layaView, nearestOpenIncidents, type ClaudeCheck, type IncidentView, type LocalSuggestion } from '../src/index.ts';

const RUN = 'live-1';
const inc = (incidentId: string, place: string | null, extra: Partial<IncidentView> = {}): IncidentView => ({
  runId: RUN, incidentId, revision: 1, status: 'OPEN', attention: 'ACTIVE_NEED', confirmedPlaceId: place,
  confirmedReportIds: [`${incidentId}-r`], summary: null, openCycleStartSequence: 1, ...extra,
});
const school = inc('inc-school', 'school');
const p = (label: string, value: number) => ({ label, value, kind: 'probability' as const });
// Laya as it usually answers: REQUEST_REVIEW, with scores.
const laya = (extra: Partial<LocalSuggestion> = {}): LocalSuggestion => ({
  runId: RUN, reportId: 'live-1:r9', action: 'REQUEST_REVIEW', candidateIncidentId: null, attention: null,
  scores: [p('ATTACH_REPORT', 0.5), p('NEW_INCIDENT', 0.2), p('REQUEST_REVIEW', 0.3), p('INFORMATION', 0.7), p('ACTIVE_NEED', 0.25), p('POSSIBLE_LIFE_SAFETY', 0.05)],
  evidenceReportIds: ['live-1:r9'], baseIncidentVersions: { 'inc-school': 1 }, inputSignature: 'sig1:a', provider: 'local_laya', ...extra,
});
const claude = (extra: Partial<ClaudeCheck> = {}): ClaudeCheck => ({
  runId: RUN, reportId: 'live-1:r9', action: 'ATTACH_REPORT', candidateIncidentId: 'inc-school', attention: 'INFORMATION',
  evidenceReportIds: ['live-1:r9'], summary: 'Road by the school is open.', reason: null, baseIncidentVersions: { 'inc-school': 1 }, inputSignature: 'sig1:a', model: 'm', provider: 'claude', ...extra,
});
const decide = (s: LocalSuggestion, c: ClaudeCheck, incidents = [school], placeId: string | null = 'school') =>
  autoConfirmDecision({ suggestion: s, check: c, placeId, incidents });

describe('layaView', () => {
  it('reads a REQUEST_REVIEW answer from its top-scored labels', () => {
    expect(layaView(laya())).toEqual({ action: 'ATTACH_REPORT', candidateIncidentId: 'inc-school', attention: 'INFORMATION', possibleHarm: false });
  });
  it('picks the top-scored candidate when there are several', () => {
    const s = laya({ baseIncidentVersions: { a: 1, b: 1 }, scores: [...laya().scores, p('a', 0.3), p('b', 0.7)] });
    expect(layaView(s).candidateIncidentId).toBe('b');
  });
  it('counts real mass on possible life safety as possible harm', () => {
    expect(layaView(laya({ scores: [p('INFORMATION', 0.8), p('POSSIBLE_LIFE_SAFETY', 0.15)] })).possibleHarm).toBe(true);
  });
});

describe('autoConfirmDecision', () => {
  it('agreeing information report attaches without lowering attention', () => {
    expect(decide(laya(), claude())).toEqual({
      confirm: true, incidentId: 'inc-school', change: { addReportIds: ['live-1:r9'] }, reason: 'Laya and Claude agree: add to inc-school, information.',
    });
  });
  it('an agreed higher attention is applied', () => {
    const d = decide(laya(), claude(), [inc('inc-school', 'school', { attention: null })]);
    expect(d).toMatchObject({ confirm: true, change: { attention: 'INFORMATION' } });
    const up = decide(laya({ scores: [p('ATTACH_REPORT', 0.9), p('ACTIVE_NEED', 0.9)] }), claude({ attention: 'ACTIVE_NEED' }), [inc('inc-school', 'school', { attention: 'INFORMATION' })]);
    expect(up).toMatchObject({ confirm: true, change: { attention: 'ACTIVE_NEED' } });
  });
  it('both say new incident at the stated place', () => {
    const s = laya({ baseIncidentVersions: {}, scores: [p('NEW_INCIDENT', 0.8), p('ACTIVE_NEED', 0.9)] });
    const d = decide(s, claude({ action: 'NEW_INCIDENT', candidateIncidentId: null, attention: 'ACTIVE_NEED', baseIncidentVersions: {} }), [], 'shelter');
    expect(d).toEqual({
      confirm: true, incidentId: null, reason: 'Laya and Claude agree: a new incident at shelter, active need.',
      change: { status: 'OPEN', attention: 'ACTIVE_NEED', addReportIds: ['live-1:r9'], confirmedPlaceId: 'shelter' },
    });
    expect(decide(s, claude({ action: 'NEW_INCIDENT', candidateIncidentId: null, attention: 'ACTIVE_NEED', baseIncidentVersions: {} }), [], null)).toMatchObject({ confirm: false });
  });
  it('possible life safety from either model goes to a person', () => {
    // The first reason is the one the review band shows.
    const d = decide(laya(), claude({ attention: 'POSSIBLE_LIFE_SAFETY' }));
    expect(d.confirm === false && d.reasons[0]).toBe('Possible life safety, so a person decides.');
    expect(decide(laya({ attention: 'POSSIBLE_LIFE_SAFETY' }), claude())).toMatchObject({ confirm: false });
    expect(decide(laya({ scores: [...laya().scores.slice(0, 5), p('POSSIBLE_LIFE_SAFETY', 0.2)] }), claude())).toMatchObject({ confirm: false });
  });
  it('corrections, conflicts and review requests always go to a person, even when both agree', () => {
    for (const action of ['FLAG_CORRECTION', 'FLAG_CONFLICT'] as const) {
      expect(decide(laya({ action, candidateIncidentId: 'inc-school' }), claude({ action }))).toMatchObject({ confirm: false });
    }
    expect(decide(laya({ scores: [p('REQUEST_REVIEW', 0.9), p('INFORMATION', 0.9)] }), claude({ action: 'REQUEST_REVIEW', candidateIncidentId: null }))).toMatchObject({ confirm: false });
  });
  it('disagreement on action, incident or attention goes to a person', () => {
    expect(decide(laya(), claude({ action: 'NEW_INCIDENT', candidateIncidentId: null }))).toMatchObject({ confirm: false, reasons: expect.arrayContaining(['Laya and Claude disagree: Laya says add to an incident, Claude says a new incident.']) });
    expect(decide(laya(), claude({ attention: 'ACTIVE_NEED' }))).toMatchObject({ confirm: false });
    const two = [school, inc('inc-house', 'residence')];
    const s = laya({ baseIncidentVersions: { 'inc-school': 1, 'inc-house': 1 }, scores: [...laya().scores, p('inc-school', 0.8), p('inc-house', 0.2)] });
    expect(decide(s, claude({ candidateIncidentId: 'inc-house', baseIncidentVersions: { 'inc-school': 1, 'inc-house': 1 } }), two)).toMatchObject({ confirm: false });
  });
  it('a report on a possible-life-safety incident goes to a person, even an agreed all-clear', () => {
    // "Gas is shut off" / "driver is out and safe" on a life-safety incident: lowering it needs a person.
    expect(decide(laya(), claude(), [inc('inc-school', 'school', { attention: 'POSSIBLE_LIFE_SAFETY' })])).toMatchObject({
      confirm: false, reasons: ['The incident is possible life safety; only a person may lower it.'],
    });
  });
  it('a laya answer with no scores never confirms', () => {
    expect(decide(laya({ scores: [] }), claude())).toMatchObject({ confirm: false });
  });
  it('a moved incident, a closed incident or an already confirmed report goes to a person', () => {
    expect(decide(laya(), claude(), [inc('inc-school', 'school', { revision: 2 })])).toMatchObject({ confirm: false, reasons: ['inc-school changed since the models looked.'] });
    expect(decide(laya(), claude(), [inc('inc-school', 'school', { status: 'RESOLVED' })])).toMatchObject({ confirm: false });
    expect(decide(laya(), claude(), [inc('inc-school', 'school', { confirmedReportIds: ['live-1:r9'] })])).toMatchObject({ confirm: false });
  });
});

describe('nearestOpenIncidents', () => {
  const positions = new Map([['a', { x: 0, z: 0 }], ['b', { x: 10, z: 0 }], ['c', { x: 50, z: 0 }]]);
  it('same place first, then by distance, open only, at most max', () => {
    const list = [inc('ic', 'c'), inc('ib', 'b'), inc('ia', 'a'), inc('ix', 'b', { status: 'RESOLVED' }), inc('in', null)];
    expect(nearestOpenIncidents(list, 'b', positions).map((i) => i.incidentId)).toEqual(['ib', 'ia', 'ic', 'in']);
    expect(nearestOpenIncidents(list, 'b', positions, 2).map((i) => i.incidentId)).toEqual(['ib', 'ia']);
  });
  it('caps at ten candidates by default; no stated place takes the newest', () => {
    const many = Array.from({ length: 14 }, (_, n) => inc(`i${n}`, null, { openCycleStartSequence: n + 1 }));
    const got = nearestOpenIncidents(many, null, positions);
    expect(got).toHaveLength(10);
    expect(got[0].incidentId).toBe('i13');
  });
});
