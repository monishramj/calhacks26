import { describe, expect, it, vi } from 'vitest';
import { createFixtureBackend } from '../src/fixtureBackend';
import { enrichClaude } from '../src/inference/claude/enrich';
import { runLoop, runOnce } from '../src/runner';

const quiet = () => {};
// Simulated slow Claude (2 s); the real enrichClaude stays available for the real-Claude test below.
vi.mock('../src/inference/claude/enrich', async (orig) => ({
  ...(await orig<object>()),
  enrich: async () => (await new Promise((r) => setTimeout(r, 2000)), { ok: false, reason: 'unavailable', detail: 'simulated slow claude', responses: 0, toolExecutions: 0, ms: 2000 }),
}));

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
