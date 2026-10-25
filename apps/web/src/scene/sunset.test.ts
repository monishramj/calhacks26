/// <reference types="node" />
import { statSync } from 'node:fs';
import { resolve } from 'node:path';
import { SUNSET } from './georeference';
import { PLACES } from './model';

describe('bundled Outer Sunset map data', () => {
  it('stays small and keeps the OSM attribution', () => {
    expect(statSync(resolve('src/scene/sunset.json')).size).toBeLessThan(500_000);
    expect(SUNSET.attribution).toMatch(/OpenStreetMap contributors.*ODbL/);
    expect(SUNSET.buildings.length).toBeGreaterThan(1000);
  });

  it('puts each exercise site on one real building at the spec position', () => {
    expect(PLACES.map(({ id, x, z }) => [id, x, z])).toEqual([['school', 0, 0], ['residence', 80, 20], ['shelter', -120, 40]]);
    for (const place of PLACES) {
      const site = SUNSET.buildings.filter((b) => b.site === place.id);
      expect(site).toHaveLength(1);
      const xs = site[0].p.filter((_, i) => i % 2 === 0), zs = site[0].p.filter((_, i) => i % 2 === 1);
      const [cx, cz] = [xs.reduce((a, b) => a + b) / xs.length, zs.reduce((a, b) => a + b) / zs.length];
      expect(Math.hypot(cx - place.x, cz - place.z)).toBeLessThan(25);
    }
  });
});
