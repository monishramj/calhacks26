import { describe, expect, it, vi } from 'vitest';
import type { LocalSuggestion } from '@calhacks26/domain';
import { createFixtureBackend } from '../src/fixtureBackend';
import { toCheck } from '../src/inference/claude/check';
import { enrichClaude } from '../src/inference/claude/enrich';
import { runLoop, runOnce } from '../src/runner';

const quiet = () => {};
// Simulated slow Claude (2 s); the real enrichClaude stays available for the real-Claude test below.
vi.mock('../src/inference/claude/enrich', async (orig) => ({
  ...(await orig<object>()),
  enrich: async () => (await new Promise((r) => setTimeout(r, 2000)), { ok: false, reason: 'unavailable', detail: 'simulated slow claude', responses: 0, toolExecutions: 0, ms: 2000 }),
}));

// Simulated Claude check: its own reading per target report, run through the real toCheck validation.
vi.mock('../src/inference/claude/check', async (orig) => {
  const real = await orig<typeof import('../src/inference/claude/check')>();
  const answers: Record<string, object> = {
    'rep-2': { action: 'ATTACH_REPORT', candidateIncidentId: 'inc-school-gym', attention: 'POSSIBLE_LIFE_SAFETY', evidenceReportIds: ['rep-2', 'rep-1'], reason: 'Oxygen generator out.' },
    'rep-3': { action: 'ATTACH_REPORT', candidateIncidentId: 'inc-school-gym', attention: 'ACTIVE_NEED', evidenceReportIds: ['rep-3'], reason: 'Hearsay; rescue unconfirmed.' },
    'rep-5': { action: 'ATTACH_REPORT', candidateIncidentId: 'inc-school-gym', attention: 'INFORMATION', evidenceReportIds: ['rep-5'], reason: 'Road status only.' },
  };
  return {
    ...real,
    check: async (job: any, input: any) => {
      const out = real.toCheck(answers[input.targetReportId], input, job, 'claude-mock');
      return out.ok ? { ok: true, check: out.check, model: 'claude-mock', responses: 1, ms: 1 } : { ok: false, reason: 'bounds', detail: out.error, responses: 1, ms: 1 };
    },
  };
});

describe('runner against the fixture backend', () => {
  it('laya off: claims nothing, submits nothing', async () => {
    const b = createFixtureBackend();
    expect(await runOnce(b, b.runId, { laya: { kind: 'off' }, claude: false, log: quiet })).toBe(0);
    expect(b.suggestions).toHaveLength(0);
    expect(b.jobs.every((j) => j.job.state === 'QUEUED')).toBe(true);
  });
  it('stub is labeled fixture and only runs when asked', async () => {
    const b = createFixtureBackend();
    await runOnce(b, b.runId, { laya: { kind: 'stub' }, claude: false, log: quiet });
    expect(b.suggestions.map((s) => s.provider)).toEqual(['fixture']);
  });
  it('ignores an old run', async () => {
    const b = createFixtureBackend();
    expect(await runOnce(b, 'run-old', { laya: { kind: 'stub' }, claude: false, log: quiet })).toBe(0);
  });
  it('loop wakes on queued work and stops on abort', async () => {
    const b = createFixtureBackend();
    const ac = new AbortController();
    const loop = runLoop(
      { ...b, runId: () => b.runId, queued: (k) => b.jobs.filter((j) => j.job.state === 'QUEUED' && k.includes(j.job.kind)).length, onChange: () => {} },
      async () => ({ laya: { kind: 'stub' }, claude: false }),
      { tickMs: 20, signal: ac.signal },
    );
    await new Promise((r) => setTimeout(r, 100));
    ac.abort();
    await loop;
    expect(b.suggestions).toHaveLength(1);
  });
  it('a slow Claude job does not delay a queued Laya job', async () => {
    const b = createFixtureBackend();
    const mk = (only: 'laya' | 'claude', ac: AbortController) =>
      runLoop(
        { ...b, runId: () => b.runId, queued: (k) => b.jobs.filter((j) => j.job.state === 'QUEUED' && k.includes(j.job.kind)).length, onChange: () => {} },
        async () => ({ laya: { kind: 'stub' }, claude: true }),
        { tickMs: 20, signal: ac.signal, only },
      );
    const ac = new AbortController();
    const t0 = Date.now();
    const loops = [mk('laya', ac), mk('claude', ac)];
    while (b.suggestions.length === 0) await new Promise((r) => setTimeout(r, 10));
    expect(Date.now() - t0).toBeLessThan(1000);
    expect(b.jobs.find((j) => j.job.kind === 'INCIDENT_PROPOSAL')!.job.state).toBe('CLAIMED'); // Claude still running
    ac.abort();
    await Promise.all(loops);
  }, 15000);
});

const key = process.env.ANTHROPIC_API_KEY;
describe.skipIf(!key || !process.env.CLAUDE_MODEL)('real Claude call', () => {
  it('produces a validated proposal citing known reports', async () => {
    const b = createFixtureBackend();
    const e = b.jobs.find((j) => j.job.kind === 'INCIDENT_PROPOSAL')!;
    const res = await enrichClaude(e.job, e.input);
    expect(res, JSON.stringify(res)).toMatchObject({ ok: true });
    if (res.ok) {
      expect(res.proposal.provider).toBe('claude');
      expect(res.proposal.evidenceReportIds.length).toBeGreaterThan(0);
    }
  }, 30_000);
});

describe('Claude checks Laya (fixture backend)', () => {
  // Laya as it usually answers: REQUEST_REVIEW, with scores the backend reads as its top labels.
  const p = (label: string, value: number) => ({ label, value, kind: 'probability' as const });
  const layaScores: Record<string, ReturnType<typeof p>[]> = {
    'rep-2': [p('ATTACH_REPORT', 0.6), p('REQUEST_REVIEW', 0.4), p('ACTIVE_NEED', 0.5), p('POSSIBLE_LIFE_SAFETY', 0.4), p('INFORMATION', 0.1)],
    'rep-3': [p('ATTACH_REPORT', 0.5), p('REQUEST_REVIEW', 0.5), p('INFORMATION', 0.9), p('ACTIVE_NEED', 0.05), p('POSSIBLE_LIFE_SAFETY', 0.05)],
    'rep-5': [p('ATTACH_REPORT', 0.55), p('REQUEST_REVIEW', 0.45), p('INFORMATION', 0.9), p('ACTIVE_NEED', 0.05), p('POSSIBLE_LIFE_SAFETY', 0.05)],
  };

  async function run(attention: 'POSSIBLE_LIFE_SAFETY' | 'ACTIVE_NEED') {
    const b = createFixtureBackend({ attention });
    b.jobs.length = 0;
    for (const reportId of Object.keys(layaScores)) {
      b.addJob(`job-local-${reportId}`, 'LOCAL_SUGGESTION', reportId, null);
      const claimed = await b.claimJob({ runId: b.runId, kinds: ['LOCAL_SUGGESTION'] });
      const { job, input } = claimed.ok && claimed.value ? claimed.value : (() => { throw new Error('no job'); })();
      const suggestion: LocalSuggestion = {
        runId: b.runId, reportId, action: 'REQUEST_REVIEW', candidateIncidentId: null, attention: null, scores: layaScores[reportId],
        evidenceReportIds: [reportId], baseIncidentVersions: job.baseIncidentVersions, inputSignature: input.inputSignature, provider: 'local_laya',
      };
      expect(await b.submitLocalSuggestion({ jobId: job.jobId, suggestion })).toMatchObject({ ok: true });
    }
    expect(b.jobs.filter((j) => j.job.kind === 'LOCAL_CHECK')).toHaveLength(3);

    await runOnce(b, b.runId, { laya: { kind: 'off' }, claude: true, log: quiet });
    return b;
  }

  it('agreeing information confirms with the claude_check label; life safety and disagreement stay in review', async () => {
    const b = await run('ACTIVE_NEED');
    expect(b.checks.map((c) => c.reportId)).toEqual(['rep-2', 'rep-3', 'rep-5']);
    expect(b.reviewEvents).toHaveLength(1);
    expect(b.reviewEvents[0]).toMatchObject({ actorRole: 'claude_check', sourceReportIds: ['rep-5'], reason: 'Laya and Claude agree: attach to inc-school-gym, INFORMATION' });
    // Confirmed without lowering the open concern; the other two are not confirmed.
    expect(b.incident()).toMatchObject({ revision: 2, attention: 'ACTIVE_NEED', confirmedReportIds: ['rep-1', 'rep-5'] });
    // The disagreement keeps Claude's own view for side-by-side review.
    expect(b.checks.find((c) => c.reportId === 'rep-3')).toMatchObject({ action: 'ATTACH_REPORT', attention: 'ACTIVE_NEED', reason: 'Hearsay; rescue unconfirmed.', provider: 'claude' });
  });

  it('on a possible-life-safety incident even the agreed information report waits for a person', async () => {
    const b = await run('POSSIBLE_LIFE_SAFETY');
    expect(b.checks).toHaveLength(3);
    expect(b.reviewEvents).toHaveLength(0);
    expect(b.incident()).toMatchObject({ revision: 1, attention: 'POSSIBLE_LIFE_SAFETY', confirmedReportIds: ['rep-1'] });
  });

  it('toCheck keeps Claude to the job: known reports, candidate incidents, target always cited', () => {
    const b = createFixtureBackend();
    b.addJob('job-check-rep-4', 'LOCAL_CHECK', 'rep-4', null);
    const { job, input } = b.jobs.at(-1)!;
    const base = { action: 'ATTACH_REPORT', candidateIncidentId: 'inc-school-gym', attention: 'ACTIVE_NEED', evidenceReportIds: ['rep-1'], reason: 'x' };
    expect(toCheck(base, input, job, 'm')).toMatchObject({ ok: true, check: { evidenceReportIds: ['rep-4', 'rep-1'], provider: 'claude' } });
    expect(toCheck({ ...base, candidateIncidentId: 'inc-other' }, input, job, 'm')).toMatchObject({ ok: false });
    expect(toCheck({ ...base, evidenceReportIds: ['rep-99'] }, input, job, 'm')).toMatchObject({ ok: false });
    expect(toCheck({ ...base, action: 'APPROVE' }, input, job, 'm')).toMatchObject({ ok: false });
  });
});
