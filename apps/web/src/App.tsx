import { useState } from 'react';
import { ModeBanner, type RunMode } from './layout/ModeBanner';
import { Section } from './layout/Section';
import { Scene } from './scene';
import { ConfirmedQueue, IncidentHistory, IncomingFeed, ReviewBand } from './panels';

// Until an adapter is wired, the app runs with no source. `vite --mode replay`
// (npm run dev:replay) labels the run LOCAL REPLAY; the replay adapter fills it in.
function initialMode(): RunMode {
  return import.meta.env.MODE === 'replay' ? 'LOCAL REPLAY' : 'NOT CONNECTED';
}

export function App() {
  const [mode] = useState<RunMode>(initialMode);
  // Selection is the only state shared between the scene and the panels.
  const [selectedIncidentId, setSelectedIncidentId] = useState<string | null>(null);
  const selection = { selectedIncidentId, onSelectIncident: setSelectedIncidentId };

  return (
    <div className="app">
      <ModeBanner mode={mode} sourceProvenance="none" inferenceProvenance="none" />
      <main className="workspace">
        <section className="scene-pane" aria-label="Exercise scene">
          <Scene {...selection} />
        </section>
        <aside className="side-pane" aria-label="Reports and incidents">
          <Section id="incoming" title="Incoming reports">
            <IncomingFeed {...selection} />
          </Section>
          <Section id="review" title="Review band" pinned>
            <ReviewBand {...selection} />
          </Section>
          <Section id="queue" title="Confirmed queue">
            <ConfirmedQueue {...selection} />
          </Section>
          <Section id="history" title="Selected incident history">
            <IncidentHistory {...selection} />
          </Section>
        </aside>
      </main>
    </div>
  );
}
