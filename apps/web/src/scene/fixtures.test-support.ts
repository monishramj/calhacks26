import type { SceneIncident } from './model';

// Authored scene-only fixtures; never model inputs or hidden exercise truth.
export function incident(overrides: Partial<SceneIncident> = {}): SceneIncident {
  return {
    incidentId: 'school-incident',
    status: 'OPEN',
    attention: 'INFORMATION',
    confirmedPlaceId: 'school',
    confirmedReportIds: ['report-1'],
    ...overrides,
  };
}

export const sceneIncidents: readonly SceneIncident[] = [
  incident(),
  incident({ incidentId: 'residence-incident', confirmedPlaceId: 'residence', attention: 'POSSIBLE_LIFE_SAFETY' }),
  incident({ incidentId: 'shelter-incident', confirmedPlaceId: 'shelter', attention: 'ACTIVE_NEED' }),
  incident({ incidentId: 'unplaced-incident', confirmedPlaceId: null, attention: null }),
];
