import { SUNSET } from './georeference';
import type { IncidentView } from '../../../../packages/domain/src/types';

// A read-only rendering projection of frozen contract v1, not another schema.
export type SceneIncident = Readonly<Pick<IncidentView,
  'incidentId' | 'status' | 'attention' | 'confirmedPlaceId'>> & {
  readonly confirmedReportIds: Readonly<IncidentView['confirmedReportIds']>;
};

export type SceneDataProps = {
  incidents?: readonly SceneIncident[];
};

export type GroundPoint = { x: number; z: number };

const { school, residence, shelter } = SUNSET.sites;
// §18 positions in scene metres; tools/build_sunset.py puts the map's school building at the origin and real
// buildings under the other two. Synthetic exercise sites with generic labels only.
export const PLACES = [
  { id: 'school', name: 'School', x: school.x, z: school.z },
  { id: 'residence', name: 'Residence', x: residence.x, z: residence.z },
  { id: 'shelter', name: 'Shelter', x: shelter.x, z: shelter.z },
] as const;
// Fixed display settings in metres, never dataset-normalized.
export const HEATMAP_RADIUS = 60;
export const HEATMAP_HEIGHT_SCALE = 30;

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
