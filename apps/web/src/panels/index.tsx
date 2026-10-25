// Panels lane (ws/web-panels) owns this folder. Placeholder stubs from the lead lane.
// Contract with App: each panel receives the shared selection; data arrives through
// the adapter once packages/domain (G0) lands.
export type PanelProps = {
  selectedIncidentId: string | null;
  onSelectIncident: (incidentId: string | null) => void;
};

export function IncomingFeed(_props: PanelProps) {
  return <p className="empty">No reports received.</p>;
}

export function ReviewBand(_props: PanelProps) {
  return <p className="empty">Nothing needs review.</p>;
}

export function ConfirmedQueue(_props: PanelProps) {
  return <p className="empty">No confirmed incidents.</p>;
}

export function IncidentHistory({ selectedIncidentId }: PanelProps) {
  return <p className="empty">{selectedIncidentId ? `Incident ${selectedIncidentId}` : 'Select an incident.'}</p>;
}
