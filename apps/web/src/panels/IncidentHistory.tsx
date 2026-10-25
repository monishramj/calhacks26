import { useDesk } from '../adapters/DeskContext';
import { timeline } from '../adapters/derived';
import type { PanelProps } from './index';
import { formatTime } from './shared';

export function IncidentHistory({ selectedIncidentId }: PanelProps) {
  const { state } = useDesk();
  if (!selectedIncidentId) return <p className="empty">Select an incident.</p>;
  if (!state) return <p className="empty">No source connected.</p>;
  const incident = state.incidents.find((i) => i.incidentId === selectedIncidentId);
  if (!incident) return <p className="empty">Incident not found.</p>;
  const entries = timeline(state, incident.incidentId);
  return <section aria-label={`History for ${incident.incidentId}`}>
    <ol className="report-timeline" aria-label={`Timeline for ${incident.incidentId}, receive order`}>
      {entries.map(({ report, standing }) => <li key={report.reportId}>
        <time dateTime={report.receivedAt} title="Received (UTC)">{formatTime(report.receivedAt).slice(0, 5)}</time>
        <p className="original-text">{report.input.text}{standing !== 'CONFIRMED' && <span className="muted"> · Unconfirmed</span>}</p>
      </li>)}
    </ol>
  </section>;
}
