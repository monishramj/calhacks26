import { useEffect, useRef, useState } from 'react';
import type { DeskState } from '../adapters/contract';

// §10 failure notices. Only what the dashboard can really see: the connection mode, and jobs that
// stay queued because no worker took them.
const GRACE_MS = 20_000;

/** True once `waiting` has held continuously for GRACE_MS (a worker normally claims a job within seconds). */
function useStalled(waiting: boolean): boolean {
  const since = useRef<number | null>(null);
  const [stalled, setStalled] = useState(false);
  useEffect(() => {
    if (!waiting) return (since.current = null), setStalled(false), undefined;
    since.current ??= Date.now();
    const t = setInterval(() => setStalled(Date.now() - since.current! >= GRACE_MS), 1000);
    return () => clearInterval(t);
  }, [waiting]);
  return stalled;
}

export function FailureNotices({ state, onStartReplay, onExitReplay }: { state: DeskState; onStartReplay?: () => void; onExitReplay?: () => void }) {
  const laya = useStalled(state.mode === 'LIVE' && (state.queuedJobs?.LOCAL_SUGGESTION ?? 0) > 0);
  const claude = useStalled(state.mode === 'LIVE' && (state.queuedJobs?.INCIDENT_PROPOSAL ?? 0) > 0);
  return (
    <>
      {state.mode === 'LOCAL DEGRADED' && (
        <span role="status">
          Database connection lost. Showing the last confirmed view; writes are stopped until it reconnects.
          {onStartReplay && (
            <button type="button" onClick={onStartReplay}>
              Start local replay
            </button>
          )}
        </span>
      )}
      {state.mode === 'LOCAL REPLAY' && onExitReplay && (
        <button type="button" onClick={onExitReplay}>
          Exit replay, back to live
        </button>
      )}
      {laya && <span role="status">Local model unavailable, manual review</span>}
      {claude && <span role="status">Claude summary unavailable (offline or no key)</span>}
    </>
  );
}
