// G6 REVIEW · independent replay of the §18 exercise with arrivals reordered, plus the
// §20 review checks: originals stay inspectable, only confirmed updates move the rank,
// unreviewed possible harm stays prominent, reopen keeps history with explicit cycle
// age, change descriptions are source-backed, the queue is stable, and a stale
// approval from a second window is refused.
import { describe, expect, it } from 'vitest';
import {
  applyIncidentChange,
  changeFlags,
  checkFreshness,
  computeInputSignature,
  confirmedQueue,
  deskInvariants,
  needsReassessment,
  reviewBand,
  timeline,
  type DeskState,
  type IncidentView,
} from '../../src/index.ts';
import { RUN, deliver, emptyDesk, exercise, ids, incident, rid, suggest } from './desk.ts';

/** Deterministic PRNG (mulberry32) so every run replays the same orders. */
function rng(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function shuffle<T>(xs: T[], next: () => number): T[] {
  const a = xs.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(next() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

const START = ['R01', 'R02', 'R03', 'R04', 'R05', 'R06'];
const LATER = ['R07', 'R08', 'R09', 'R10', 'R11', 'R12'];

/** The authored starting state, built from whatever order R01–R06 arrived in. */
function startFrom(order: string[]): DeskState {
  const state = emptyDesk();
  for (const id of order) deliver(state, id);
  for (const i of exercise.startingState.incidents) {
    const reportIds = i.reportMessageIds.map(rid);
    const seqs = reportIds.map((r: string) => state.reports.find((x) => x.reportId === r)!.receiveSequence);
    state.incidents.push({
      runId: RUN,
      incidentId: i.incidentId,
      revision: 1,
      status: 'OPEN',
      attention: i.attention,
      confirmedPlaceId: i.placeId,
      confirmedReportIds: reportIds,
      summary: null,
      openCycleStartSequence: Math.min(...seqs),
    });
  }
  return state;
}

/** Independent late-older oracle: sent earlier than any report received before it. */
function expectedLateOlder(state: DeskState): string[] {
  const out: string[] = [];
  const seen: number[] = [];
  for (const r of state.reports.slice().sort((a, b) => a.receiveSequence - b.receiveSequence)) {
    const t = r.input.sentAt === null ? null : Date.parse(r.input.sentAt);
    if (t !== null && seen.some((s) => s > t)) out.push(r.input.messageId);
    if (t !== null) seen.push(t);
  }
  return out;
}

const ORDERS = 40;

describe('replay with arrivals reordered', () => {
  const next = rng(0x6c6);
  const runs = Array.from({ length: ORDERS }, () => ({ start: shuffle(START, next), later: shuffle(LATER, next), repeatAt: Math.floor(next() * 7) }));

  it.each(runs.map((r, k) => [k, r] as const))('order %i: every original stays, only confirmed state ranks, harm stays on top', (_k, { start, later, repeatAt }) => {
    const state = startFrom(start);
    const queueAtStart = ids(confirmedQueue(state));
    expect(queueAtStart).toEqual(['inc-residence', 'inc-shelter', 'inc-school']);

    const arrivals = later.slice();
    arrivals.splice(repeatAt, 0, 'R08-repeat'); // a repeat with a new message ID: new evidence
    for (const id of arrivals) {
      if (id === 'R08-repeat') deliver(state, 'R08', { messageId: 'R08-again' });
      else deliver(state, id);
      expect(deskInvariants(state), `after ${id}`).toEqual([]);
      // Nothing confirmed yet: the rank never moves, and the school needs reassessment.
      expect(ids(confirmedQueue(state))).toEqual(queueAtStart);
      expect(needsReassessment(state).has('inc-school')).toBe(true);
    }

    // Every original once, in receive order, text exact.
    const t = timeline(state);
    expect(t).toHaveLength(13);
    expect(t.map((e) => e.report.receiveSequence)).toEqual(Array.from({ length: 13 }, (_, i) => i + 1));
    for (const e of t) {
      const authored = exercise.events.find((x: any) => x.input.messageId === e.report.input.messageId.replace('-again', ''));
      expect(e.report.input.text).toBe(authored.input.text);
    }
    expect(t.filter((e) => e.lateOlder).map((e) => e.report.input.messageId)).toEqual(expectedLateOlder(state));

    // Every unconfirmed report is in the band exactly once.
    const band = reviewBand(state);
    const unconfirmedIds = state.reports.filter((r) => !state.incidents.some((i) => i.confirmedReportIds.includes(r.reportId))).map((r) => r.reportId);
    expect(band.map((i) => i.reportId).sort()).toEqual(unconfirmedIds.sort());

    // A low-score possible-harm hint on R07 leads the band, whatever arrived around it.
    suggest(state, 'R11', { action: 'ATTACH_REPORT', candidate: 'inc-school', attention: 'INFORMATION', score: 0.99 });
    suggest(state, 'R07', { action: 'FLAG_CORRECTION', candidate: 'inc-school', attention: 'POSSIBLE_LIFE_SAFETY', score: 0.03 });
    expect(reviewBand(state)[0]).toMatchObject({ kind: 'POSSIBLE_LIFE_SAFETY', reportId: rid('R07') });
    expect(ids(confirmedQueue(state))).toEqual(queueAtStart);

    // Confirming R07's concern is the only thing that moves the school up.
    const school = incident(state, 'inc-school');
    const r = applyIncidentChange(school, { attention: 'POSSIBLE_LIFE_SAFETY', addReportIds: [rid('R07')] }, { runId: RUN, incidentId: 'inc-school', reopenSequence: 1 });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    state.incidents = state.incidents.map((i) => (i.incidentId === 'inc-school' ? r.value : i));
    expect(deskInvariants(state)).toEqual([]);
    // School and residence are both life safety now; the older open cycle leads.
    const q = ids(confirmedQueue(state));
    const schoolFirst = incident(state, 'inc-school').openCycleStartSequence < incident(state, 'inc-residence').openCycleStartSequence;
    expect(q).toEqual(schoolFirst ? ['inc-school', 'inc-residence', 'inc-shelter'] : ['inc-residence', 'inc-school', 'inc-shelter']);
    // R11 arriving late never erases the confirmed concern.
    expect(incident(state, 'inc-school').attention).toBe('POSSIBLE_LIFE_SAFETY');
  });

  it('R11 before R07 in receive order is not late; after R07 it is', () => {
    const early = startFrom(START);
    for (const id of ['R11', 'R07']) deliver(early, id);
    expect(timeline(early).filter((e) => e.lateOlder).map((e) => e.report.input.messageId)).toEqual(['R11']); // still older than R06
    const late = startFrom(START);
    for (const id of ['R07', 'R11']) deliver(late, id);
    expect(timeline(late).filter((e) => e.lateOlder).map((e) => e.report.input.messageId)).toEqual(['R11']);
  });

  it('compares sent times by instant, not by string, across offsets', () => {
    const state = startFrom(START);
    // 09:35 UTC written as 02:35-07:00 sorts before "2026-10-25T09…" as text but is later than R06 (09:30Z).
    deliver(state, 'R07', { sentAt: '2026-10-25T02:35:00-07:00' });
    deliver(state, 'R08', { sentAt: '2026-10-25T09:33:00Z' });
    const late = timeline(state).filter((e) => e.lateOlder).map((e) => e.report.input.messageId);
    expect(late).toEqual(['R08']);
  });
});

describe('stale approval from a second window', () => {
  it('window B, approving against the revision both windows saw, is refused after window A approves', () => {
    const state = startFrom(START);
    deliver(state, 'R07');
    const seen = incident(state, 'inc-school').revision; // both windows render revision 1
    const sigFor = (s: DeskState) =>
      computeInputSignature({
        runId: RUN,
        orderedReportIds: timeline(s, 'inc-school').map((e) => e.report.reportId).concat(s.reports.filter((r) => r.input.reportedLocation?.placeId === 'school').map((r) => r.reportId)),
        incidentRevisions: { 'inc-school': incident(s, 'inc-school').revision },
      });
    const seenSig = sigFor(state);

    // Window A approves.
    const a = applyIncidentChange(incident(state, 'inc-school'), { attention: 'POSSIBLE_LIFE_SAFETY', addReportIds: [rid('R07')] }, { runId: RUN, incidentId: 'inc-school', reopenSequence: 1 });
    expect(a.ok).toBe(true);
    if (!a.ok) return;
    state.incidents = state.incidents.map((i) => (i.incidentId === 'inc-school' ? a.value : i));

    // Window B still holds revision 1 and the old signature.
    const b = checkFreshness(
      { runId: RUN, baseIncidentVersions: { 'inc-school': seen }, inputSignature: seenSig },
      { activeRunId: RUN, incidentRevisions: { 'inc-school': incident(state, 'inc-school').revision }, inputSignature: sigFor(state) },
    );
    expect(b).toMatchObject({ ok: false, error: { code: 'STALE_REVISION' } });
  });

  it('new evidence with the revision unchanged also makes the older view stale', () => {
    const state = startFrom(START);
    deliver(state, 'R07');
    const ordered = (s: DeskState) => s.reports.filter((r) => r.input.reportedLocation?.placeId === 'school').map((r) => r.reportId);
    const sig = (s: DeskState) => computeInputSignature({ runId: RUN, orderedReportIds: ordered(s), incidentRevisions: { 'inc-school': 1 } });
    const seenSig = sig(state);
    deliver(state, 'R08'); // arrives while window B is looking
    expect(needsReassessment(state).has('inc-school')).toBe(true);
    const b = checkFreshness(
      { runId: RUN, baseIncidentVersions: { 'inc-school': 1 }, inputSignature: seenSig },
      { activeRunId: RUN, incidentRevisions: { 'inc-school': 1 }, inputSignature: sig(state) },
    );
    expect(b).toMatchObject({ ok: false, error: { code: 'STALE_REVISION' } });
  });

  it('replaying the same approved change against the new revision is a no-op error, not a second bump', () => {
    const school = incident(startFrom(START), 'inc-school');
    const ctx = { runId: RUN, incidentId: 'inc-school', reopenSequence: 1 };
    const once = applyIncidentChange(school, { attention: 'POSSIBLE_LIFE_SAFETY' }, ctx);
    expect(once.ok).toBe(true);
    if (!once.ok) return;
    expect(applyIncidentChange(once.value, { attention: 'POSSIBLE_LIFE_SAFETY' }, ctx)).toMatchObject({ ok: false, error: { code: 'INVALID_INPUT' } });
  });
});

describe('reopen keeps history with explicit cycle age', () => {
  it('resolve, new evidence, reopen: same ID, every report still in its timeline, new cycle from the reopening report', () => {
    const state = startFrom(START);
    for (const id of LATER) deliver(state, id);
    const ctx = (seq: number) => ({ runId: RUN, incidentId: 'inc-school', reopenSequence: seq });
    const put = (v: IncidentView) => (state.incidents = state.incidents.map((i) => (i.incidentId === v.incidentId ? v : i)));
    const step = (r: ReturnType<typeof applyIncidentChange>) => {
      expect(r.ok).toBe(true);
      if (r.ok) put(r.value);
    };
    step(applyIncidentChange(incident(state, 'inc-school'), { addReportIds: [rid('R07'), rid('R08'), rid('R09'), rid('R10'), rid('R11')] }, ctx(1)));
    step(applyIncidentChange(incident(state, 'inc-school'), { status: 'RESOLVED' }, ctx(1)));
    expect(ids(confirmedQueue(state))).not.toContain('inc-school');
    const r12 = state.reports.find((r) => r.reportId === rid('R12'))!;
    step(applyIncidentChange(incident(state, 'inc-school'), { status: 'OPEN', attention: 'POSSIBLE_LIFE_SAFETY', addReportIds: [r12.reportId] }, ctx(r12.receiveSequence)));
    const school = incident(state, 'inc-school');
    expect(school).toMatchObject({ incidentId: 'inc-school', status: 'OPEN', openCycleStartSequence: r12.receiveSequence, revision: 4 });
    expect(timeline(state, 'inc-school').map((e) => e.report.input.messageId)).toEqual(['R01', 'R05', ...LATER]);
    expect(deskInvariants(state)).toEqual([]);
    // Ranked by the new cycle: behind the residence (cycle 3) in the same category.
    expect(ids(confirmedQueue(state))).toEqual(['inc-residence', 'inc-school', 'inc-shelter']);
  });

  it('a new report naming a resolved place still flags that incident for reassessment', () => {
    const state = startFrom(START);
    const r = applyIncidentChange(incident(state, 'inc-shelter'), { status: 'RESOLVED' }, { runId: RUN, incidentId: 'inc-shelter', reopenSequence: 2 });
    if (r.ok) state.incidents = state.incidents.map((i) => (i.incidentId === 'inc-shelter' ? r.value : i));
    deliver(state, 'R04', { messageId: 'R04-after-resolve' });
    expect(needsReassessment(state).has('inc-shelter')).toBe(true);
    expect(reviewBand(state)[0]).toMatchObject({ incidentId: 'inc-shelter', kind: 'UNKNOWN' });
  });
});

describe('reviewed suggestions stop counting (found by mutation check)', () => {
  it.each(['REJECTED', 'STALE'] as const)('a %s suggestion neither links its report nor raises possible harm', (reviewState) => {
    const state = startFrom(START);
    deliver(state, 'R07');
    const r = applyIncidentChange(incident(state, 'inc-school'), { addReportIds: [rid('R07')] }, { runId: RUN, incidentId: 'inc-school', reopenSequence: 1 });
    if (r.ok) state.incidents = state.incidents.map((i) => (i.incidentId === 'inc-school' ? r.value : i));
    deliver(state, 'R10');
    suggest(state, 'R10', { action: 'ATTACH_REPORT', candidate: 'inc-shelter', attention: 'POSSIBLE_LIFE_SAFETY', score: 0.9, reviewState });
    expect(reviewBand(state)).toEqual([expect.objectContaining({ reportId: rid('R10'), kind: 'UNKNOWN', incidentId: 'inc-school' })]);
    expect(timeline(state).find((e) => e.report.reportId === rid('R10'))).toMatchObject({ standing: 'UNASSIGNED', incidentId: null });
    expect([...needsReassessment(state)]).toEqual(['inc-school']);
    expect(changeFlags(state, 'inc-shelter')).toEqual([]);
  });
});

describe('change descriptions are source-backed', () => {
  it('every flag names its own report and cites only reports that exist; relation flags cite their target', () => {
    const state = startFrom(START);
    for (const id of LATER) deliver(state, id);
    suggest(state, 'R07', { action: 'FLAG_CORRECTION', candidate: 'inc-school', attention: 'POSSIBLE_LIFE_SAFETY', score: 0.4 });
    suggest(state, 'R11', { action: 'FLAG_CONFLICT', candidate: 'inc-school', attention: null });
    state.relations.push({ runId: RUN, relationId: 'rel-r', reportId: rid('R08'), targetReportId: rid('R07'), kind: 'REPEAT', incidentId: 'inc-school', state: 'PROVISIONAL', proposalId: null, reviewer: null });
    const flags = changeFlags(state, 'inc-school');
    const known = new Set(state.reports.map((r) => r.reportId));
    for (const f of flags) {
      const msg = state.reports.find((r) => r.reportId === f.reportId)!.input.messageId;
      expect(f.description).toContain(msg);
      expect(f.sourceReportIds[0]).toBe(f.reportId);
      for (const s of f.sourceReportIds) expect(known.has(s)).toBe(true);
    }
    const repeat = flags.find((f) => f.kind === 'REPEAT')!;
    expect(repeat.sourceReportIds).toContain(rid('R07'));
    expect(repeat.description).toContain('R07');
    // No flag claims a confirmed fact or a headcount.
    for (const f of flags) expect(f.description).not.toMatch(/\bconfirmed (person|people)\b|\b\d+ (people|persons)\b/i);
  });
});

describe('queue stability', () => {
  it('the same state in any array order gives the same queue, band, and timeline', () => {
    const base = startFrom(START);
    for (const id of LATER) deliver(base, id);
    suggest(base, 'R12', { action: 'ATTACH_REPORT', candidate: 'inc-school', attention: 'POSSIBLE_LIFE_SAFETY' });
    const next = rng(7);
    const want = { q: confirmedQueue(base), b: reviewBand(base), t: timeline(base) };
    for (let k = 0; k < 10; k++) {
      const s = structuredClone(base);
      s.incidents = shuffle(s.incidents, next);
      s.reports = shuffle(s.reports, next);
      expect(confirmedQueue(s)).toEqual(want.q);
      expect(reviewBand(s)).toEqual(want.b);
      expect(timeline(s)).toEqual(want.t);
    }
  });
});
