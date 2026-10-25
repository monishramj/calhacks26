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

// TEST-phase seams intentionally return empty behavior, so failures concern
// requirements rather than absent imports or a broken test environment.
export function placePosition(_placeId: string | null): GroundPoint | null {
  return null;
}

export function densityAt(
  _point: GroundPoint,
  _incidents: readonly SceneIncident[],
): number {
  return 0;
}
