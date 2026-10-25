import metadata from './scene-meta.json';

export const SCENE_METADATA = metadata;
const projection = metadata.projection;
const radians = Math.PI / 180;

function finite(...values: number[]) {
  if (!values.every(Number.isFinite)) throw new RangeError('Coordinates must be finite');
}

/** BLOSM spherical transverse Mercator, then glTF Z-up to Y-up conversion.
 * Blender (east, north, altitude) exports to Three (east, altitude, south).
 * The model and markers MUST share this origin; never recenter the GLB alone.
 */
export function geographicToScene(latitude: number, longitude: number, elevation = projection.verticalOriginMeters) {
  finite(latitude, longitude, elevation);
  if (latitude <= -90 || latitude >= 90 || longitude < -180 || longitude > 180
    || Math.abs(longitude - projection.originLongitude) >= 90) throw new RangeError('Coordinates outside local projection');
  const lat = latitude * radians;
  const deltaLon = (longitude - projection.originLongitude) * radians;
  const b = Math.sin(deltaLon) * Math.cos(lat);
  const factor = projection.radiusMeters * projection.scaleFactor;
  return {
    x: factor * Math.atanh(b),
    y: elevation - projection.verticalOriginMeters,
    z: -factor * (Math.atan(Math.tan(lat) / Math.cos(deltaLon)) - projection.originLatitude * radians),
  };
}

export function sceneToGeographic(x: number, z: number, y = 0) {
  finite(x, z, y);
  const factor = projection.radiusMeters * projection.scaleFactor;
  const east = x / factor;
  const north = -z / factor + projection.originLatitude * radians;
  return {
    latitude: Math.asin(Math.sin(north) / Math.cosh(east)) / radians,
    longitude: projection.originLongitude + Math.atan(Math.sinh(east) / Math.cos(north)) / radians,
    elevation: y + projection.verticalOriginMeters,
  };
}
