import { useMemo, useState } from 'react';
import { DeskProvider, useDesk } from './adapters/DeskContext';
import { createExerciseReplay } from './adapters/replay';
import { ModeBanner } from './layout/ModeBanner';
import { ScenarioControls } from './layout/ScenarioControls';
import { Section } from './layout/Section';
import { Scene } from './scene';
import { ConfirmedQueue, IncidentHistory, IncomingFeed, ReviewBand } from './panels';
import type { DeskAdapter } from './adapters/contract';

// `vite --mode replay` (npm run dev:replay) runs the isolated browser replay.
// The live adapter (ws/state, SpacetimeDB) plugs in here after G3.
function createAdapter(): DeskAdapter | null {
  return import.meta.env.MODE === 'replay' ? createExerciseReplay() : null;
}

export function App({ adapter }: { adapter?: DeskAdapter | null }) {
  const resolved = useMemo(() => (adapter === undefined ? createAdapter() : adapter), [adapter]);
  return (
    <DeskProvider adapter={resolved}>
      <Desk />
    </DeskProvider>
  );
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
        sourceProvenance={state?.sourceProvenance ?? 'none'}
        inferenceProvenance={state?.inferenceProvenance ?? 'none'}
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
