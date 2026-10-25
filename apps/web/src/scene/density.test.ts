import { densityAt, placePosition } from './model';
import { incident } from './fixtures.test-support';

const school = { x: 0, z: 0 };

describe('exercise placement', () => {
  it.each([
    ['school', { x: 0, z: 0 }],
    ['house-43-lawton', { x: -32.6, z: 127.2 }],
    ['south-shelter', { x: -262.7, z: 295.8 }],
  ])('maps %s to the exact ground-plane position', (place, point) => {
    expect(placePosition(place)).toEqual(point);
  });

  it('keeps null and unknown places unplaced instead of at the origin', () => {
    expect(placePosition(null)).toBeNull();
    expect(placePosition('not-a-place')).toBeNull();
  });
});

describe('confirmed unresolved incident density (§7)', () => {
  it('contributes one unit at the center of one open located incident', () => {
    expect(densityAt(school, [incident()])).toBe(1);
  });

  it('counts separate incidents at one place equally and additively', () => {
    expect(densityAt(school, [incident(), incident({ incidentId: 'other' })])).toBe(2);
  });

  it('does not amplify height when repeated reports are linked', () => {
    const single = densityAt(school, [incident()]);
    expect(single).toBe(1);
    expect(densityAt(school, [incident({ confirmedReportIds: ['r1', 'r2', 'r3', 'r4'] })])).toBe(single);
  });

  it('counts an incident ID once even when the rendering input repeats it', () => {
    const row = incident();
    expect(densityAt(school, [row, row])).toBe(1);
  });

  it('excludes resolved, null-location, and unknown-location incidents', () => {
    const excluded = [
      incident({ incidentId: 'resolved', status: 'RESOLVED' }),
      incident({ incidentId: 'null', confirmedPlaceId: null }),
      incident({ incidentId: 'unknown', confirmedPlaceId: 'unknown' }),
    ];
    expect(densityAt(school, excluded)).toBe(0);
    expect(densityAt(school, [...excluded, incident()])).toBe(1);
  });

  it('removes resolved density and restores it when the incident reopens', () => {
    expect(densityAt(school, [incident()])).toBe(1);
    expect(densityAt(school, [incident({ status: 'RESOLVED' })])).toBe(0);
    expect(densityAt(school, [incident({ status: 'OPEN' })])).toBe(1);
  });

  it.each(['POSSIBLE_LIFE_SAFETY', 'ACTIVE_NEED', 'INFORMATION', null] as const)(
    'uses equal weight for attention %s, including unknown attention', (attention) => {
      expect(densityAt(school, [incident({ attention })])).toBe(1);
    },
  );

  it('keeps spatial influence and scale fixed as the run gains unrelated incidents', () => {
    const offCenter = { x: 5, z: 0 };
    const value = densityAt(offCenter, [incident()]);
    expect(value).toBeGreaterThan(0);
    expect(value).toBeLessThan(1);
    const farAway = incident({ incidentId: 'far', confirmedPlaceId: 'south-shelter' });
    // Shelter must not affect the school center: prevents dataset-wide normalization.
    expect(densityAt(school, [incident(), farAway])).toBe(1);
    expect(densityAt(offCenter, [incident(), farAway])).toBeCloseTo(value);
    expect(densityAt({ x: 10000, z: 10000 }, [incident()])).toBe(0);
  });

  it('never mutates the confirmed rendering input', () => {
    const row = Object.freeze(incident({ confirmedReportIds: Object.freeze(['report-1']) }));
    const rows = Object.freeze([row]);
    densityAt(school, rows);
    expect(rows).toEqual([incident()]);
  });
});
