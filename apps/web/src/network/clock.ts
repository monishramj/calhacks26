// One scenario clock per page, in exercise seconds. The 3D scene reads `clock.t` every frame; React UI subscribes
// through useClock at a low rate, so playback never re-renders the app at frame rate.
import { useEffect, useState } from 'react';
import { SCENARIO } from './mesh';

type Listener = () => void;
const listeners = new Set<Listener>();
let timer: ReturnType<typeof setInterval> | undefined;
let last = 0;

export const clock = { t: 0, playing: false, speed: 5 };

function emit() { listeners.forEach((l) => l()); }

// A timer, not requestAnimationFrame: the playing window must keep sending reports while it is in the background.
function tick() {
  const now = performance.now();
  clock.t = Math.min(clock.t + ((now - last) / 1000) * clock.speed, SCENARIO.durationSeconds);
  last = now;
  if (clock.t >= SCENARIO.durationSeconds) setPlaying(false);
  else emit();
}

export function setPlaying(playing: boolean) {
  clock.playing = playing && clock.t < SCENARIO.durationSeconds;
  clearInterval(timer);
  if (clock.playing) { last = performance.now(); timer = setInterval(tick, 50); }
  emit();
}

export function setSpeed(speed: number) { clock.speed = speed; emit(); }
export function seek(t: number) { clock.t = Math.max(0, Math.min(t, SCENARIO.durationSeconds)); emit(); }

/** Subscribe to the clock; re-renders at most `hz` times a second while playing. */
export function useClock(hz = 4) {
  const [, set] = useState(0);
  useEffect(() => {
    let pending: ReturnType<typeof setTimeout> | null = null;
    const listener = () => { pending ??= setTimeout(() => { pending = null; set((n) => n + 1); }, 1000 / hz); };
    listeners.add(listener);
    return () => { listeners.delete(listener); if (pending) clearTimeout(pending); };
  }, [hz]);
  return clock;
}

export const mmss = (s: number) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
