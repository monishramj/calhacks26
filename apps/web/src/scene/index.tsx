import { Component, lazy, Suspense, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useDesk } from '../adapters/DeskContext';
import { attentionColor, attentionLabel, HEATMAP_HEIGHT_SCALE, HEATMAP_RADIUS,
  PLACES, placePosition, type SceneDataProps, type SceneIncident } from './model';
import './scene.css';

const ValleyCanvas = lazy(() => import('./valley').then((module) => ({ default: module.ValleyCanvas })));

export type SceneProps = SceneDataProps & {
  selectedIncidentId: string | null;
  onSelectIncident: (incidentId: string | null) => void;
};

class RenderBoundary extends Component<{ children: ReactNode; onFailure: () => void }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch() { this.props.onFailure(); }
  render() { return this.state.failed ? null : this.props.children; }
}

function supportsWebGL(): boolean {
  if (typeof WebGL2RenderingContext === 'undefined') return false;
  try {
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('webgl2');
    context?.getExtension('WEBGL_lose_context')?.loseContext();
    return Boolean(context);
  } catch { return false; }
}

function TopDown({ incidents, selectedIncidentId, onSelectIncident, heatmap }: {
  incidents: readonly SceneIncident[];
  selectedIncidentId: string | null;
  onSelectIncident: SceneProps['onSelectIncident'];
  heatmap: boolean;
}) {
  const located = incidents.filter((row) => row.status === 'OPEN' && placePosition(row.confirmedPlaceId));
  const contributors = [...new Map(located.map((row) => [row.incidentId, row])).values()];
  return <svg className="scene-map" viewBox="-220 -120 440 280" role="img" aria-label="Fictional exercise map · 2D">
    <rect x="-220" y="-120" width="440" height="280" fill="#162d31" />
    <path d="M-220,-65 C-90,-110 -40,-65 45,-80 S160,-110 240,-50" fill="none" stroke="#245d73" strokeWidth="25" />
    <path d="M-220,90 L220,90 M-155,-120 L-155,160 M-5,-120 L-5,160 M100,-120 L100,160" stroke="#3a5051" strokeWidth="5" />
    {heatmap && contributors.map((row) => {
      const point = placePosition(row.confirmedPlaceId)!;
      return <g key={row.incidentId} aria-hidden="true" className="scene-density-rings">
        {[1, .75, .5, .25].map((fraction) => <circle key={fraction} cx={point.x} cy={point.z} r={HEATMAP_RADIUS * fraction} fill="#dfb965" opacity=".10" />)}
      </g>;
    })}
    {PLACES.map((place) => <g key={place.id}>
      <rect x={place.x - 15} y={place.z - 10} width={place.id === 'residence' ? 19 : 30} height="20" rx="2" fill="#71827d" stroke="#a2b0a1" />
      <text x={place.x} y={place.z + 28} textAnchor="middle" fill="#e2e9dd" fontSize="10">{place.name}</text>
    </g>)}
    {contributors.map((row, index) => {
      const point = placePosition(row.confirmedPlaceId)!;
      const offset = contributors.slice(0, index).filter((prior) => prior.confirmedPlaceId === row.confirmedPlaceId).length * 10;
      return <g key={row.incidentId} onClick={() => onSelectIncident(row.incidentId)} className="scene-map-marker" aria-hidden="true">
        <circle cx={point.x + offset} cy={point.z - 17} r={selectedIncidentId === row.incidentId ? 8 : 6} fill={attentionColor(row.attention)} stroke={selectedIncidentId === row.incidentId ? '#fff' : '#13272b'} strokeWidth="2" />
      </g>;
    })}
    <text x="198" y="-97" textAnchor="middle" fill="#b3c6c1" fontSize="10">N ↑</text>
    <text x="-205" y="143" fill="#b3c6c1" fontSize="9">Local exercise coordinates · schematic</text>
  </svg>;
}

export function Scene({ selectedIncidentId, onSelectIncident, incidents: supplied, sourceProvenance }: SceneProps) {
  const { state } = useDesk();
  const incidents = supplied ?? state?.incidents ?? [];
  const provenance = sourceProvenance ?? state?.sourceProvenance ?? 'none';
  const [heatmap, setHeatmap] = useState(false);
  const [webgl, setWebgl] = useState(false);
  const rendererFailed = useCallback(() => setWebgl(false), []);
  useEffect(() => { setWebgl(supportsWebGL()); }, []);
  const unique = useMemo(() => [...new Map(incidents.map((row) => [row.incidentId, row])).values()], [incidents]);
  const located = unique.filter((row) => placePosition(row.confirmedPlaceId));
  const unplaced = unique.filter((row) => !placePosition(row.confirmedPlaceId));
  function incidentButton(row: SceneIncident) {
    const place = PLACES.find((candidate) => candidate.id === row.confirmedPlaceId);
    return <button key={row.incidentId} type="button" className="scene-incident"
      aria-pressed={selectedIncidentId === row.incidentId} onClick={() => onSelectIncident(row.incidentId)}>
      <span className="scene-dot" style={{ background: attentionColor(row.attention) }} />
      <span><strong>{place?.name ?? row.incidentId}</strong><small>{attentionLabel(row.attention)} · {row.status.toLowerCase()}</small></span>
      {selectedIncidentId === row.incidentId && <span className="scene-selected-label">Selected</span>}
    </button>;
  }
  return <div className="valley-scene">
    <header className="scene-heading">
      <div><p className="scene-eyebrow">INCIDENT DESK / EXERCISE AREA</p><h2>River valley</h2></div>
      <button type="button" className="scene-mode" aria-pressed={heatmap} onClick={() => setHeatmap((value) => !value)}>Heatmap {heatmap ? 'on' : 'off'}</button>
    </header>
    <p className="scene-disclosure">Fictional Helene-inspired exercise · incidents are synthetic</p>
    <div className="scene-viewport">
      {webgl ? <RenderBoundary onFailure={rendererFailed}><Suspense fallback={<p className="scene-empty">Loading local 3D scene…</p>}>
        <ValleyCanvas incidents={unique} selectedIncidentId={selectedIncidentId} onSelectIncident={onSelectIncident} heatmap={heatmap} onFailure={rendererFailed} />
        </Suspense>
      </RenderBoundary> : <TopDown incidents={unique} selectedIncidentId={selectedIncidentId} onSelectIncident={onSelectIncident} heatmap={heatmap} />}
      <span className="scene-view-label">{webgl ? '3D · drag to orbit · scroll to zoom' : 'WebGL unavailable · 2D map'}</span>
    </div>
    {heatmap && <div className="scene-legend" role="note" aria-label="Heatmap legend">
      <strong>Confirmed unresolved incident concentration</strong>
      <span className="scene-legend-ramp" />
      <span>0 · 1 · 2 · 3+ incidents at center · fixed radius {HEATMAP_RADIUS} units · fixed height scale {HEATMAP_HEIGHT_SCALE} units per contribution.</span>
      <span>Height is not severity, terrain, or flood depth. Repeated reports add no height.</span>
      {!webgl && <span>2D shows equal fixed-radius density footprints; elevation requires 3D.</span>}
    </div>}
    <div className="scene-incident-list" aria-label="Located incidents">{located.map(incidentButton)}</div>
    {unplaced.length > 0 && <section className="scene-unplaced" aria-label="Unplaced incidents"><h3>Unplaced incidents</h3><p>Unknown location · excluded from heatmap</p>{unplaced.map(incidentButton)}</section>}
    {unique.length === 0 && <p className="scene-empty">No confirmed incidents. Reports appear after an adapter connects.</p>}
    <footer className="scene-footer"><span>Source: {provenance}</span><span>Procedural exercise geometry</span></footer>
  </div>;
}
