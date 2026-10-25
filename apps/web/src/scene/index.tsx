import { Component, lazy, Suspense, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useDesk } from '../adapters/DeskContext';
import { attentionColor, attentionLabel, HEATMAP_HEIGHT_SCALE, HEATMAP_RADIUS,
  PLACES, placePosition, type SceneDataProps, type SceneIncident } from './model';
import './scene.css';
import { SCENE_METADATA, sceneToGeographic } from './georeference';

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
  return <svg className="scene-map" viewBox="-350 -250 700 500" role="img" aria-label="Fictional exercise map · 2D">
    <rect x="-350" y="-250" width="700" height="500" fill="#162d31" />
    <image href={`${import.meta.env.BASE_URL}scene/${SCENE_METADATA.topdown}`} x="-350" y="-250" width="700" height="500" />
    {heatmap && contributors.map((row) => {
      const point = placePosition(row.confirmedPlaceId)!;
      return <g key={row.incidentId} aria-hidden="true" className="scene-density-rings">
        {[1, .75, .5, .25].map((fraction) => <circle key={fraction} cx={point.x} cy={point.z} r={HEATMAP_RADIUS * fraction} fill="#dfb965" opacity=".10" />)}
      </g>;
    })}
    {PLACES.map((place) => <g key={place.id}>
      <rect x={place.x - 20} y={place.z + 16} width="40" height="16" rx="2" fill="#10262a" />
      <text x={place.x} y={place.z + 28} textAnchor="middle" fill="#e2e9dd" fontSize="10">{place.name}</text>
    </g>)}
    {contributors.map((row, index) => {
      const point = placePosition(row.confirmedPlaceId)!;
      const offset = contributors.slice(0, index).filter((prior) => prior.confirmedPlaceId === row.confirmedPlaceId).length * 10;
      return <g key={row.incidentId} onClick={() => onSelectIncident(row.incidentId)} className="scene-map-marker" aria-hidden="true">
        <circle cx={point.x + offset} cy={point.z - 17} r={selectedIncidentId === row.incidentId ? 8 : 6} fill={attentionColor(row.attention)} stroke={selectedIncidentId === row.incidentId ? '#fff' : '#13272b'} strokeWidth="2" />
      </g>;
    })}
    <text x="320" y="-220" textAnchor="middle" fill="#e2e9dd" fontSize="15">N ↑</text>
  </svg>;
}

export function Scene({ selectedIncidentId, onSelectIncident, incidents: supplied }: SceneProps) {
  const { state } = useDesk();
  const incidents = supplied ?? state?.incidents ?? [];
  const [heatmap, setHeatmap] = useState(false);
  const [webgl, setWebgl] = useState(false);
  const [use2d, setUse2d] = useState(false);
  const [assetFailed, setAssetFailed] = useState(false);
  const rendererFailed = useCallback(() => setWebgl(false), []);
  const mapAssetFailed = useCallback(() => setAssetFailed(true), []);
  useEffect(() => { setWebgl(supportsWebGL()); }, []);
  const unique = useMemo(() => [...new Map(incidents.map((row) => [row.incidentId, row])).values()], [incidents]);
  const unplaced = unique.filter((row) => !placePosition(row.confirmedPlaceId));
  function incidentButton(row: SceneIncident) {
    const place = PLACES.find((candidate) => candidate.id === row.confirmedPlaceId);
    const point = placePosition(row.confirmedPlaceId);
    const geographic = point ? sceneToGeographic(point.x, point.z) : null;
    return <button key={row.incidentId} type="button" className="scene-incident"
      title={geographic ? `Synthetic exercise anchor: ${geographic.latitude.toFixed(6)}, ${geographic.longitude.toFixed(6)}` : 'Unlocated incident'}
      aria-pressed={selectedIncidentId === row.incidentId} onClick={() => onSelectIncident(row.incidentId)}>
      <span className="scene-dot" style={{ background: attentionColor(row.attention) }} />
      <span><strong>{place?.name ?? row.incidentId}</strong><small>{attentionLabel(row.attention)} · {row.status.toLowerCase()}</small></span>
      {selectedIncidentId === row.incidentId && <span className="scene-selected-label">Selected</span>}
    </button>;
  }
  return <div className="valley-scene">
    <header className="scene-heading">
      <div><h2>SF waterfront</h2></div>
      <div className="scene-toolbar"><button type="button" className="scene-mode" aria-pressed={!webgl || use2d} disabled={!webgl} onClick={() => setUse2d((value) => !value)}>2D map</button>
      <button type="button" className="scene-mode" aria-pressed={heatmap} onClick={() => setHeatmap((value) => !value)}>Heatmap {heatmap ? 'on' : 'off'}</button></div>
    </header>
    <div className="scene-viewport">
      {webgl && !use2d ? <RenderBoundary onFailure={rendererFailed}><Suspense fallback={<p className="scene-empty">Loading local 3D scene…</p>}>
        <ValleyCanvas incidents={unique} selectedIncidentId={selectedIncidentId} onSelectIncident={onSelectIncident} heatmap={heatmap} onFailure={rendererFailed} baked={!assetFailed} onAssetFailure={mapAssetFailed} />
        </Suspense>
      </RenderBoundary> : <TopDown incidents={unique} selectedIncidentId={selectedIncidentId} onSelectIncident={onSelectIncident} heatmap={heatmap} />}
      <span className="scene-view-label">{webgl && !use2d ? '3D · drag to orbit · scroll to zoom' : webgl ? '2D map · same geographic alignment' : 'WebGL unavailable · 2D map'}</span>
    </div>
    {assetFailed && <p role="status" className="scene-disclosure">Basemap unavailable · procedural geometry fallback. Incident coordinates are unchanged.</p>}
    {heatmap && <div className="scene-legend" role="note" aria-label="Heatmap legend">
      <strong>Confirmed unresolved incident concentration</strong>
      <span className="scene-legend-ramp" />
      <span>0 · 1 · 2 · 3+ incidents at center · fixed radius {HEATMAP_RADIUS} units · fixed height scale {HEATMAP_HEIGHT_SCALE} units per contribution.</span>
      <span>Height is not severity, terrain, or flood depth. Repeated reports add no height.</span>
      {(!webgl || use2d) && <span>2D shows equal fixed-radius density footprints; elevation requires 3D.</span>}
    </div>}
    {unplaced.length > 0 && <section className="scene-unplaced" aria-label="Unplaced incidents"><h3>Unplaced incidents</h3><p>Unknown location · excluded from heatmap</p>{unplaced.map(incidentButton)}</section>}
    {unique.length === 0 && <p className="scene-empty">No confirmed incidents. Reports appear after an adapter connects.</p>}
    <footer className="scene-footer"><span>Map data © OpenStreetMap contributors (ODbL)</span></footer>
  </div>;
}
