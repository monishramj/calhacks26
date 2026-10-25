import { useEffect, useRef, useState } from 'react';
import { useDesk } from '../adapters/DeskContext';
import { clock, mmss, seek, setPlaying, setSpeed, useClock } from '../network/clock';
import { DELIVERIES, SCENARIO } from '../network/mesh';

// Real-time exercise playback: a scenario clock runs at the chosen speed, teams move, and each report is sent to
// the desk the moment its simulated packet reaches the command post. Only the window that plays or seeks sends.
const SPEEDS = [5, 15, 30, 60];

export function ScenarioControls() {
  const { adapter, state } = useDesk();
  const { t, playing, speed } = useClock(8);
  const [error, setError] = useState<string | null>(null);
  const latest = useRef(state);
  latest.current = state;
  const busy = useRef(false);
  const scenario = state?.scenario;
  const down = state?.mode === 'LOCAL DEGRADED';
  const delivered = scenario?.deliveredCount ?? 0;
  const total = scenario?.totalCount ?? 0;

  // Commands read the newest state through a ref; the subscription delivers it asynchronously.
  const settled = async (done: () => boolean) => { for (let i = 0; i < 100 && !done(); i++) await new Promise((r) => setTimeout(r, 20)); };

  async function sendNext() {
    const s = latest.current!, before = s.scenario!.deliveredCount;
    const r = await adapter!.advanceScenario({ runId: s.runId, commandId: crypto.randomUUID(), expectedDeliveredCount: before });
    setError(r.ok ? null : r.error.message);
    if (r.ok) await settled(() => latest.current?.scenario?.deliveredCount !== before);
    return r.ok;
  }

  async function resetRun() {
    const run = latest.current!.runId;
    const r = await adapter!.resetRun({ runId: run, commandId: crypto.randomUUID() });
    setError(r.ok ? null : r.error.message);
    if (r.ok) await settled(() => latest.current?.runId !== run);
    return r.ok;
  }

  /** Bring the desk in line with the clock: send every report delivered by now, resetting first after a seek back. */
  async function pump() {
    if (busy.current || !adapter || down) return;
    busy.current = true;
    try {
      const due = () => DELIVERIES.filter((d) => d.deliveredAt <= clock.t).length;
      const count = () => latest.current?.scenario?.deliveredCount ?? 0;
      if (count() > due() && !(await resetRun())) return;
      while (count() < Math.min(due(), latest.current?.scenario?.totalCount ?? 0) && (await sendNext()));
    } finally { busy.current = false; }
  }

  useEffect(() => { if (playing) void pump(); }, [t]); // eslint-disable-line react-hooks/exhaustive-deps

  // A window that joins a run already in progress starts its clock at the last delivered report.
  useEffect(() => {
    const last = DELIVERIES[delivered - 1];
    if (!playing && last && clock.t < last.deliveredAt) seek(last.deliveredAt);
  }, [delivered]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!adapter || !scenario) return null;
  const next = DELIVERIES[delivered];

  async function jump(to: number) {
    setPlaying(false);
    seek(to);
    await pump();
  }

  return (
    <span className="scenario-controls">
      <button type="button" className="play" onClick={() => setPlaying(!playing)} disabled={down || t >= SCENARIO.durationSeconds}
        aria-pressed={playing}>
        {playing ? 'Pause' : 'Play'}
      </button>
      <span className="speed" role="group" aria-label="Playback speed">
        {SPEEDS.map((s) => <button key={s} type="button" aria-pressed={speed === s} onClick={() => setSpeed(s)}>{s}×</button>)}
      </span>
      <label className="scrubber">
        <span className="visually-hidden">Exercise time</span>
        <input type="range" min={0} max={SCENARIO.durationSeconds} step={1} value={Math.floor(t)} disabled={down}
          onChange={(e) => void jump(Number(e.target.value))} aria-valuetext={`${mmss(t)} of ${mmss(SCENARIO.durationSeconds)}`} />
      </label>
      <span className="clock" aria-label="Exercise time">{mmss(t)} / {mmss(SCENARIO.durationSeconds)}</span>
      <button type="button" aria-label={next ? `Next report (#${delivered + 1})` : 'All reports sent'} title="Next report" onClick={() => next && void jump(next.deliveredAt)} disabled={down || !next}>
        <span aria-hidden="true">→</span>
      </button>
      <span aria-live="polite">{delivered}/{total} delivered</span>
      <button type="button" onClick={() => { setPlaying(false); seek(0); void resetRun(); }} disabled={down} aria-label="Reset run" title="Reset run"><span aria-hidden="true">↺</span></button>
      {error && <span role="alert">{error}</span>}
    </span>
  );
}
