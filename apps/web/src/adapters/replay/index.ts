// Replay adapter (in-browser): the adapter surface over the bundled Outer Sunset exercise.
// Every output is labeled `fixture` or `operator`; writes never reach live.
import exercise from '../../../../../fixtures/replay/sunset-exercise.json';
import { createReplayAdapter, type ReplayFixture } from './replayAdapter';

export { createReplayAdapter, type ReplayFixture };

export const exerciseFixture = exercise as ReplayFixture;

export function createExerciseReplay() {
  return createReplayAdapter(exerciseFixture);
}
