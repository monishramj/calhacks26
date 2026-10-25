import { useMemo, useState } from 'react';
import { DeskProvider, useDesk } from './adapters/DeskContext';
import { createExerciseReplay, exerciseFixture } from './adapters/replay';
import { createLiveAdapter } from './adapters/live/liveAdapter';
import { ModeBanner } from './layout/ModeBanner';
import { ScenarioControls } from './layout/ScenarioControls';
import { Section } from './layout/Section';
import { Scene } from './scene';
import { ConfirmedQueue, IncidentHistory, IncomingFeed, ReviewBand } from './panels';
import type { DeskAdapter, DeskState } from './adapters/contract';
import { inferenceLabel, sourceLabel } from './adapters/derived';

// `vite --mode replay` (npm run dev:replay) runs the isolated browser replay.
// `vite --mode live` (npm run dev:live) connects to SpacetimeDB; settings come from VITE_STDB_* (see scripts/stdb-setup.sh).
function createAdapter(): DeskAdapter | null {
  if (import.meta.env.MODE === 'replay') return createExerciseReplay();
  const e = import.meta.env;
  if (e.MODE !== 'live' || !e.VITE_STDB_URI || !e.VITE_STDB_DATABASE) return null;
  return createLiveAdapter(exerciseFixture, {
    uri: e.VITE_STDB_URI,
    database: e.VITE_STDB_DATABASE,
    token: e.VITE_STDB_TOKEN,
    simToken: e.VITE_STDB_SIM_TOKEN,
  });
}

export function App({ adapter }: { adapter?: DeskAdapter | null }) {
  const resolved = useMemo(() => (adapter === undefined ? createAdapter() : adapter), [adapter]);
  return (
    <DeskProvider adapter={resolved}>
      <Desk />
    </DeskProvider>
  );
}

// Replay never runs a model: say so up front instead of waiting for the first fixture output.
function inferenceText(state: DeskState): string {
  return state.mode === 'LOCAL REPLAY' ? 'fixture · authored outputs, no model ran' : inferenceLabel(state);
}

function Desk() {
  const { state } = useDesk();
  // Selection is the only UI state shared between the scene and the panels.
  const [selectedIncidentId, setSelectedIncidentId] = useState<string | null>(null);
  const selection = { selectedIncidentId, onSelectIncident: setSelectedIncidentId };

  return (
    <div className="app">
      <ModeBanner
        mode={state?.mode ?? 'NOT CONNECTED'}
        sourceProvenance={state ? sourceLabel(state) : 'none'}
        inferenceProvenance={state ? inferenceText(state) : 'none'}
      >
        <ScenarioControls />
      </ModeBanner>
      <main className="workspace">
        <section className="scene-pane" aria-label="Exercise scene">
          <Scene {...selection} />
        </section>
        <aside className="side-pane" aria-label="Reports and incidents">
          <Section id="review" title="Review band" pinned>
            <ReviewBand {...selection} />
          </Section>
          <Section id="queue" title="Confirmed queue">
            <ConfirmedQueue {...selection} />
          </Section>
          <Section id="incoming" title="Incoming reports">
            <IncomingFeed {...selection} />
          </Section>
          <Section id="history" title="Selected incident history">
            <IncidentHistory {...selection} />
          </Section>
        </aside>
      </main>
    </div>
  );
}
