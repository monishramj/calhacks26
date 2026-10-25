import { useMemo, useState } from 'react';
import { DeskProvider, useDesk } from './adapters/DeskContext';
import { createExerciseReplay, exerciseFixture } from './adapters/replay';
import { createLiveAdapter } from './adapters/live/liveAdapter';
import { ModeBanner } from './layout/ModeBanner';
import { FailureNotices } from './layout/FailureNotices';
import { ScenarioControls } from './layout/ScenarioControls';
import { Section } from './layout/Section';
import { Scene } from './scene';
import { ConfirmedQueue, IncidentHistory, IncomingFeed, PicturePanel, ReviewBand } from './panels';
import type { DeskAdapter, DeskState } from './adapters/contract';
import { confirmedQueue, inferenceLabel, reviewBand, sourceLabel } from './adapters/derived';

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
  // §10: the operator starts an isolated replay after a database loss. It is a separate adapter,
  // so it can never write to the live database, even after the connection returns.
  const [replay, setReplay] = useState<DeskAdapter | null>(null);
  const fallback = import.meta.env.MODE === 'replay' ? {} : { onStartReplay: () => setReplay(createExerciseReplay()), onExitReplay: replay ? () => setReplay(null) : undefined };
  return (
    <DeskProvider adapter={replay ?? resolved}>
      <Desk {...fallback} />
    </DeskProvider>
  );
}

// Replay never runs a model: say so up front instead of waiting for the first fixture output.
function inferenceText(state: DeskState): string {
  return state.mode === 'LOCAL REPLAY' ? 'fixture · authored outputs, no model ran' : inferenceLabel(state);
}

function Desk(replayControls: { onStartReplay?: () => void; onExitReplay?: () => void }) {
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
        {state && <FailureNotices state={state} {...replayControls} />}
      </ModeBanner>
      <main className="workspace">
        <section className="scene-pane" aria-label="Exercise scene">
          <Scene {...selection} />
        </section>
        <aside className="side-pane" aria-label="Reports and incidents">
          <Section id="review" title="Needs review" pinned count={state ? reviewBand(state).length : 0}>
            <ReviewBand {...selection} />
          </Section>
          <Section id="queue" title="Confirmed" count={state ? confirmedQueue(state).length : 0}>
            <ConfirmedQueue {...selection} />
          </Section>
          <Section id="picture" title="What Claude thinks">
            <PicturePanel {...selection} />
          </Section>
          <Section id="incoming" title="Incoming reports" defaultOpen={false}>
            <IncomingFeed {...selection} />
          </Section>
          <Section id="history" title="Report history">
            <IncidentHistory {...selection} />
          </Section>
        </aside>
      </main>
    </div>
  );
}
