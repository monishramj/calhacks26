// Scene lane (ws/web-scene) owns this folder. Placeholder stub from the lead lane.
// Contract with App: fill the parent container; report selection by incident ID.
export type SceneProps = {
  selectedIncidentId: string | null;
  onSelectIncident: (incidentId: string | null) => void;
};

export function Scene(_props: SceneProps) {
  return (
    <div style={{ padding: '1rem' }}>
      <p className="empty">Scene placeholder (scene lane: G7).</p>
    </div>
  );
}
