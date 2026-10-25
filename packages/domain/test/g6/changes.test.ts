// G6 TEST · rule-based, source-backed change flags (§5 "update evidence appears as a
// visible change flag"; §17 "new unconfirmed information flags affected incidents").
import { describe, expect, it } from 'vitest';
import { changeFlags } from '../../src/index.ts';
import { afterR07Confirmed, deliver, relate, rid, startDesk, suggest } from './desk.ts';

const kindsFor = (flags: ReturnType<typeof changeFlags>, reportId: string) =>
  flags.filter((f) => f.reportId === reportId).map((f) => f.kind).sort();

describe('changeFlags', () => {
  it('no unconfirmed evidence, no flags', () => {
    expect(changeFlags(startDesk(), 'inc-school')).toEqual([]);
  });

  it('R07 arriving flags new evidence on the school before any model output', () => {
    const state = startDesk();
    deliver(state, 'R07');
    expect(kindsFor(changeFlags(state, 'inc-school'), rid('R07'))).toEqual(['NEW_EVIDENCE']);
  });

  it('a correction hint with possible harm adds both flags, citing R07', () => {
    const state = startDesk();
    deliver(state, 'R07');
    suggest(state, 'R07', { action: 'FLAG_CORRECTION', candidate: 'inc-school', attention: 'POSSIBLE_LIFE_SAFETY', score: 0.2 });
    const flags = changeFlags(state, 'inc-school');
    expect(kindsFor(flags, rid('R07'))).toEqual(['NEW_EVIDENCE', 'POSSIBLE_CORRECTION', 'POSSIBLE_LIFE_SAFETY']);
    for (const f of flags) {
      expect(f.incidentId).toBe('inc-school');
      expect(f.sourceReportIds).toContain(rid('R07'));
      expect(f.description).toContain('R07');
    }
  });

  it('R11 is flagged as a late older report, not as an all-clear', () => {
    const state = afterR07Confirmed();
    for (const id of ['R08', 'R09', 'R10', 'R11']) deliver(state, id);
    const flags = changeFlags(state, 'inc-school').filter((f) => f.reportId === rid('R11'));
    expect(flags.map((f) => f.kind)).toContain('LATE_OLDER_REPORT');
    expect(flags.find((f) => f.kind === 'LATE_OLDER_REPORT')?.description).toMatch(/R11/);
  });

  it('a provisional repeat is flagged as a repeat and adds no possible-harm flag of its own', () => {
    const state = afterR07Confirmed();
    deliver(state, 'R08');
    relate(state, 'R08', 'R07', 'REPEAT', 'inc-school');
    const k = kindsFor(changeFlags(state, 'inc-school'), rid('R08'));
    expect(k).toContain('REPEAT');
    expect(k).not.toContain('POSSIBLE_LIFE_SAFETY');
  });

  it('a conflict hint is flagged as a possible conflict', () => {
    const state = afterR07Confirmed();
    deliver(state, 'R11');
    suggest(state, 'R11', { action: 'FLAG_CONFLICT', candidate: 'inc-school', attention: null });
    expect(kindsFor(changeFlags(state, 'inc-school'), rid('R11'))).toContain('POSSIBLE_CONFLICT');
  });

  it('only flags evidence about the incident asked for', () => {
    const state = startDesk();
    deliver(state, 'R07'); // school
    expect(changeFlags(state, 'inc-school').length).toBeGreaterThan(0);
    expect(changeFlags(state, 'inc-residence')).toEqual([]);
    expect(changeFlags(state, 'inc-shelter')).toEqual([]);
  });
});
