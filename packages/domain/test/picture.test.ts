// Claude working picture: a draft may cite only reports its job delivered, must keep counts and
// locations from those reports, and gets late flags from sent time vs receive order (R11 vs R07).
import { describe, expect, it } from 'vitest';
import { buildJobInput, checkPicture, type IncidentPictureDraft, type Report } from '../src/index.ts';

const RUN = 'live-1';
const rep = (seq: number, messageId: string, text: string, sentAt: string | null, placeId: string | null = 'school'): Report => ({
  reportId: `${RUN}:r${seq}`,
  receiveSequence: seq,
  receivedAt: '2026-10-25T10:00:00Z',
  provenance: 'simulated',
  input: {
    runId: RUN, sourceId: 'src', messageId, text, origin: 'scenario', sentAt, reportedEventAt: null,
    reportedLocation: placeId ? { placeId, source: 'sender_explicit' } : null,
    transport: { verification: 'not_applicable', encoding: 'not_applicable', measurementSource: 'not_applicable', originalBytes: null, applicationPacketBytes: null },
  },
});
const reports = [
  rep(1, 'R01', 'School gym evacuation complete. Everyone our team checked is outside.', '2026-09-27T14:02:00Z'),
  rep(2, 'R07', 'Correction: the school gym is clear, but someone may still be upstairs in the main building.', '2026-09-27T14:31:00Z'),
  rep(3, 'R11', 'Earlier school gym report: all people our team checked were outside.', '2026-09-27T14:03:00Z'),
];
const input = buildJobInput({
  runId: RUN, jobId: 'job-1', kind: 'INCIDENT_PROPOSAL', targetReportId: null, incidentId: 'inc-school',
  reports, incidents: [], places: [{ placeId: 'school', aliases: ['school gym'] }],
});
if (!input.ok) throw new Error(input.error.message);
const job = input.value;
const node = (label: string, ids: string[], extra: object = {}) => ({
  label, severity: null, chronology: [], uncertainties: [], conflicts: [], reportIds: ids, ...extra,
});
const draft = (subareas: object[]): IncidentPictureDraft => ({
  runId: RUN, incidentId: 'inc-school', model: 'claude-test',
  areas: [node('Waterfront', [`${RUN}:r1`, `${RUN}:r2`, `${RUN}:r3`], { sites: [{ ...node('school', [`${RUN}:r1`, `${RUN}:r2`, `${RUN}:r3`]), siteKind: 'school', subareas }] })],
}) as IncidentPictureDraft;

describe('checkPicture', () => {
  it('flags the late R11 by sent time and keeps the cited reports in receive order', () => {
    const gym = node('gym', [`${RUN}:r1`, `${RUN}:r2`, `${RUN}:r3`], { severity: 'INFORMATION', claims: [{ text: 'Gym is clear.', reportIds: [`${RUN}:r2`] }] });
    const r = checkPicture(draft([gym]), job);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const chron = r.value.areas[0].sites[0].subareas[0].chronology;
    expect(chron.map((e) => [e.reportId, e.late])).toEqual([[`${RUN}:r1`, false], [`${RUN}:r2`, false], [`${RUN}:r3`, true]]);
  });

  it('rejects a report the job did not deliver', () => {
    const main = node('main building', [`${RUN}:r9`], { severity: 'POSSIBLE_LIFE_SAFETY', claims: [{ text: 'Someone upstairs.', reportIds: [`${RUN}:r9`] }] });
    const r = checkPicture(draft([main]), job);
    expect(r.ok).toBe(false);
  });

  it('rejects an invented count and an invented location', () => {
    const count = node('main building', [`${RUN}:r2`], { claims: [{ text: '3 people upstairs.', reportIds: [`${RUN}:r2`] }] });
    expect(checkPicture(draft([count]), job).ok).toBe(false);
    const place = node('basement', [`${RUN}:r2`], { claims: [{ text: 'Someone upstairs.', reportIds: [`${RUN}:r2`] }] });
    expect(checkPicture(draft([place]), job).ok).toBe(false);
  });
});
