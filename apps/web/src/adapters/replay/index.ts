// Replay adapter (in-browser, G8): the §17 adapter surface over the bundled §18 fixture.
// Every output is labeled `fixture` or `operator`; writes never reach live.
import exercise from '../../../../../fixtures/replay/exercise-r01-r12.json';
import { createReplayAdapter, type ReplayFixture } from './replayAdapter';

export { createReplayAdapter, type ReplayFixture };

export const exerciseFixture = exercise as ReplayFixture;

export function createExerciseReplay() {
  return createReplayAdapter(exerciseFixture);
}
