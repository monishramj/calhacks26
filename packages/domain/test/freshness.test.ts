// G0 TEST · inputSignature, stale revisions, wrong run, source ownership, and
// idempotent command IDs (§9, §17).
import { describe, expect, it } from 'vitest';
import {
  checkFreshness,
  checkSourceOwnership,
  citedReportIds,
  computeInputSignature,
  recallCommand,
  recordCommand,
} from '../src/index.ts';
import { firstValid } from './helpers.ts';

const base = {
  runId: 'run-001',
  orderedReportIds: ['rep-000001', 'rep-000005', 'rep-000007'],
  incidentRevisions: { 'inc-school': 2, 'inc-residence': 1 },
};

describe('computeInputSignature', () => {
  const sig = computeInputSignature(base);

  it('is a non-empty identifier-safe string', () => {
    expect(sig).toMatch(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/);
  });
  it('is deterministic and ignores map key order', () => {
    expect(computeInputSignature(structuredClone(base))).toBe(sig);
    expect(computeInputSignature({ ...base, incidentRevisions: { 'inc-residence': 1, 'inc-school': 2 } })).toBe(sig);
  });
  it('changes when a new relevant report arrives', () => {
    expect(computeInputSignature({ ...base, orderedReportIds: [...base.orderedReportIds, 'rep-000008'] })).not.toBe(sig);
  });
  it('changes when an incident revision changes', () => {
    expect(computeInputSignature({ ...base, incidentRevisions: { 'inc-school': 3, 'inc-residence': 1 } })).not.toBe(sig);
  });
  it('changes with the run', () => {
    expect(computeInputSignature({ ...base, runId: 'run-002' })).not.toBe(sig);
  });
  it('is order-sensitive (the backend orders reports by receive sequence)', () => {
    expect(computeInputSignature({ ...base, orderedReportIds: ['rep-000005', 'rep-000001', 'rep-000007'] })).not.toBe(sig);
  });
  it('does not collide when IDs are concatenated differently', () => {
    const a = computeInputSignature({ runId: 'run-001', orderedReportIds: ['ab', 'c'], incidentRevisions: {} });
    const b = computeInputSignature({ runId: 'run-001', orderedReportIds: ['a', 'bc'], incidentRevisions: {} });
    expect(a).not.toBe(b);
  });
});

describe('checkFreshness', () => {
  const current = () => ({
    activeRunId: 'run-001',
    incidentRevisions: { 'inc-school': 2, 'inc-residence': 1 },
    inputSignature: computeInputSignature(base),
  });
  const submitted = () => ({
    runId: 'run-001',
    baseIncidentVersions: { 'inc-school': 2, 'inc-residence': 1 },
    inputSignature: computeInputSignature(base),
  });

  it('accepts a result built on the current state', () => {
    expect(checkFreshness(submitted(), current())).toEqual({ ok: true, value: null });
  });
  it('rejects another run with WRONG_RUN, before any revision check', () => {
    const s = { ...submitted(), runId: 'run-000', baseIncidentVersions: { 'inc-school': 1 } };
    expect(checkFreshness(s, current())).toMatchObject({ ok: false, error: { code: 'WRONG_RUN' } });
  });
  it('rejects when any one of several referenced incidents moved on', () => {
    const c = { ...current(), incidentRevisions: { 'inc-school': 2, 'inc-residence': 2 } };
    expect(checkFreshness(submitted(), c)).toMatchObject({ ok: false, error: { code: 'STALE_REVISION' } });
  });
  it('rejects when new relevant evidence arrived even though revisions match', () => {
    const c = { ...current(), inputSignature: computeInputSignature({ ...base, orderedReportIds: [...base.orderedReportIds, 'rep-000008'] }) };
    expect(checkFreshness(submitted(), c)).toMatchObject({ ok: false, error: { code: 'STALE_REVISION' } });
  });
  it('accepts base version 0 for an incident that does not exist yet', () => {
    const s = { ...submitted(), baseIncidentVersions: { 'inc-school': 2, 'inc-residence': 1, 'inc-new-1': 0 } };
    expect(checkFreshness(s, current())).toEqual({ ok: true, value: null });
  });
  it('rejects base version 0 when that incident already exists', () => {
    const s = { ...submitted(), baseIncidentVersions: { 'inc-school': 0, 'inc-residence': 1 } };
    expect(checkFreshness(s, current())).toMatchObject({ ok: false, error: { code: 'STALE_REVISION' } });
  });
  it('rejects a positive base version for an incident that does not exist', () => {
    const s = { ...submitted(), baseIncidentVersions: { 'inc-school': 2, 'inc-residence': 1, 'inc-ghost': 3 } };
    expect(checkFreshness(s, current())).toMatchObject({ ok: false, error: { code: 'STALE_REVISION' } });
  });
});

describe('source ownership', () => {
  it('collects every report an IncidentProposal cites: added, evidence, and both relation ends', () => {
    const ip = firstValid('IncidentProposal');
    ip.relations.push({ reportId: 'rep-000008', targetReportId: 'rep-000005', kind: 'REPEAT' });
    expect([...citedReportIds(ip)].sort()).toEqual(['rep-000001', 'rep-000005', 'rep-000007', 'rep-000008']);
  });
  it('collects the report and evidence a LocalSuggestion cites', () => {
    expect([...citedReportIds(firstValid('LocalSuggestion'))].sort()).toEqual(['rep-000001', 'rep-000007']);
  });

  const known = new Map([
    ['rep-000001', { runId: 'run-001' }],
    ['rep-000007', { runId: 'run-001' }],
    ['rep-000099', { runId: 'run-000' }],
  ]);
  it('accepts reports that exist in this run', () => {
    expect(checkSourceOwnership('run-001', ['rep-000001', 'rep-000007'], known)).toEqual({ ok: true, value: null });
  });
  it('rejects an unknown report with INVALID_SOURCE', () => {
    expect(checkSourceOwnership('run-001', ['rep-000001', 'rep-404'], known)).toMatchObject({ ok: false, error: { code: 'INVALID_SOURCE' } });
  });
  it('rejects a report from another run with INVALID_SOURCE', () => {
    expect(checkSourceOwnership('run-001', ['rep-000099'], known)).toMatchObject({ ok: false, error: { code: 'INVALID_SOURCE' } });
  });
});

describe('duplicate command IDs are idempotent', () => {
  const payload = { commandId: 'cmd-0001', runId: 'run-001', proposalId: 'prop-0001' };
  const result = { ok: true, value: { incidentId: 'inc-school', revision: 3 } };
  const ledger = () => recordCommand(new Map(), 'cmd-0001', payload, result);

  it('an unseen command ID is new', () => {
    expect(recallCommand(new Map(), 'cmd-0001', payload)).toEqual({ ok: true, value: { kind: 'new' } });
  });
  it('recordCommand does not mutate the ledger it was given', () => {
    const empty = new Map();
    recordCommand(empty, 'cmd-0001', payload, result);
    expect(empty.size).toBe(0);
  });
  it('a repeat returns the recorded result', () => {
    expect(recallCommand(ledger(), 'cmd-0001', structuredClone(payload))).toEqual({ ok: true, value: { kind: 'repeat', result } });
  });
  it('a repeat with keys in a different order is still the same command', () => {
    const reordered = { proposalId: 'prop-0001', runId: 'run-001', commandId: 'cmd-0001' };
    expect(recallCommand(ledger(), 'cmd-0001', reordered)).toEqual({ ok: true, value: { kind: 'repeat', result } });
  });
  it('reusing a command ID for a different payload is rejected, not replayed', () => {
    expect(recallCommand(ledger(), 'cmd-0001', { ...payload, proposalId: 'prop-0002' })).toMatchObject({
      ok: false,
      error: { code: 'INVALID_INPUT' },
    });
  });
  it('a recorded failure is returned again on repeat (no retry side effects)', () => {
    const failed = { ok: false, error: { code: 'STALE_REVISION', message: 'inc-school is at 3' } };
    const p = { ...payload, commandId: 'cmd-0009' };
    const l = recordCommand(new Map(), 'cmd-0009', p, failed);
    expect(recallCommand(l, 'cmd-0009', p)).toEqual({ ok: true, value: { kind: 'repeat', result: failed } });
  });
  it('an invalid command ID is rejected', () => {
    expect(recallCommand(new Map(), 'cmd 1', payload)).toMatchObject({ ok: false, error: { code: 'INVALID_INPUT' } });
  });
});
