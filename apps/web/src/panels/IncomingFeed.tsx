// Incoming feed (§5, §9): every original, newest first, verbatim, with sent / event /
// receive times kept separate and labeled. Read-only; selection is the only action.
import type { DeskState, Report } from '../adapters/contract';
import { useDesk } from '../adapters/DeskContext';
import { reviewBand, timeline } from '../adapters/derived';
import type { PanelProps } from './index';
import { ReportProvenanceTag, TimeField, messageLabel } from './shared';

const LOCATION_SOURCE: Record<'sender_explicit' | 'operator', string> = {
  sender_explicit: 'sender stated',
  operator: 'operator set',
};

/** True when an earlier-received report was sent later than this one (R11-style late arrival). */
function arrivedLate(report: Report, all: Report[]): boolean {
  const sent = report.input.sentAt;
  if (!sent) return false;
  const t = Date.parse(sent);
  return all.some(
    (r) => r.receiveSequence < report.receiveSequence && r.input.sentAt !== null && Date.parse(r.input.sentAt) > t,
  );
}

export function IncomingFeed({ selectedIncidentId, onSelectIncident }: PanelProps) {
  const { state } = useDesk();
  if (!state) return <p className="empty">No source connected.</p>;
  if (state.reports.length === 0) return <p className="empty">No reports received.</p>;
  const reports = timeline(state).map((e) => e.report).reverse();
  const band = reviewBand(state);
  return (
    <ol className="panel-list" aria-label="Incoming reports, newest first">
      {reports.map((report) => (
        <FeedCard
          key={report.reportId}
          report={report}
          state={state}
          candidateIncidentId={band.find((b) => b.reportId === report.reportId)?.incidentId ?? null}
          selectedIncidentId={selectedIncidentId}
          onSelectIncident={onSelectIncident}
        />
      ))}
    </ol>
  );
}

function FeedCard({
  report,
  state,
  candidateIncidentId,
  selectedIncidentId,
  onSelectIncident,
}: {
  report: Report;
  state: DeskState;
  candidateIncidentId: string | null;
} & PanelProps) {
  const { input } = report;
  const confirmedIn = state.incidents.find((i) => i.confirmedReportIds.includes(report.reportId)) ?? null;
  const target = confirmedIn?.incidentId ?? candidateIncidentId;
  const label = messageLabel(report);
  return (
    <li className="panel-card" aria-current={target !== null && target === selectedIncidentId ? 'true' : undefined}>
      <div>
        <strong>{label}</strong> · <span>Source: {input.sourceId}</span> · <span>Origin: {input.origin}</span>{' '}
        <ReportProvenanceTag provenance={report.provenance} />
      </div>
      <p className="original-text">{input.text}</p>
      <div>
        <TimeField label="Sent" value={input.sentAt} /> <TimeField label="Event" value={input.reportedEventAt} />{' '}
        <TimeField label="Received" value={report.receivedAt} />{' '}
        <span className="time-field">Receive #{report.receiveSequence}</span>
      </div>
      {arrivedLate(report, state.reports) && (
        <span className="change-flag">Sent earlier than a report already received · arrived late</span>
      )}
      <div>
        {input.reportedLocation ? (
          <span>
            Location: {input.reportedLocation.placeId} ({LOCATION_SOURCE[input.reportedLocation.source]})
          </span>
        ) : (
          <span className="muted">location not given</span>
        )}
      </div>
      <div>
        {confirmedIn ? (
          <span>Confirmed in {confirmedIn.incidentId}</span>
        ) : (
          <span>Not yet confirmed{candidateIncidentId ? ` · candidate ${candidateIncidentId}` : ''}</span>
        )}
      </div>
      {target && (
        <div className="panel-actions">
          <button type="button" className="card-select" onClick={() => onSelectIncident(target)}>
            Select {target} ({label})
          </button>
        </div>
      )}
    </li>
  );
}
