// G0 TEST · the §18 exercise as an authored fixture, its private expectations, and
// hidden future-data exclusion from every model-facing input.
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildJobInput, computeInputSignature, validateWire } from '../src/index.ts';
import {
  EXERCISE_PATH,
  EXPECTATIONS_PATH,
  REPO_ROOT,
  firstValid,
  groundTruthExercise,
  loadSchema,
  readJsonIfExists,
} from './helpers.ts';

const gt = groundTruthExercise();
const exercise = readJsonIfExists(EXERCISE_PATH);
const expectations = readJsonIfExists(EXPECTATIONS_PATH);
const rawExercise = () => {
  expect(exercise, 'authored exercise fixture is missing').not.toBeNull();
  return readFileSync(EXERCISE_PATH, 'utf8');
};
const ev = (id: string) => exercise?.events?.find((e: any) => e.input?.messageId === id);

describe('ground truth parse (sanity of this test, not of the fixture)', () => {
  it('finds R01–R12 in §18', () => {
    expect(gt.map((r) => r.id)).toEqual(Array.from({ length: 12 }, (_, i) => `R${String(i + 1).padStart(2, '0')}`));
  });
});

describe('exercise fixture (fixtures/private/exercise/exercise.json)', () => {
  it('exists', () => {
    expect(exercise, 'authored exercise fixture is missing').not.toBeNull();
  });

  it('delivers R01–R12 in order at positions 1–12', () => {
    expect(exercise?.events?.map((e: any) => e.input.messageId)).toEqual(gt.map((r) => r.id));
    expect(exercise?.events?.map((e: any) => e.position)).toEqual(Array.from({ length: 12 }, (_, i) => i + 1));
  });

  it.each(gt.map((r) => [r.id, r.text] as const))('%s text is exactly the §18 text', (id, text) => {
    expect(ev(id)?.input?.text).toBe(text);
  });

  it.each(gt.map((r) => [r.id] as const))('%s becomes a valid scenario ReportInput once given a run', (id) => {
    const input = ev(id)?.input;
    expect(input?.origin).toBe('scenario');
    expect(validateWire('ReportInput', { ...input, runId: 'run-001' }).ok).toBe(true);
  });

  it('R11 was sent before R07 but is received after it, and both times are kept', () => {
    const r07 = ev('R07');
    const r11 = ev('R11');
    expect(typeof r07?.input?.sentAt).toBe('string');
    expect(typeof r11?.input?.sentAt).toBe('string');
    expect(Date.parse(r11.input.sentAt)).toBeLessThan(Date.parse(r07.input.sentAt));
    expect(r11.position).toBeGreaterThan(r07.position);
  });

  it('R07 waits for the presenter and the school incident, never a timer', () => {
    expect(ev('R07')?.gate).toBe('SEND_NEXT_REPORT');
    expect(ev('R07')?.gateRequiresIncident).toBe('inc-school');
    const raw = rawExercise();
    expect(raw).not.toMatch(/"[^"]*(delay|timer|timeout|afterMs|afterSeconds|interval)[^"]*"\s*:/i);
  });

  it('only R01 is a radio candidate (the injector skips its copy in radio mode)', () => {
    const radio = exercise?.events?.filter((e: any) => e.radioCandidate === true).map((e: any) => e.input.messageId);
    expect(radio).toEqual(['R01']);
  });

  it('defines the three places at the §18 coordinates', () => {
    const places = Object.fromEntries((exercise?.places ?? []).map((p: any) => [p.placeId, p.position]));
    expect(places).toEqual({ school: { x: 0, z: 0 }, residence: { x: 80, z: 20 }, shelter: { x: -120, z: 40 } });
  });

  it('school gym and sports hall are one subarea; the main building is another subarea of the school', () => {
    const school = exercise?.places?.find((p: any) => p.placeId === 'school');
    const sub = (alias: string) => school?.subareas?.find((s: any) => s.aliases.includes(alias))?.subareaId;
    expect(sub('school gym')).toBeTruthy();
    expect(sub('school sports hall')).toBe(sub('school gym'));
    expect(sub('school main building')).toBeTruthy();
    expect(sub('school main building')).not.toBe(sub('school gym'));
  });

  it('every report carries explicit named-place metadata, never coordinates (§18: no geocoder)', () => {
    const expected: Record<string, string> = { R02: 'shelter', R04: 'shelter', R03: 'residence', R06: 'residence' };
    for (const r of gt) {
      const loc = ev(r.id)?.input?.reportedLocation;
      expect(loc?.source, r.id).toBe('sender_explicit');
      expect(['school', 'residence', 'shelter'], r.id).toContain(loc?.placeId);
      expect(loc?.placeId, r.id).toBe(expected[r.id] ?? 'school');
    }
  });

  it('the house beside the school is the separate residence place', () => {
    const residence = exercise?.places?.find((p: any) => p.placeId === 'residence');
    expect(residence?.aliases ?? []).toContain('house beside the school');
    const school = exercise?.places?.find((p: any) => p.placeId === 'school');
    const schoolAliases = [...(school?.aliases ?? []), ...(school?.subareas ?? []).flatMap((s: any) => s.aliases)];
    expect(schoolAliases).not.toContain('house beside the school');
  });

  it('starts after R06 with the authored, operator-reviewed incidents', () => {
    const s = exercise?.startingState;
    expect(s?.afterMessageId).toBe('R06');
    expect(s?.provenance).toBe('authored');
    const byId = Object.fromEntries((s?.incidents ?? []).map((i: any) => [i.incidentId, i]));
    expect(byId['inc-school']).toMatchObject({ placeId: 'school', status: 'OPEN', attention: 'INFORMATION', reportMessageIds: ['R01', 'R05'] });
    expect(byId['inc-shelter']).toMatchObject({ placeId: 'shelter', status: 'OPEN', attention: 'ACTIVE_NEED', reportMessageIds: ['R02', 'R04'] });
    expect(byId['inc-residence']).toMatchObject({ placeId: 'residence', status: 'OPEN', attention: 'POSSIBLE_LIFE_SAFETY', reportMessageIds: ['R03', 'R06'] });
    expect(Object.keys(byId).sort()).toEqual(['inc-residence', 'inc-school', 'inc-shelter']);
  });

  it('carries no expectations: no expected-label keys and none of the expectation text', () => {
    const raw = rawExercise();
    expect(raw).not.toMatch(/"[^"]*(expect|interpretation|desired|label)[^"]*"\s*:/i);
    for (const r of gt) expect(raw).not.toContain(r.expected);
  });
});

describe('private expectations (fixtures/private/exercise/expectations.json)', () => {
  it('exists and is marked private, never model input', () => {
    expect(expectations).not.toBeNull();
    expect(expectations?.private).toBe(true);
    expect(expectations?.neverModelInput).toBe(true);
  });

  it.each(gt.map((r) => [r.id, r.expected] as const))('%s expectation is the §18 authored text', (id, expected) => {
    expect(expectations?.interpretations?.[id]).toBe(expected);
  });

  it('after R07 is confirmed, school is possible life safety and leads by its earlier open cycle', () => {
    expect(expectations?.afterR07Confirmed).toEqual({
      attention: { 'inc-school': 'POSSIBLE_LIFE_SAFETY', 'inc-residence': 'POSSIBLE_LIFE_SAFETY', 'inc-shelter': 'ACTIVE_NEED' },
      confirmedQueue: ['inc-school', 'inc-residence', 'inc-shelter'],
    });
  });

  it('R11 must not override R07 and R12 must not resolve the school', () => {
    expect(expectations?.invariants).toEqual(
      expect.arrayContaining([
        { messageId: 'R11', mustNot: 'override R07 concern' },
        { messageId: 'R12', mustNot: 'resolve inc-school' },
        { messageId: 'R08', mustNot: 'raise severity or add headcount' },
        { messageId: 'R04', mustNot: 'create an incident or add heatmap weight' },
      ]),
    );
  });
});

// --- hidden future-data exclusion ---------------------------------------------------

function storedReport(seq: number, messageId: string, text: string, runId = 'run-001') {
  const input = { ...firstValid('ReportInput'), runId, sourceId: 'exercise', messageId, text, origin: 'scenario' };
  input.transport = {
    verification: 'not_applicable',
    encoding: 'not_applicable',
    measurementSource: 'not_applicable',
    originalBytes: null,
    applicationPacketBytes: null,
  };
  input.reportedLocation = null;
  return {
    reportId: `rep-${String(seq).padStart(6, '0')}`,
    receiveSequence: seq,
    receivedAt: `2026-10-25T16:${String(seq).padStart(2, '0')}:00Z`,
    provenance: 'simulated',
    input,
  };
}

describe('buildJobInput keeps future scenario truth out of model input', () => {
  const delivered = gt.slice(0, 7).map((r, i) => storedReport(i + 1, r.id, r.text));
  const future = gt.slice(7);
  const school = { ...firstValid('IncidentView'), revision: 2, confirmedReportIds: ['rep-000001', 'rep-000005'] };
  const args = () => ({
    runId: 'run-001',
    jobId: 'job-0007',
    kind: 'LOCAL_SUGGESTION',
    targetReportId: 'rep-000007',
    incidentId: null,
    reports: [...delivered].reverse(), // out of order on purpose
    incidents: [school],
    places: [{ placeId: 'school', aliases: ['school gym', 'school sports hall', 'school main building'] }],
    // What a careless caller might have in scope. None of it may reach the model.
    scenario: { script: future.map((r) => ({ messageId: r.id, text: r.text })), deliveredCount: 7 },
    expectations: Object.fromEntries(gt.map((r) => [r.id, r.expected])),
    desiredQueue: ['inc-school', 'inc-residence', 'inc-shelter'],
  });

  it('builds a valid JobInput', () => {
    const r = buildJobInput(args());
    expect(r.ok).toBe(true);
    if (r.ok) expect(validateWire('JobInput', r.value).ok).toBe(true);
  });

  it('contains no undelivered report text, no expectation text, and no expectation keys', () => {
    const r = buildJobInput(args());
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const json = JSON.stringify(r.value);
    for (const f of future) expect(json).not.toContain(f.text);
    for (const g of gt) expect(json).not.toContain(g.expected);
    expect(json).not.toMatch(/"[^"]*(expect|desired|script|future|heldout)[^"]*"\s*:/i);
  });

  it('orders reports by receive sequence and signs exactly what it includes', () => {
    const r = buildJobInput(args());
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const v = r.value as any;
    expect(v.reports.map((x: any) => x.receiveSequence)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(v.reports.map((x: any) => x.text)).toEqual(gt.slice(0, 7).map((g) => g.text));
    expect(v.inputSignature).toBe(
      computeInputSignature({
        runId: 'run-001',
        orderedReportIds: v.reports.map((x: any) => x.reportId),
        incidentRevisions: { 'inc-school': 2 },
      }),
    );
  });

  it('rejects an undelivered scenario event passed as a report', () => {
    const a = args();
    a.reports = [...a.reports, { input: { messageId: 'R08', text: future[0]!.text } } as any];
    expect(buildJobInput(a)).toMatchObject({ ok: false, error: { code: 'INVALID_INPUT' } });
  });

  it('rejects a report from another run with INVALID_SOURCE', () => {
    const a = args();
    a.reports = [...a.reports, storedReport(8, 'X01', 'other run', 'run-000')];
    expect(buildJobInput(a)).toMatchObject({ ok: false, error: { code: 'INVALID_SOURCE' } });
  });

  it('rejects a local-suggestion job whose target report is not included', () => {
    expect(buildJobInput({ ...args(), targetReportId: 'rep-000099' })).toMatchObject({ ok: false, error: { code: 'INVALID_INPUT' } });
  });
});

describe('client- and model-visible schemas have no place for future truth', () => {
  const schema = loadSchema();
  const FORBIDDEN = /expect|heldout|future|script|desired|truth|nextText|nextMessage/i;
  const keysOf = (node: any, out: string[] = []): string[] => {
    if (node && typeof node === 'object') {
      for (const [k, v] of Object.entries(node)) {
        if (k === 'properties' && v && typeof v === 'object') out.push(...Object.keys(v));
        keysOf(v, out);
      }
    }
    return out;
  };
  it.each(['JobInput', 'ScenarioState', 'IncidentView', 'Report', 'ReportInput', 'LocalSuggestion', 'IncidentProposal'])(
    '%s defines properties and none of them can carry future truth',
    (name) => {
      const keys = keysOf(schema.$defs[name]);
      expect(keys.length, `${name} is still a placeholder`).toBeGreaterThan(0);
      expect(keys.filter((k) => FORBIDDEN.test(k))).toEqual([]);
    },
  );
});

describe('no model-facing or client code reads private fixtures', () => {
  const SCAN = ['packages/domain/src', 'apps/coordinator', 'services/local-laya', 'apps/web/src'];
  const files = (dir: string): string[] => {
    const abs = join(REPO_ROOT, dir);
    if (!existsSync(abs)) return [];
    return readdirSync(abs).flatMap((name) => {
      if (name === 'node_modules' || name.startsWith('.')) return [];
      const p = join(abs, name);
      return statSync(p).isDirectory() ? files(relative(REPO_ROOT, p)) : [relative(REPO_ROOT, p)];
    });
  };
  const sources = SCAN.flatMap(files).filter((f) => /\.(ts|tsx|js|mjs|cjs|py|json)$/.test(f));

  it('scans at least the domain sources', () => {
    expect(sources.some((f) => f.startsWith('packages/domain/src/'))).toBe(true);
  });
  it('no file references fixtures/private', () => {
    const hits = sources.filter((f) => /fixtures[\\/]+private/.test(readFileSync(join(REPO_ROOT, f), 'utf8')));
    expect(hits).toEqual([]);
  });
  it('outside evaluation code, no file references the held-out set', () => {
    const hits = sources
      .filter((f) => !/eval/i.test(f))
      .filter((f) => /heldout/i.test(readFileSync(join(REPO_ROOT, f), 'utf8')));
    expect(hits).toEqual([]);
  });
});
