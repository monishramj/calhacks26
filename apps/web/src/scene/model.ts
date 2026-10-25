// Lane-local rendering input, not a public wire contract. Replace with a Pick
// of packages/domain IncidentView after G0. Only confirmed state enters here.
export type SceneIncident = {
  incidentId: string;
  status: 'OPEN' | 'RESOLVED';
  attention: 'POSSIBLE_LIFE_SAFETY' | 'ACTIVE_NEED' | 'INFORMATION' | null;
  confirmedPlaceId: string | null;
  confirmedReportIds: readonly string[];
};

export type SceneDataProps = {
  incidents?: readonly SceneIncident[];
  sourceProvenance?: 'fixture' | 'recording' | 'live' | 'none';
};

export type GroundPoint = { x: number; z: number };

export const PLACES = [
  { id: 'school', name: 'School', x: 0, z: 0 },
  { id: 'residence', name: 'Residence', x: 80, z: 20 },
  { id: 'shelter', name: 'Shelter', x: -120, z: 40 },
] as const;
// Fixed display settings in arbitrary exercise units, never dataset-normalized.
export const HEATMAP_RADIUS = 45;
export const HEATMAP_HEIGHT_SCALE = 14;
export const HEATMAP_BASE = 24;

export function placePosition(placeId: string | null): GroundPoint | null {
  const place = PLACES.find((candidate) => candidate.id === placeId);
  return place ? { x: place.x, z: place.z } : null;
}

export function densityAt(
  point: GroundPoint,
  incidents: readonly SceneIncident[],
): number {
  let density = 0;
  const seen = new Set<string>();
  for (const incident of incidents) {
    if (seen.has(incident.incidentId)) continue;
    seen.add(incident.incidentId);
    const place = placePosition(incident.confirmedPlaceId);
    if (incident.status !== 'OPEN' || !place) continue;
    const distance = Math.hypot(point.x - place.x, point.z - place.z);
    if (distance < HEATMAP_RADIUS) density += (1 + Math.cos(Math.PI * distance / HEATMAP_RADIUS)) / 2;
  }
  return density;
}

export function attentionLabel(attention: SceneIncident['attention']): string {
  return attention === null ? 'Unknown attention' : attention.replaceAll('_', ' ').toLowerCase();
}

export function attentionColor(attention: SceneIncident['attention']): string {
  return attention === 'POSSIBLE_LIFE_SAFETY' ? '#fb987c'
    : attention === 'ACTIVE_NEED' ? '#f2d184'
      : attention === 'INFORMATION' ? '#8ecbd1' : '#c5bedf';
}
