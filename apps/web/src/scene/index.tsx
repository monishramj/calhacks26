import { Component, lazy, Suspense, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useDesk } from '../adapters/DeskContext';
import { attentionColor, attentionLabel, HEATMAP_HEIGHT_SCALE, HEATMAP_RADIUS,
  PLACES, placePosition, type SceneDataProps, type SceneIncident } from './model';
import './scene.css';
import { SUNSET, sceneToGeographic } from './georeference';
import type { CameraView, Layer } from './sunset';
import { mmss, useClock } from '../network/clock';
import { positionAt, RANGE_M, SCENARIO, statsAt } from '../network/mesh';

const SunsetCanvas = lazy(() => import('./sunset').then((module) => ({ default: module.SunsetCanvas })));

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

const B = SUNSET.bounds;
const points = (flat: number[]) => flat.reduce((s, v, i) => s + (i % 2 ? `,${v} ` : `${v}`), '');

/** 2D fallback drawn from the same bundled map data and coordinates as the 3D scene. */
function TopDown({ incidents, selectedIncidentId, onSelectIncident, heatmap }: {
  incidents: readonly SceneIncident[];
  selectedIncidentId: string | null;
  onSelectIncident: SceneProps['onSelectIncident'];
  heatmap: boolean;
}) {
  const { t } = useClock(2);
  const located = incidents.filter((row) => row.status === 'OPEN' && placePosition(row.confirmedPlaceId));
  const contributors = [...new Map(located.map((row) => [row.incidentId, row])).values()];
  const base = useMemo(() => <>
    <rect x={B.minX - 400} y={B.minZ} width={B.maxX - B.minX + 400} height={B.maxZ - B.minZ} fill="#3d6670" />
    <polygon points={`${points(SUNSET.coast)} ${B.maxX},${B.maxZ + 3000} ${B.maxX},${B.minZ - 3000}`} fill="#d9c9a0" />
    <polygon points={`${points(SUNSET.coast.map((v, i) => (i % 2 ? v : v + 130)))} ${B.maxX},${B.maxZ + 3000} ${B.maxX},${B.minZ - 3000}`} fill="#a5ab92" />
    {SUNSET.parks.map((p, i) => <polygon key={i} points={points(p)} fill="#86a46c" />)}
    {SUNSET.roads.map((r, i) => <polyline key={i} points={points(r.p)} fill="none" stroke={r.w >= 8 ? '#5a5f64' : '#b9b3a1'} strokeWidth={r.w} strokeLinecap="round" />)}
    {SUNSET.buildings.map((b, i) => <polygon key={i} points={points(b.p)} fill={b.site ? '#f3e2ad' : '#e3ddcf'} stroke="#8e8a7e" strokeWidth=".4" />)}
  </>, []);
  return <svg className="scene-map" viewBox={`${B.minX} ${B.minZ} ${B.maxX - B.minX} ${B.maxZ - B.minZ}`} preserveAspectRatio="xMidYMid slice"
    role="img" aria-label="Outer Sunset exercise map · 2D">
    {base}
    {heatmap && contributors.map((row) => {
      const point = placePosition(row.confirmedPlaceId)!;
      return <g key={row.incidentId} aria-hidden="true" className="scene-density-rings">
        {[1, .75, .5, .25].map((fraction) => <circle key={fraction} cx={point.x} cy={point.z} r={HEATMAP_RADIUS * fraction} fill="#f2994a" opacity=".16" />)}
      </g>;
    })}
    {SCENARIO.teams.map((team) => { const q = positionAt(team.track, t); return <circle key={team.teamId} cx={q.x} cy={q.z} r="6" fill="#4ea1ff" stroke="#0d1b26" strokeWidth="2" aria-hidden="true" />; })}
    {PLACES.map((place) => <g key={place.id}>
      <rect x={place.x - 34} y={place.z + 18} width="68" height="22" rx="4" fill="#14262ae6" />
      <text x={place.x} y={place.z + 33} textAnchor="middle" fill="#f1efe6" fontSize="13">{place.name}</text>
    </g>)}
    {contributors.map((row, index) => {
      const point = placePosition(row.confirmedPlaceId)!;
      const offset = contributors.slice(0, index).filter((prior) => prior.confirmedPlaceId === row.confirmedPlaceId).length * 14;
      const selected = selectedIncidentId === row.incidentId;
      return <g key={row.incidentId} onClick={() => onSelectIncident(row.incidentId)} className="scene-map-marker" aria-hidden="true">
        <circle cx={point.x + offset} cy={point.z - 4} r={selected ? 13 : 10} fill={attentionColor(row.attention)} stroke={selected ? '#fff' : '#13272b'} strokeWidth="3" />
      </g>;
    })}
  </svg>;
}

const VIEWS: { id: CameraView; label: string }[] = [{ id: 'overview', label: 'Overview' }, { id: 'top', label: 'Top' }, { id: 'selected', label: 'Selected' }];

export function Scene({ selectedIncidentId, onSelectIncident, incidents: supplied }: SceneProps) {
  const { state } = useDesk();
  const incidents = supplied ?? state?.incidents ?? [];
  const [heatmap, setHeatmap] = useState(false);
  const [raised, setRaised] = useState(true);
  const [view, setView] = useState<CameraView>('overview');
  const [layer, setLayer] = useState<Layer>('incidents');
  const [webgl, setWebgl] = useState(false);
  const [use2d, setUse2d] = useState(false);
  const rendererFailed = useCallback(() => setWebgl(false), []);
  useEffect(() => { setWebgl(supportsWebGL()); }, []);
  useEffect(() => { if (selectedIncidentId) setView('selected'); }, [selectedIncidentId]);
  const unique = useMemo(() => [...new Map(incidents.map((row) => [row.incidentId, row])).values()], [incidents]);
  const unplaced = unique.filter((row) => !placePosition(row.confirmedPlaceId));
  const threeD = webgl && !use2d;
  function incidentButton(row: SceneIncident) {
    const point = placePosition(row.confirmedPlaceId);
    const geographic = point ? sceneToGeographic(point.x, point.z) : null;
    return <button key={row.incidentId} type="button" className="scene-incident"
      title={geographic ? `Synthetic exercise anchor: ${geographic.latitude.toFixed(6)}, ${geographic.longitude.toFixed(6)}` : 'Unlocated incident'}
      aria-pressed={selectedIncidentId === row.incidentId} onClick={() => onSelectIncident(row.incidentId)}>
      <span className="scene-dot" style={{ background: attentionColor(row.attention) }} />
      <span><strong>{row.incidentId}</strong><small>{attentionLabel(row.attention)} · {row.status.toLowerCase()}</small></span>
    </button>;
  }
  return <div className="sunset-scene">
    <div className="scene-viewport">
      {threeD ? <RenderBoundary onFailure={rendererFailed}><Suspense fallback={<p className="scene-empty scene-loading">Loading Outer Sunset…</p>}>
        <SunsetCanvas incidents={unique} selectedIncidentId={selectedIncidentId} onSelectIncident={onSelectIncident}
          heatmap={heatmap} raised={raised} view={view} layer={layer} onFailure={rendererFailed} />
      </Suspense></RenderBoundary>
        : <TopDown incidents={unique} selectedIncidentId={selectedIncidentId} onSelectIncident={onSelectIncident} heatmap={heatmap} />}
    </div>
    <div className="scene-toolbar" role="toolbar" aria-label="Map controls">
      <span className="scene-place">Outer Sunset · San Francisco</span>
      <span className="scene-segment" role="group" aria-label="Map layer">
        <button type="button" className="scene-mode" aria-pressed={layer === 'incidents'} onClick={() => setLayer('incidents')}>Incidents</button>
        <button type="button" className="scene-mode" aria-pressed={layer === 'network'} onClick={() => setLayer('network')}>LoRa network</button>
      </span>
      <button type="button" className="scene-mode" aria-pressed={!threeD} disabled={!webgl} onClick={() => setUse2d((value) => !value)}>2D map</button>
      {threeD && VIEWS.map((v) => <button key={v.id} type="button" className="scene-mode" aria-pressed={view === v.id}
        disabled={v.id === 'selected' && !selectedIncidentId} onClick={() => setView(v.id)}>{v.label}</button>)}
      {layer === 'incidents' && <button type="button" className="scene-mode" aria-pressed={heatmap} onClick={() => setHeatmap((value) => !value)}>Heatmap {heatmap ? 'on' : 'off'}</button>}
      {threeD && heatmap && layer === 'incidents' && <button type="button" className="scene-mode" aria-pressed={raised} onClick={() => setRaised((value) => !value)}>Raised</button>}
    </div>
    <div className="scene-overlay-bottom">
      {layer === 'network' && <NetworkStats />}
      {heatmap && layer === 'incidents' && <div className="scene-legend" role="note" aria-label="Heatmap legend">
        <strong>Confirmed unresolved incident concentration</strong>
        <span className="scene-legend-ramp" /><span className="scene-legend-ticks"><span>0</span><span>1</span><span>2</span><span>3+</span></span>
        <span>One equal contribution per open located incident · fixed radius {HEATMAP_RADIUS} m · fixed height scale {HEATMAP_HEIGHT_SCALE} m per contribution.</span>
        <span>Height is not severity, terrain, or flood depth. Repeated reports add no height.</span>
        {!threeD && <span>2D shows equal fixed-radius density footprints; elevation requires 3D.</span>}
      </div>}
      {unplaced.length > 0 && <section className="scene-unplaced" aria-label="Unplaced incidents"><h3>Unplaced incidents</h3><p>Unknown location · excluded from heatmap</p>{unplaced.map(incidentButton)}</section>}
      {unique.length === 0 && <p className="scene-empty">No confirmed incidents. Reports appear after an adapter connects.</p>}
      <span className="scene-view-label">{threeD ? '3D · drag to orbit · right-drag to pan · scroll to zoom' : webgl ? '2D map · same coordinates as 3D' : 'WebGL unavailable · 2D map'}</span>
      <footer className="scene-footer">Map data © OpenStreetMap contributors (ODbL) · exercise sites are synthetic overlays on real buildings</footer>
    </div>
  </div>;
}

/** Running totals of the simulated mesh, codec packets against the same reports sent as raw text. */
function NetworkStats() {
  const { t } = useClock(2);
  const s = statsAt(t);
  const pct = (v: number) => `${Math.round(v * 100)}%`;
  const saved = s.rawBytes ? 1 - s.bytes / s.rawBytes : 0;
  return <div className="scene-legend network-stats" role="note" aria-label="LoRa network">
    <strong>LoRa mesh · {mmss(t)}</strong>
    <span className="stats-grid">
      <span>Reports delivered</span><b>{s.delivered} / {s.total}</b>
      <span>Hops relayed</span><b>{s.hops}</b>
      <span>Bytes on air</span><b>{s.bytes} B <small>vs {s.rawBytes} B raw ({pct(saved)} less)</small></b>
      <span>Airtime</span><b>{s.airS.toFixed(1)} s <small>vs {s.rawAirS.toFixed(1)} s raw</small></b>
      <span>Channel use (5 min)</span><b>{pct(s.channelUse)} <small>vs {pct(s.rawChannelUse)} raw</small></b>
      <span>3-hop delivery at 25% load</span><b>{pct(s.p3)} <small>vs {pct(s.rawP3)} raw</small></b>
    </span>
    <span className="legend-row"><i style={{ background: '#4ea1ff' }} />team radio <i style={{ background: '#f2c94c' }} />report waiting for coverage <i style={{ background: '#7cf0c4' }} />packet <i style={{ background: '#f2994a' }} />command post</span>
    <span>Simulated network · LongFast · {RANGE_M} m range. Codec sizes are estimates from {SCENARIO.codecEstimate.samples} measured packets.</span>
  </div>;
}
