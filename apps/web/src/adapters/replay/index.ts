// Replay adapter (in-browser): the adapter surface over the bundled Outer Sunset exercise.
// Every output is labeled `fixture` or `operator`; writes never reach live.
import exercise from '../../../../../fixtures/replay/sunset-exercise.json';
import { createReplayAdapter, type ReplayFixture } from './replayAdapter';

export { createReplayAdapter, type ReplayFixture };

import { DELIVERIES } from '../../network/mesh';

// Reports reach the desk in simulated delivery order (a packet on a longer route can arrive after a later one).
export const exerciseFixture = { ...exercise, script: DELIVERIES.map((d) => d.messageId) } as ReplayFixture;

export function createExerciseReplay() {
  return createReplayAdapter(exerciseFixture);
}
