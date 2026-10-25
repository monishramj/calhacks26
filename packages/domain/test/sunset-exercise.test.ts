// The Outer Sunset demo exercise (fixtures/private/exercise), built by scripts/build_scenario.py.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { validateWire } from '../src/index.ts';
import { REPO_ROOT, SUNSET_EXERCISE_PATH, SUNSET_EXPECTATIONS_PATH, readJsonIfExists } from './helpers.ts';

const exercise = readJsonIfExists(SUNSET_EXERCISE_PATH);
const expectations = readJsonIfExists(SUNSET_EXPECTATIONS_PATH);
const replay = JSON.parse(readFileSync(join(REPO_ROOT, 'fixtures', 'replay', 'sunset-exercise.json'), 'utf8'));
const events: any[] = exercise.events;
const byId = Object.fromEntries(events.map((e) => [e.input.messageId, e.input]));

describe('Outer Sunset exercise', () => {
  it('has many reports with unique IDs, each a valid scenario ReportInput', () => {
    expect(events.length).toBeGreaterThanOrEqual(40);
    expect(new Set(Object.keys(byId)).size).toBe(events.length);
    for (const e of events) expect(validateWire('ReportInput', { ...e.input, runId: 'run-001' }).ok).toBe(true);
  });

  it('only states places that exist, and keeps unknown locations unplaced', () => {
    const places = new Set(exercise.places.map((p: any) => p.placeId));
    for (const e of events) if (e.input.reportedLocation) expect(places.has(e.input.reportedLocation.placeId)).toBe(true);
    for (const id of expectations.invariants.unplaced) expect(byId[id].reportedLocation).toBeNull();
  });

  it('delivers the late older report after the newer concern, keeping its earlier sent time', () => {
    const { report, newerConcern } = expectations.invariants.lateOlderReport;
    const order = events.map((e) => e.input.messageId);
    expect(order.indexOf(report)).toBeGreaterThan(order.indexOf(newerConcern));
    expect(byId[report].sentAt < byId[newerConcern].sentAt).toBe(true);
  });

  it('labels every report, and relations only point at earlier reports of the same incident', () => {
    const order = events.map((e) => e.input.messageId);
    for (const id of order) {
      const label = expectations.labels[id];
      expect(label).toBeDefined();
      if (label.relation) {
        expect(order.indexOf(label.relation.target)).toBeLessThan(order.indexOf(id));
        expect(expectations.labels[label.relation.target].incidentId).toBe(label.incidentId);
      }
    }
  });

  it('replay fixture matches the exercise and gives every report a team track', () => {
    expect(replay.script).toEqual(events.map((e) => e.input.messageId));
    const teams = new Set(replay.teams.map((t: any) => t.teamId));
    for (const id of replay.script) {
      expect(replay.reports[id].text).toBe(byId[id].text);
      expect(teams.has(replay.reports[id].sourceId)).toBe(true);
      expect(replay.reports[id].packetBytes).toBeLessThan(replay.reports[id].rawBytes);
    }
  });
});
