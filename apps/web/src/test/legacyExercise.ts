// The original 12-report exercise, kept only as a unit-test fixture: it exercises the generic desk rules
// (correction, late older report, repeats, stale proposals). The app runs fixtures/replay/sunset-exercise.json.
import legacy from './r01-r12.fixture.json';
import { createReplayAdapter, type ReplayFixture } from '../adapters/replay/replayAdapter';

export const legacyFixture = legacy as ReplayFixture;
export const createLegacyReplay = () => createReplayAdapter(legacyFixture);
