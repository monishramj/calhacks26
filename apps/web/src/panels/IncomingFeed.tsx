// Incoming feed (§5, §9): every original, newest first, verbatim, with sent / event /
// receive times kept separate and labeled. Read-only; selection is the only action.
import type { KeyboardEvent } from 'react';
import type { DeskState, Report } from '../adapters/contract';
import { useDesk } from '../adapters/DeskContext';
import { reviewBand, timeline } from '../adapters/derived';
import type { PanelProps } from './index';
import { formatTime, messageLabel } from './shared';

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
    <li
      className="panel-card"
      aria-current={target !== null && target === selectedIncidentId ? 'true' : undefined}
      {...(target && {
        role: 'button',
        tabIndex: 0,
        'aria-label': `Select ${target} (${label})`,
        onClick: () => onSelectIncident(target),
        onKeyDown: (e: KeyboardEvent<HTMLLIElement>) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onSelectIncident(target);
          }
        },
      })}
    >
      <div>
        <strong>{input.messageId}</strong> · {input.sourceId} · sent {input.sentAt ? formatTime(input.sentAt).slice(0, 5) : 'not given'}
        {input.origin !== 'radio' && <span className="tag tag-provenance" style={{ float: 'right' }}>{input.origin}</span>}
      </div>
      <p className="original-text">{input.text}</p>
      {arrivedLate(report, state.reports) && (
        <span className="change-flag">Sent earlier than a report already received · arrived late</span>
      )}
      <div>
        {input.reportedLocation ? input.reportedLocation.placeId : <span className="muted">location not given</span>} ·{' '}
        {confirmedIn ? `Confirmed · ${confirmedIn.incidentId}` : `Unconfirmed${candidateIncidentId ? ` · ${candidateIncidentId}` : ''}`}
      </div>
    </li>
  );
}
