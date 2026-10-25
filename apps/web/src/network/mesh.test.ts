import { DELIVERIES, positionAt, routeAt, SCENARIO, statsAt } from './mesh';

describe('simulated Outer Sunset mesh', () => {
  it('interpolates team tracks and clamps at both ends', () => {
    const track = [[0, 0, 0], [10, 100, 0], [20, 100, 50]];
    expect(positionAt(track, -5)).toEqual({ x: 0, z: 0 });
    expect(positionAt(track, 5)).toEqual({ x: 50, z: 0 });
    expect(positionAt(track, 15)).toEqual({ x: 100, z: 25 });
    expect(positionAt(track, 99)).toEqual({ x: 100, z: 50 });
  });

  it('delivers every report within the exercise, some over several hops', () => {
    expect(DELIVERIES).toHaveLength(SCENARIO.script.length);
    for (const d of DELIVERIES) {
      expect(d.deliveredAt).toBeLessThan(SCENARIO.durationSeconds + 60);
      expect(d.hops.at(-1)!.to).toBe('command');
      expect(d.hops.length).toBeLessThanOrEqual(4);
    }
    expect(DELIVERIES.some((d) => d.hops.length >= 2)).toBe(true);
  });

  it('routes only over links within range', () => {
    const path = routeAt(SCENARIO.script.length ? SCENARIO.reports[SCENARIO.script[0]].sourceId : '', 60)!;
    for (let i = 1; i < path.length; i++) expect(Math.hypot(path[i].x - path[i - 1].x, path[i].z - path[i - 1].z)).toBeLessThanOrEqual(350);
  });

  it('codec packets use less airtime than the same reports as raw text', () => {
    const s = statsAt(Infinity);
    expect(s.delivered).toBe(SCENARIO.script.length);
    expect(s.bytes).toBeLessThan(s.rawBytes / 2);
    expect(s.airS).toBeLessThan(s.rawAirS);
  });
});
