import { SCENE_METADATA } from './georeference';
import type { IncidentView, ReportProvenance } from '../../../../packages/domain/src/types';

// A read-only rendering projection of frozen contract v1, not another schema.
export type SceneIncident = Readonly<Pick<IncidentView,
  'incidentId' | 'status' | 'attention' | 'confirmedPlaceId'>> & {
  readonly confirmedReportIds: Readonly<IncidentView['confirmedReportIds']>;
};

export type SceneDataProps = {
  incidents?: readonly SceneIncident[];
  sourceProvenance?: ReportProvenance | 'recording' | 'none';
};

// Contract v1 puts provenance on individual reports, not the desk snapshot.
// Keep all source kinds visible when a snapshot contains mixed evidence.
export function reportSourceLabel(reports: readonly { provenance: string }[]): string {
  const sources = [...new Set(reports.map((report) => report.provenance))].sort();
  return sources.length ? sources.join(' + ') : 'none';
}

export type GroundPoint = { x: number; z: number };

export const PLACES = [
  { id: 'school', name: 'School', x: 0, z: 0 },
  { id: 'residence', name: 'Residence', x: 80, z: 20 },
  { id: 'shelter', name: 'Shelter', x: -120, z: 40 },
] as const;
// Fixed display settings in arbitrary exercise units, never dataset-normalized.
export const HEATMAP_RADIUS = 45;
export const HEATMAP_HEIGHT_SCALE = 14;
export const HEATMAP_BASE = SCENE_METADATA.terrainMaxY + 24;

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
