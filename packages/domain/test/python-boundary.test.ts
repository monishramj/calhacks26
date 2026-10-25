// G0 TEST · actual serialized payloads across the Python boundary, both directions.
// Python → TS: payloads produced by real json.dumps calls (the bridge and Laya worker
// serialize this way). TS → Python: TS-built payloads validated by jsonschema.
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { acceptReport, buildJobInput, parseWire } from '../src/index.ts';
import { DOMAIN_ROOT, firstValid } from './helpers.ts';
import { hasVenv, systemPython, venvPython } from './python-env.mjs';

function emitted(): Record<string, { type: string; json: string; expectOk: boolean; text: string | null }> {
  const py = systemPython();
  if (!py) throw new Error('No Python 3 found (environment, not a contract result). Install Python 3 or set PYTHON.');
  const r = spawnSync(py[0], [...py[1], join(DOMAIN_ROOT, 'test', 'python', 'emit_payloads.py')], {
    encoding: 'utf8',
    env: { ...process.env, PYTHONIOENCODING: 'utf-8' }, // Windows consoles default to a legacy code page
  });
  if (r.status !== 0) throw new Error(`emit_payloads.py failed (environment, not a contract result): ${r.stderr}`);
  return JSON.parse(r.stdout);
}

function pythonValidates(type: string, value: unknown): { ok: boolean; stderr: string } {
  if (!hasVenv()) throw new Error(`No Python env at ${venvPython()} (environment, not a contract result). Run npm run setup:py.`);
  const r = spawnSync(venvPython(), [join(DOMAIN_ROOT, 'test', 'python', 'validate_payload.py'), type], {
    input: JSON.stringify(value),
    encoding: 'utf8',
    env: { ...process.env, PYTHONIOENCODING: 'utf-8' },
  });
  return { ok: r.status === 0, stderr: r.stderr };
}

describe('Python producer → TypeScript consumer', () => {
  const cases = Object.entries(emitted());
  it.each(cases)('%s', (_name, c) => {
    const r = parseWire(c.type, c.json);
    expect(r.ok).toBe(c.expectOk);
    if (!c.expectOk && !r.ok) expect(r.error.code).toBe('INVALID_INPUT');
    if (c.text !== null && r.ok) expect((r.value as any).text).toBe(c.text);
  });
});

describe('TypeScript producer → Python consumer', () => {
  it('a backend Report built by acceptReport validates in Python', () => {
    const r = acceptReport(firstValid('ReportInput'), {
      reportId: 'rep-000001',
      receiveSequence: 1,
      receivedAt: '2026-10-25T16:00:00Z',
      provenance: 'live',
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(pythonValidates('Report', r.value)).toEqual({ ok: true, stderr: '' });
  });

  it('a JobInput built by buildJobInput validates in Python (what the Laya worker reads)', () => {
    const report = acceptReport(firstValid('ReportInput'), {
      reportId: 'rep-000001',
      receiveSequence: 1,
      receivedAt: '2026-10-25T16:00:00Z',
      provenance: 'live',
    });
    expect(report.ok).toBe(true);
    if (!report.ok) return;
    const job = buildJobInput({
      runId: 'run-001',
      jobId: 'job-0001',
      kind: 'LOCAL_SUGGESTION',
      targetReportId: 'rep-000001',
      incidentId: null,
      reports: [report.value],
      incidents: [],
      places: [],
    });
    expect(job.ok).toBe(true);
    if (job.ok) expect(pythonValidates('JobInput', job.value)).toEqual({ ok: true, stderr: '' });
  });

  it('Python rejects a TS payload that grew an extra field (the schema is closed on both sides)', () => {
    const payload = { ...firstValid('ReportInput'), receivedAt: '2026-10-25T16:00:00Z' };
    expect(pythonValidates('ReportInput', payload).ok).toBe(false);
  });
});
