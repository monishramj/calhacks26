// §10: LIVE / LOCAL DEGRADED / LOCAL REPLAY, with source and inference provenance
// shown separately. NOT CONNECTED is the honest state before an adapter is wired.
export type RunMode = 'LIVE' | 'LOCAL DEGRADED' | 'LOCAL REPLAY' | 'NOT CONNECTED';

const MODE_CLASS: Record<RunMode, string> = {
  LIVE: 'mode-live',
  'LOCAL DEGRADED': 'mode-degraded',
  'LOCAL REPLAY': 'mode-replay',
  'NOT CONNECTED': 'mode-none',
};

type Props = {
  mode: RunMode;
  sourceProvenance: string;
  inferenceProvenance: string;
};

export function ModeBanner({ mode, sourceProvenance, inferenceProvenance }: Props) {
  return (
    <header className={`mode-banner ${MODE_CLASS[mode]}`}>
      <strong className="mode-label" data-testid="run-mode">
        {mode}
      </strong>
      <span>Source: {sourceProvenance}</span>
      <span>Inference: {inferenceProvenance}</span>
      <span className="exercise-label">Fictional Helene-inspired exercise · all reports are synthetic</span>
    </header>
  );
}
