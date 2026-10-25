import { useEffect, useRef, useState } from 'react';
import { useDesk } from '../adapters/DeskContext';

// §18: R07 is delivered only when the presenter chooses to, never on a timer. Playback stops before it.
const PRESENTER_GATE = 7;
const SECONDS_PER_REPORT = 4;
const SPEEDS = [1, 2, 4];

export function ScenarioControls() {
  const { adapter, state } = useDesk();
  const [error, setError] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [busy, setBusy] = useState(false);
  const floor = useRef<number | null>(null); // delivered count at a fresh run: the scrubber's start
  const latest = useRef(state);
  latest.current = state;
  const scenario = state?.scenario;
  const down = state?.mode === 'LOCAL DEGRADED';
  const replay = state?.mode === 'LOCAL REPLAY';
  const delivered = scenario?.deliveredCount ?? 0;
  const total = scenario?.totalCount ?? 0;
  const canSend = scenario?.nextGate === 'SEND_NEXT_REPORT' && !down;
  const atGate = delivered + 1 === PRESENTER_GATE;
  if (scenario && floor.current === null) floor.current = delivered;

  // Commands read the newest state through a ref; the subscription delivers it asynchronously.
  const settled = async (done: () => boolean) => { for (let i = 0; i < 100 && !done(); i++) await new Promise((r) => setTimeout(r, 20)); };

  async function sendNext() {
    const s = latest.current!, before = s.scenario!.deliveredCount;
    const r = await adapter!.advanceScenario({ runId: s.runId, commandId: crypto.randomUUID(), expectedDeliveredCount: before });
    setError(r.ok ? null : r.error.message);
    if (r.ok) await settled(() => latest.current?.scenario?.deliveredCount !== before);
    return r.ok;
  }

  async function reset() {
    setPlaying(false);
    const run = latest.current!.runId;
    const r = await adapter!.resetRun({ runId: run, commandId: crypto.randomUUID() });
    setError(r.ok ? null : r.error.message);
    if (r.ok) await settled(() => latest.current?.runId !== run);
    return r.ok;
  }

  // Scrub (replay only): forward delivers the next reports in order; backward resets and replays up to the point.
  async function scrubTo(target: number) {
    if (busy) return;
    setBusy(true); setPlaying(false);
    try {
      if (target < delivered && !(await reset())) return;
      while ((latest.current?.scenario?.deliveredCount ?? target) < target && (await sendNext()));
    } finally { setBusy(false); }
  }

  useEffect(() => {
    if (!playing) return;
    if (!canSend) { setPlaying(false); return; }
    if (atGate) { setPlaying(false); return; }
    const timer = setTimeout(() => { void sendNext(); }, (SECONDS_PER_REPORT * 1000) / speed);
    return () => clearTimeout(timer);
  }, [playing, delivered, canSend, atGate, speed]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!adapter || !scenario) return null;
  const start = floor.current ?? 0;

  return (
    <span className="scenario-controls">
      <button type="button" className="play" onClick={() => setPlaying((p) => !p)} disabled={!canSend || atGate || busy}
        aria-pressed={playing} title={atGate ? 'Playback waits for you to send R07' : undefined}>
        {playing ? 'Pause' : 'Play'}
      </button>
      <button type="button" onClick={() => void sendNext()} disabled={!canSend || busy}>
        {canSend ? `Send next report (#${delivered + 1})` : 'All reports sent'}
      </button>
      <span className="speed" role="group" aria-label="Playback speed">
        {SPEEDS.map((s) => <button key={s} type="button" aria-pressed={speed === s} onClick={() => setSpeed(s)}>{s}×</button>)}
      </span>
      {replay ? (
        <label className="scrubber">
          <span className="visually-hidden">Timeline</span>
          <input type="range" min={start} max={total} step={1} value={delivered} disabled={busy}
            onChange={(e) => void scrubTo(Number(e.target.value))} aria-valuetext={`${delivered} of ${total} reports delivered`} />
        </label>
      ) : null}
      <span aria-live="polite">{delivered} / {total} delivered</span>
      {atGate && canSend && <span className="gate-hint">Paused before R07 · send it when ready</span>}
      <button type="button" onClick={() => void reset()} disabled={down || busy}>Reset run</button>
      {error && <span role="alert">{error}</span>}
    </span>
  );
}
