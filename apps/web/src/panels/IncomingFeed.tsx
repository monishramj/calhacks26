// Incoming feed (§5, §9): every original, newest first, verbatim, with sent / event /
// receive times kept separate and labeled. Read-only; selection is the only action.
import { useState } from 'react';
import type { DeskState, Report } from '../adapters/contract';
import { useDesk } from '../adapters/DeskContext';
import { reviewBand, timeline } from '../adapters/derived';
import type { PanelProps } from './index';
import { ReportDetails, messageLabel, placeName } from './shared';

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
  const [selectedReportId, setSelectedReportId] = useState<string | null>(null);
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
          selected={selectedReportId === report.reportId}
          onSelectIncident={(id) => { setSelectedReportId(report.reportId); onSelectIncident(id); }}
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
  selected,
}: {
  report: Report;
  state: DeskState;
  candidateIncidentId: string | null;
  selected: boolean;
} & PanelProps) {
  const { input } = report;
  const confirmedIn = state.incidents.find((i) => i.confirmedReportIds.includes(report.reportId)) ?? null;
  const target = confirmedIn?.incidentId ?? candidateIncidentId;
  const label = messageLabel(report);
  return (
    <li className={`panel-card${selected ? ' selected' : ''}`} aria-current={target !== null && target === selectedIncidentId ? 'true' : undefined}>
      <button type="button" className="card-select" aria-label={`Select ${target ?? 'report'} (${label})`} onClick={() => onSelectIncident(target)}>
        <p className="original-text">{input.text}</p>
        <span className="report-meta"><strong>{placeName(input.reportedLocation?.placeId)}</strong><span className="muted">{confirmedIn ? 'Confirmed' : 'Unconfirmed'}</span></span>
      </button>
      {selected && <details className="item-details">
        <summary>Details</summary>
        <ReportDetails report={report} />
        {arrivedLate(report, state.reports) && <p className="change-flag">Arrived late · sent before a report already received</p>}
      </details>}
    </li>
  );
}
