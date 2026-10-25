import type { ReactNode } from 'react';
import type { DeskMode } from '../adapters/contract';

// §10: LIVE / LOCAL DEGRADED / LOCAL REPLAY, with source and inference provenance
// shown separately. NOT CONNECTED is the honest state before an adapter is wired.
const MODE_CLASS: Record<DeskMode, string> = {
  LIVE: 'mode-live',
  'LOCAL DEGRADED': 'mode-degraded',
  'LOCAL REPLAY': 'mode-replay',
  'NOT CONNECTED': 'mode-none',
};

type Props = {
  mode: DeskMode;
  sourceProvenance: string;
  inferenceProvenance: string;
  /** Hide the run-mode label (recorded run playback). */
  hideMode?: boolean;
  children?: ReactNode;
};

export function ModeBanner({ mode, hideMode, children }: Props) {
  return (
    <header className={`mode-banner ${MODE_CLASS[mode]}`}>
      <span className="brand" aria-label="LoR@">LoR<span className="brand-at">@</span></span>
      {!hideMode && <strong className="mode-label" data-testid="run-mode">
        {mode === 'LIVE' ? 'Live' : mode === 'LOCAL REPLAY' ? 'Replay' : 'Offline'}
      </strong>}
      {children}
    </header>
  );
}
