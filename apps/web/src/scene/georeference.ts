import sunset from './sunset.json';

/** Bundled Outer Sunset map data, built by tools/build_sunset.py from OpenStreetMap (ODbL). */
export const SUNSET = sunset;
const { lat: LAT0, lon: LON0 } = sunset.origin;
// Local equirectangular metres around the origin; the same constants as tools/build_sunset.py.
const EAST = Math.cos(LAT0 * Math.PI / 180) * 111320;
const NORTH = 110540;

function finite(...values: number[]) {
  if (!values.every(Number.isFinite)) throw new RangeError('Coordinates must be finite');
}

/** Three.js axes: x east, y up, z south, in metres. */
export function geographicToScene(latitude: number, longitude: number, elevation = 0) {
  finite(latitude, longitude, elevation);
  if (Math.abs(latitude - LAT0) > 1 || Math.abs(longitude - LON0) > 1) throw new RangeError('Coordinates outside local projection');
  return { x: (longitude - LON0) * EAST, y: elevation, z: -(latitude - LAT0) * NORTH };
}

export function sceneToGeographic(x: number, z: number, y = 0) {
  finite(x, z, y);
  return { latitude: LAT0 - z / NORTH, longitude: LON0 + x / EAST, elevation: y };
}
