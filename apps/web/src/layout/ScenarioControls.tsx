import { useState } from 'react';
import { useDesk } from '../adapters/DeskContext';

// §18: the presenter delivers the next exercise report by choice, never on a timer.
export function ScenarioControls() {
  const { adapter, state } = useDesk();
  const [error, setError] = useState<string | null>(null);
  if (!adapter || !state?.scenario) return null;
  const { deliveredCount, totalCount, nextGate } = state.scenario;
  const down = state.mode === 'LOCAL DEGRADED';

  async function sendNext() {
    const r = await adapter!.advanceScenario({
      runId: state!.runId,
      commandId: crypto.randomUUID(),
      expectedDeliveredCount: deliveredCount,
    });
    setError(r.ok ? null : r.error.message);
  }

  async function reset() {
    const r = await adapter!.resetRun({ runId: state!.runId, commandId: crypto.randomUUID() });
    setError(r.ok ? null : r.error.message);
  }

  return (
    <span className="scenario-controls">
      <button type="button" onClick={sendNext} disabled={down || nextGate !== 'SEND_NEXT_REPORT'}>
        {nextGate === 'SEND_NEXT_REPORT' ? `Send next report (#${deliveredCount + 1})` : 'All reports sent'}
      </button>
      <span aria-live="polite">
        {deliveredCount} / {totalCount} delivered
      </span>
      <button type="button" onClick={reset} disabled={down}>
        Reset run
      </button>
      {error && <span role="alert">{error}</span>}
    </span>
  );
}
