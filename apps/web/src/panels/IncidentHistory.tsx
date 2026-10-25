// Selected incident history (§5, §9): current view, immutable timeline of originals in
// receive order, review events, and proposals. Read-only.
import type { ProposalRecord } from '../adapters/contract';
import { useDesk } from '../adapters/DeskContext';
import { needsReassessment, timeline } from '../adapters/derived';
import type { PanelProps } from './index';
import { AttentionTag, ProvenanceTag, TimeField, messageLabel } from './shared';

const REVIEW_STATE_LABEL: Record<ProposalRecord['reviewState'], string> = {
  PENDING: 'Pending review',
  APPROVED: 'Approved by operator',
  REJECTED: 'Rejected by operator',
};

export function IncidentHistory({ selectedIncidentId }: PanelProps) {
  const { state } = useDesk();
  if (!selectedIncidentId) return <p className="empty">Select an incident.</p>;
  if (!state) return <p className="empty">No source connected.</p>;
  const incident = state.incidents.find((i) => i.incidentId === selectedIncidentId);
  if (!incident) return <p className="empty">Incident not found.</p>;
  const id = incident.incidentId;
  const confirmed = new Set(incident.confirmedReportIds);
  const entries = timeline(state, id);
  const events = state.reviewEvents.filter((e) => e.incidentId === id).sort((a, b) => a.sequence - b.sequence);
  const proposals = state.proposals.filter((p) => p.incidentId === id);
  const msgId = (reportId: string) => state.reports.find((r) => r.reportId === reportId)?.input.messageId ?? reportId;

  return (
    <section aria-label={`History for ${id}`}>
      <div className="panel-card">
        <div>
          <strong>{id}</strong> <AttentionTag attention={incident.attention} /> · <span>Status: {incident.status}</span> ·{' '}
          <span>Rev {incident.revision}</span> · <span>Place: {incident.confirmedPlaceId ?? <em>not given</em>}</span>
        </div>
        <p>Summary: {incident.summary ?? <em>not given</em>}</p>
        {needsReassessment(state).has(id) && (
          <span className="change-flag">New evidence · summary may be out of date</span>
        )}
      </div>

      <h3>Timeline</h3>
      <ol className="panel-list" aria-label={`Timeline for ${id}, receive order`}>
        {entries.map((r) => (
          <li key={r.reportId} className="panel-card">
            <div>
              <strong>{messageLabel(r)}</strong> · <span>Source: {r.input.sourceId}</span>{' '}
              <ProvenanceTag provider={r.provenance} /> ·{' '}
              <span>{confirmed.has(r.reportId) ? 'Confirmed' : 'Pending review'}</span>
            </div>
            <p className="original-text">{r.input.text}</p>
            <div>
              <TimeField label="Sent" value={r.input.sentAt} /> <TimeField label="Event" value={r.input.reportedEventAt} />{' '}
              <TimeField label="Received" value={r.receivedAt} />{' '}
              <span className="time-field">Receive #{r.receiveSequence}</span>
            </div>
          </li>
        ))}
      </ol>

      <h3>Review history</h3>
      {events.length === 0 ? (
        <p className="muted">No review events.</p>
      ) : (
        <ol className="panel-list" aria-label={`Review history for ${id}`}>
          {events.map((e) => (
            <li key={e.sequence} className="panel-card">
              <div>
                Review #{e.sequence} · Actor: <ProvenanceTag provider={e.actor} /> · Rev {e.priorRevision} → {e.newRevision}
              </div>
              <p>Changes: {e.changes.join('; ')}</p>
              {e.reason && <p>Reason: {e.reason}</p>}
              {e.proposalId && <p>Proposal: {e.proposalId}</p>}
            </li>
          ))}
        </ol>
      )}

      <h3>Proposals</h3>
      {proposals.length === 0 ? (
        <p className="muted">No proposals.</p>
      ) : (
        <ul className="panel-list" aria-label={`Proposals for ${id}`}>
          {proposals.map((p) => (
            <li key={p.proposalId} className="panel-card">
              <div>
                <strong>{p.proposalId}</strong> ·{' '}
                <span>
                  {p.reviewState}: {REVIEW_STATE_LABEL[p.reviewState]}
                </span>{' '}
                <ProvenanceTag provider={p.provider} />
              </div>
              <p>Adds: {p.addReportIds.map(msgId).join(', ')}</p>
              {p.relations.length > 0 && (
                <p>
                  Relations:{' '}
                  {p.relations.map((rel) => `${msgId(rel.reportId)} ${rel.kind} ${msgId(rel.targetReportId)}`).join('; ')}
                </p>
              )}
              {p.uncertainties.length > 0 && (
                <ul aria-label="Uncertainties">
                  {p.uncertainties.map((u) => (
                    <li key={u}>Uncertainty: {u}</li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
