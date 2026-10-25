import { geographicToScene, sceneToGeographic, SUNSET } from './georeference';

describe('Outer Sunset local projection', () => {
  it.each([[0, 0], [80, 20], [-940, -400], [340, 540]])('round trips scene position %s,%s without recentering', (x, z) => {
    const geographic = sceneToGeographic(x, z);
    const actual = geographicToScene(geographic.latitude, geographic.longitude);
    expect(actual.x).toBeCloseTo(x, 6);
    expect(actual.z).toBeCloseTo(z, 6);
  });

  it('uses east-positive X and south-positive Z in metres', () => {
    const { lat, lon } = SUNSET.origin;
    expect(geographicToScene(lat + .001, lon).z).toBeCloseTo(-110.54, 2);
    expect(geographicToScene(lat, lon + .001).x).toBeGreaterThan(0);
    expect(geographicToScene(lat, lon, 12).y).toBe(12);
  });

  it('rejects invalid coordinates instead of inventing a map position', () => {
    for (const bad of [NaN, Infinity, -Infinity]) expect(() => geographicToScene(bad, -122.5)).toThrow(RangeError);
    expect(() => geographicToScene(40, -122.5)).toThrow(RangeError);
    expect(() => sceneToGeographic(NaN, 0)).toThrow(RangeError);
  });
});
