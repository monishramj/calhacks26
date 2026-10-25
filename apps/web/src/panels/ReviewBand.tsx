// Pinned review band (§5): unconfirmed possible life-safety concerns, contradictions,
// unknowns. Nothing here changes the confirmed queue until the operator approves.
import { useState } from 'react';
import type { DeskState, LocalSuggestion, Report } from '../adapters/contract';
import { reviewBand, type ReviewItem } from '../adapters/derived';
import { useDesk } from '../adapters/DeskContext';
import type { PanelProps } from './index';
import { AttentionTag, ProvenanceTag, TimeField, messageLabel, useCommand } from './shared';

const KIND_CLASS: Record<ReviewItem['kind'], string> = {
  POSSIBLE_LIFE_SAFETY: 'tag-life-safety',
  CONTRADICTION: 'tag-active-need',
  UNKNOWN: 'tag-unknown',
  PENDING_CHANGE: 'tag-information',
};

export function ReviewBand({ selectedIncidentId, onSelectIncident }: PanelProps) {
  const { state } = useDesk();
  if (!state) return <p className="empty">No source connected.</p>;
  const items = reviewBand(state);
  if (items.length === 0) return <p className="empty">Nothing needs review.</p>;
  return (
    <ul className="panel-list" aria-label="Items needing review">
      {items.map((item) => (
        <ReviewCard
          key={item.reportId}
          item={item}
          state={state}
          selected={item.incidentId !== null && item.incidentId === selectedIncidentId}
          onSelectIncident={onSelectIncident}
        />
      ))}
    </ul>
  );
}

function ReviewCard({
  item,
  state,
  selected,
  onSelectIncident,
}: {
  item: ReviewItem;
  state: DeskState;
  selected: boolean;
  onSelectIncident: PanelProps['onSelectIncident'];
}) {
  const { run, error, busy } = useCommand();
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState('');
  const report = state.reports.find((r) => r.reportId === item.reportId);
  if (!report) return null;
  const suggestion: LocalSuggestion | undefined = state.suggestions.find((s) => s.suggestion.reportId === item.reportId)?.suggestion;
  const proposal = item.proposal && item.proposal.reviewState === 'PENDING' ? item.proposal.proposal : null;
  const msgId = (reportId: string) =>
    state.reports.find((r: Report) => r.reportId === reportId)?.input.messageId ?? reportId;

  async function approve() {
    if (!proposal) return;
    // Send what the operator saw; the adapter re-validates it against current state.
    await run((a, runId, commandId) =>
      a.approveProposal({
        runId,
        commandId,
        proposalId: proposal.proposalId,
        inputSignature: proposal.inputSignature,
        baseIncidentVersions: proposal.baseIncidentVersions,
      }),
    );
  }
  async function reject() {
    if (!proposal || !reason.trim()) return;
    const r = await run((a, runId, commandId) =>
      a.rejectProposal({ runId, commandId, proposalId: proposal.proposalId, reason: reason.trim() }),
    );
    if (r?.ok) {
      setRejecting(false);
      setReason('');
    }
  }

  return (
    <li className={`panel-card${selected ? ' selected' : ''}`} data-testid={`review-${report.input.messageId}`}>
      <button
        type="button"
        className="card-select"
        aria-current={selected ? 'true' : undefined}
        disabled={!item.incidentId}
        onClick={() => item.incidentId && onSelectIncident(item.incidentId)}
      >
        <span className={`tag ${KIND_CLASS[item.kind]}`}>{item.label}</span>
        <span className="muted">{messageLabel(report)}</span>
        <p className="original-text">{report.input.text}</p>
        <TimeField label="Sent" value={report.input.sentAt} />
        <TimeField label="Received" value={report.receivedAt} />
        <div className="muted">
          Candidate incident: {item.incidentId ?? 'none'}
        </div>
      </button>
      {suggestion ? (
        <div className="muted">
          Suggestion: <ProvenanceTag provider={suggestion.provider} />
          {suggestion.scores.length > 0 && (
            <span>
              model score over options:{' '}
              {suggestion.scores.map((s) => `${s.label} ${s.value}`).join(', ')}
            </span>
          )}
        </div>
      ) : null}
      {!suggestion && !proposal && <div className="muted">No suggestion · manual review</div>}
      {proposal && (
        <div>
          <div className="muted">
            Proposal for {proposal.incidentId} by <ProvenanceTag provider={proposal.provider} />
          </div>
          {proposal.relations.length > 0 && (
            <ul className="muted" aria-label="Relations">
              {proposal.relations.map((r) => (
                <li key={`${r.reportId}-${r.targetReportId}-${r.kind}`}>
                  {msgId(r.reportId)} {r.kind.toLowerCase()} of {msgId(r.targetReportId)}
                </li>
              ))}
            </ul>
          )}
          {proposal.suggestedAttention !== null && (
            <div className="muted">
              Suggested attention: <AttentionTag attention={proposal.suggestedAttention} />
            </div>
          )}
          {proposal.uncertainties.length > 0 && (
            <ul className="muted" aria-label="Uncertainties">
              {proposal.uncertainties.map((u) => (
                <li key={u}>{u}</li>
              ))}
            </ul>
          )}
          <div className="panel-actions">
            <button type="button" onClick={approve} disabled={busy}>
              Approve
            </button>
            {!rejecting ? (
              <button type="button" onClick={() => setRejecting(true)} disabled={busy}>
                Reject
              </button>
            ) : (
              <>
                <label>
                  Reason for rejecting{' '}
                  <input value={reason} onChange={(e) => setReason(e.target.value)} />
                </label>
                <button type="button" onClick={reject} disabled={busy || !reason.trim()}>
                  Confirm reject
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setRejecting(false);
                    setReason('');
                  }}
                >
                  Cancel
                </button>
              </>
            )}
          </div>
        </div>
      )}
      {error && (
        <p role="alert" className="panel-error">
          {error}
        </p>
      )}
    </li>
  );
}
