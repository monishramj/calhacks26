// Replay adapter (in-browser): the adapter surface over the bundled Outer Sunset exercise.
// Every output is labeled `fixture` or `operator`; writes never reach live.
import exercise from '../../../../../fixtures/replay/sunset-exercise.json';
import run from '../../../../../fixtures/replay/claude-run.json';
import { createReplayAdapter, type ReplayFixture } from './replayAdapter';
import { createRecordingAdapter, type Recording } from './recordingAdapter';

export { createReplayAdapter, type ReplayFixture };

import { DELIVERIES } from '../../network/mesh';

// Reports reach the desk in simulated delivery order (a packet on a longer route can arrive after a later one).
export const exerciseFixture = { ...exercise, script: DELIVERIES.map((d) => d.messageId) } as ReplayFixture;

/** True when a full recorded live run of this exercise version is bundled. */
export const hasRecording = run.exerciseVersion === exercise.exerciseVersion && run.steps.length === exerciseFixture.script.length;

export function createExerciseReplay() {
  return hasRecording ? createRecordingAdapter(run as Recording) : createReplayAdapter(exerciseFixture);
}
