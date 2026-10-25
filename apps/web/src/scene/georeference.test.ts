import { geographicToScene, SCENE_METADATA, sceneToGeographic } from './georeference';

describe('BLOSM / glTF geographic alignment', () => {
  it.each(SCENE_METADATA.goldenCoordinates)('matches BLOSM Python projection at $latitude,$longitude', (point) => {
    const actual = geographicToScene(point.latitude, point.longitude);
    expect(actual.x).toBeCloseTo(point.x, 5);
    expect(actual.z).toBeCloseTo(point.z, 5);
  });

  it.each([[0, 0], [80, 20], [-120, 40], [-350, -250], [350, 250]])('round trips scene position %s,%s without recentering', (x, z) => {
    const geographic = sceneToGeographic(x, z);
    const actual = geographicToScene(geographic.latitude, geographic.longitude);
    expect(actual.x).toBeCloseTo(x, 5);
    expect(actual.z).toBeCloseTo(z, 5);
  });

  it('uses east-positive X, south-positive Z and meter-based vertical origin', () => {
    const origin = SCENE_METADATA.projection;
    expect(geographicToScene(origin.originLatitude + .001, origin.originLongitude).z).toBeLessThan(0);
    expect(geographicToScene(origin.originLatitude, origin.originLongitude + .001).x).toBeGreaterThan(0);
    expect(geographicToScene(origin.originLatitude, origin.originLongitude, origin.verticalOriginMeters + 12).y).toBe(12);
  });

  it('rejects invalid coordinates instead of inventing a map position', () => {
    for (const bad of [NaN, Infinity, -Infinity]) expect(() => geographicToScene(bad, -122.4)).toThrow(RangeError);
    expect(() => geographicToScene(91, -122.4)).toThrow(RangeError);
    expect(() => geographicToScene(37.8, 200)).toThrow(RangeError);
    expect(() => sceneToGeographic(NaN, 0)).toThrow(RangeError);
  });
});
