// G0 TEST · report intake: exact originals, backend-assigned receive order, distinct
// times, duplicate identities, visible rejection (§9, §17, AGENTS hard rules).
import { describe, expect, it } from 'vitest';
import { MAX_REPORT_TEXT_BYTES, acceptReport, classifyIntake, parseWire, validateWire } from '../src/index.ts';
import { firstValid } from './helpers.ts';

const assigned = (seq: number, provenance = 'live') => ({
  reportId: `rep-${String(seq).padStart(6, '0')}`,
  receiveSequence: seq,
  receivedAt: '2026-10-25T16:40:00.000Z',
  provenance,
});

describe('acceptReport', () => {
  it('wraps the input unchanged and takes receive time and sequence only from the backend', () => {
    const input = firstValid('ReportInput');
    const r = acceptReport(input, assigned(7));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const report = r.value as any;
    expect(report.input).toEqual(input);
    expect(report.input.text).toBe(input.text);
    expect(report.receiveSequence).toBe(7);
    expect(report.receivedAt).toBe('2026-10-25T16:40:00.000Z');
    expect(report.receivedAt).not.toBe(input.sentAt);
    expect(validateWire('Report', report).ok).toBe(true);
  });

  it('keeps null sent and event times null (never filled from receive time)', () => {
    const input = { ...firstValid('ReportInput'), sentAt: null, reportedEventAt: null };
    const r = acceptReport(input, assigned(2));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect((r.value as any).input.sentAt).toBeNull();
    expect((r.value as any).input.reportedEventAt).toBeNull();
  });

  it('keeps the sender offset in timestamps instead of converting them', () => {
    const input = { ...firstValid('ReportInput'), sentAt: '2026-10-25T10:15:00-07:00' };
    const r = acceptReport(input, assigned(3));
    expect(r.ok && (r.value as any).input.sentAt).toBe('2026-10-25T10:15:00-07:00');
  });

  it('does not trim, case-fold, or Unicode-normalize text', () => {
    const text = '  Água SUBINDO\tno andar de cima 🙏\r\n';
    const r = acceptReport({ ...firstValid('ReportInput'), text }, assigned(4));
    expect(r.ok).toBe(true);
    if (r.ok) expect((r.value as any).input.text).toBe(text);
  });

  it('rejects an invalid input visibly and creates no report', () => {
    const input = firstValid('ReportInput');
    input.transport.verification = 'not_applicable'; // unverified radio
    const r = acceptReport(input, assigned(5));
    expect(r).toMatchObject({ ok: false, error: { code: 'INVALID_INPUT' } });
  });

  it('rejects text one byte over the bound and never truncates it', () => {
    expect(MAX_REPORT_TEXT_BYTES).toBeGreaterThan(0);
    const exact = 'a'.repeat(MAX_REPORT_TEXT_BYTES);
    expect(acceptReport({ ...firstValid('ReportInput'), text: exact }, assigned(6)).ok).toBe(true);
    const over = acceptReport({ ...firstValid('ReportInput'), text: exact + 'a' }, assigned(6));
    expect(over).toMatchObject({ ok: false, error: { code: 'INVALID_INPUT' } });
    if (!over.ok) expect(over.error.message).toMatch(/byte|limit|long/i);
  });

  it('counts the bound in UTF-8 bytes, not characters', () => {
    expect(MAX_REPORT_TEXT_BYTES).toBeGreaterThan(4);
    const emoji = '🙏'.repeat(Math.floor(MAX_REPORT_TEXT_BYTES / 4) + 1); // under in chars, over in bytes
    expect(emoji.length).toBeLessThan(MAX_REPORT_TEXT_BYTES);
    const r = acceptReport({ ...firstValid('ReportInput'), text: emoji }, assigned(6));
    expect(r).toMatchObject({ ok: false, error: { code: 'INVALID_INPUT' } });
  });
});

describe('classifyIntake: duplicate identities', () => {
  const input = firstValid('ReportInput');
  // A stored Report from the corpus (reportId rep-000001), so these tests don't depend on acceptReport.
  const stored = () => {
    const report = firstValid('Report');
    expect(report.input).toEqual(input);
    return report;
  };

  it('a first report is new', () => {
    expect(classifyIntake([], input)).toEqual({ ok: true, value: { kind: 'new' } });
  });

  it('a retransmission with the same run, source, and message ID is a duplicate of the stored report', () => {
    const r = classifyIntake([stored()], structuredClone(input));
    expect(r).toEqual({ ok: true, value: { kind: 'duplicate', reportId: 'rep-000001' } });
  });

  it('a raw-fallback retransmission keeps the message ID and is still a duplicate', () => {
    const raw = structuredClone(input);
    raw.transport.encoding = 'raw';
    raw.transport.applicationPacketBytes = 75;
    expect(classifyIntake([stored()], raw)).toEqual({ ok: true, value: { kind: 'duplicate', reportId: 'rep-000001' } });
  });

  it('the same identity with different text is a conflict, never an overwrite', () => {
    const changed = { ...structuredClone(input), text: input.text + ' Edited.' };
    expect(classifyIntake([stored()], changed)).toMatchObject({ ok: false, error: { code: 'INVALID_INPUT' } });
  });

  it('identical text under a different message ID is new evidence (no text dedup)', () => {
    const again = { ...structuredClone(input), messageId: 'msg-0002' };
    expect(classifyIntake([stored()], again)).toEqual({ ok: true, value: { kind: 'new' } });
  });

  it('the same IDs in another run are new', () => {
    const otherRun = { ...structuredClone(input), runId: 'run-002' };
    expect(classifyIntake([stored()], otherRun)).toEqual({ ok: true, value: { kind: 'new' } });
  });
});

describe('parseWire never throws on hostile text', () => {
  const cases: [string, string][] = [
    ['not JSON', '{"runId": '],
    ['Python NaN token', '{"label":"ACTIVE_NEED","value":NaN,"kind":"probability"}'],
    ['Python Infinity token', '{"label":"ACTIVE_NEED","value":Infinity,"kind":"score"}'],
    ['number overflowing to Infinity', '{"label":"ACTIVE_NEED","value":1e400,"kind":"score"}'],
    ['JSON array instead of object', '[]'],
    ['empty string', ''],
  ];
  it.each(cases)('%s → INVALID_INPUT', (_name, text) => {
    let r: ReturnType<typeof parseWire> | undefined;
    expect(() => (r = parseWire('LabelScore', text))).not.toThrow();
    expect(r).toMatchObject({ ok: false, error: { code: 'INVALID_INPUT' } });
  });

  it('decodes \\u escapes to the exact original text', () => {
    const input = { ...firstValid('ReportInput'), text: 'Água — 🙏' };
    const escaped = JSON.stringify(input).replace(/[\u007f-￿]/g, (c) => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0'));
    const r = parseWire('ReportInput', escaped);
    expect(r.ok && (r.value as any).text).toBe('Água — 🙏');
  });
});
