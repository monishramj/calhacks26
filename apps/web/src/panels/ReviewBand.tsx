// Pinned review band (§5): unconfirmed possible life-safety concerns, contradictions,
// unknowns. Nothing here changes the confirmed queue until the operator approves.
import { useState } from 'react';
import type { Attention, DeskState, LabelScore, LocalAction, LocalSuggestion, Report } from '../adapters/contract';
import { ATTENTION_LABEL, reviewBand, type ReviewItem } from '../adapters/derived';
import { useDesk } from '../adapters/DeskContext';
import type { PanelProps } from './index';
import { AttentionTag, ReportDetails, URGENCY_LABEL, placeName, useCommand } from './shared';

const ACTION_LABEL: Record<LocalAction, string> = {
  NEW_INCIDENT: 'New incident', ATTACH_REPORT: 'Add to incident', FLAG_CORRECTION: 'Correct earlier report',
  FLAG_CONFLICT: 'Check conflicting reports', REQUEST_REVIEW: 'Review report',
};
const topScore = (scores: LabelScore[], labels: Record<string, string>) =>
  scores.filter((s) => Object.hasOwn(labels, s.label) && Number.isFinite(s.value)).sort((a, b) => b.value - a.value)[0];
const scoreText = (score: LabelScore) => score.kind === 'probability' ? `${Math.round(score.value * 100)}%` : `${score.value} score`;

// shortcut: optional check fields until the domain contract exposes Claude checks; replace with its type then.
type ClaudeCheck = { reportId: string; summary?: string | null; reason?: string | null };

export function ReviewBand({ selectedIncidentId, onSelectIncident }: PanelProps) {
  const { state } = useDesk();
  const [selectedReportId, setSelectedReportId] = useState<string | null>(null);
  if (!state) return <p className="empty">No source connected.</p>;
  const items = reviewBand(state);
  const active = items.find((i) => i.reportId === selectedReportId && i.incidentId === selectedIncidentId)
    ?? items.find((i) => selectedIncidentId !== null && i.incidentId === selectedIncidentId);
  if (items.length === 0) return <p className="empty">Nothing needs review.</p>;
  return (
    <ul className="panel-list" aria-label="Items needing review">
      {items.map((item) => (
        <ReviewCard
          key={item.reportId ?? `inc:${item.incidentId}`}
          item={item}
          state={state}
          selected={item === active}
          onSelectIncident={() => { setSelectedReportId(item.reportId); onSelectIncident(item.incidentId); }}
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
  if (!report) return null; // incident-level unknown (no report) is not shown as a card yet
  const suggestion: LocalSuggestion | undefined = state.suggestions.find((s) => s.suggestion.reportId === item.reportId)?.suggestion;
  const proposal = state.proposals.find((p) => p.reviewState === 'PENDING' && p.proposal.addReportIds.includes(item.reportId!))?.proposal ?? null;
  const check = (state as DeskState & { claudeChecks?: ClaudeCheck[] }).claudeChecks?.find((c) => c.reportId === report.reportId);
  const attentionScore = topScore(suggestion?.scores ?? [], URGENCY_LABEL);
  const actionScore = topScore(suggestion?.scores ?? [], ACTION_LABEL);

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
    <li className={`panel-card${selected ? ' selected' : ''}`} data-testid={`review-${report.input.messageId}`}
      onKeyDown={(e) => {
        // A approves what the card suggests (the first Approve button); typing in a field never triggers it.
        if (e.altKey || e.ctrlKey || e.metaKey || e.key.toLowerCase() !== 'a' || (e.target as HTMLElement).closest('input, select, textarea')) return;
        e.preventDefault();
        (e.currentTarget.querySelector('[data-approve]') as HTMLButtonElement | null)?.click();
      }}>
      <button
        type="button"
        className="card-select"
        aria-current={selected ? 'true' : undefined}
        onClick={() => onSelectIncident(item.incidentId)}
      >
        <p className="original-text">{report.input.text}</p>
        <span className="report-meta">
          <strong>{placeName(report.input.reportedLocation?.placeId)}</strong>
          <AttentionTag attention={proposal?.suggestedAttention ?? suggestion?.attention ?? null} />
          <span className="muted">Unconfirmed</span>
        </span>
      </button>
      {(suggestion || check?.summary || check?.reason || proposal?.suggestedSummary) && <div className="ai-block">
        <span className="ai-label">AI</span>
        <div>
          {suggestion && <p>Laya · {attentionScore && <>{URGENCY_LABEL[attentionScore.label as Attention]} {scoreText(attentionScore)} · </>}
            {ACTION_LABEL[(actionScore?.label as LocalAction) ?? suggestion.action]}
            {actionScore && ` · ${scoreText(actionScore)}`}
          </p>}
          {(check?.summary || proposal?.suggestedSummary) && <p className="ai-summary" title={check?.summary || proposal?.suggestedSummary || undefined}>Claude · {check?.summary || proposal?.suggestedSummary}</p>}
          {check?.reason && <p className="muted ai-reason" title={check.reason}>{check.reason}</p>}
        </div>
      </div>}
      {suggestion && !proposal && <SuggestionApprove report={report} suggestion={suggestion} state={state} selected={selected} />}
      {!suggestion && !proposal && <p className="muted">Waiting for AI review</p>}
      {proposal && <>
        <div className="panel-actions">
          <button type="button" data-approve onClick={approve} disabled={busy}>Approve</button>
          {!rejecting ? <button type="button" onClick={() => setRejecting(true)} disabled={busy}>Reject</button> : <>
            <label>Reason for rejecting <input value={reason} onChange={(e) => setReason(e.target.value)} /></label>
            <button type="button" onClick={reject} disabled={busy || !reason.trim()}>Confirm reject</button>
            <button type="button" onClick={() => { setRejecting(false); setReason(''); }}>Cancel</button>
          </>}
        </div>
        {selected && <details className="item-details">
          <summary>Details</summary>
          <ReportDetails report={report} />
          <p>Suggestion: {suggestion?.provider ?? 'none'} · Review: {proposal.provider}</p>
          <p>Incident: {proposal.incidentId}</p>
          {proposal.relations.length > 0 && <ul aria-label="Relations">{proposal.relations.map((r) =>
            <li key={`${r.reportId}-${r.targetReportId}-${r.kind}`}>{r.reportId} {r.kind.toLowerCase()} of {r.targetReportId}</li>)}</ul>}
          {proposal.uncertainties.length > 0 && <ul aria-label="Uncertainties">{proposal.uncertainties.map((u) => <li key={u}>{u}</li>)}</ul>}
        </details>}
      </>}
      {selected && !suggestion && !proposal && <details className="item-details"><summary>Details</summary><ReportDetails report={report} /></details>}
      {error && (
        <p role="alert" className="panel-error">
          {error}
        </p>
      )}
    </li>
  );
}

const ATTENTION_CHOICES = Object.keys(ATTENTION_LABEL) as Attention[];

/**
 * The operator approves a local suggestion by naming the incident and attention, through operator_edit
 * (the source report is recorded as the reason). Prefilled with the suggestion and an incident ID from the
 * stated place, so approving as suggested is one click (or A). Nothing applies until then.
 */
function SuggestionApprove({ report, suggestion, state, selected }: { report: Report; suggestion: LocalSuggestion; state: DeskState; selected: boolean }) {
  const { run, error, busy } = useCommand();
  const open = state.incidents.filter((i) => i.status === 'OPEN');
  const [target, setTarget] = useState(suggestion.candidateIncidentId ?? '');
  const place = report.input.reportedLocation?.placeId;
  const [newId, setNewId] = useState(() => {
    const base = `INC-${place ?? report.input.messageId}`;
    return state.incidents.some((i) => i.incidentId === base) ? `${base}-${report.input.messageId}` : base;
  });
  const [attention, setAttention] = useState<Attention | 'UNKNOWN'>(suggestion.attention ?? 'UNKNOWN');
  const incident = open.find((i) => i.incidentId === target);
  const incidentId = incident ? incident.incidentId : newId.trim();
  const valid = incident !== undefined || /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(incidentId);

  async function approve() {
    const att = attention === 'UNKNOWN' ? null : attention;
    await run((a, runId, commandId) =>
      a.operatorEdit({
        runId,
        commandId,
        incidentId,
        baseRevision: incident?.revision ?? 0,
        changes: incident
          ? { addReportIds: [report.reportId], attention: att }
          : { status: 'OPEN', attention: att, addReportIds: [report.reportId], confirmedPlaceId: report.input.reportedLocation?.placeId ?? null },
        reason: null,
        sourceReportIds: [report.reportId],
      }),
    );
  }

  return (
    <div>
      <div className="panel-actions">
        <button type="button" data-approve onClick={approve} disabled={busy || !valid}>Approve</button>
        <button type="button" disabled title="Rejection is available when the review is ready">Reject</button>
      </div>
      {selected && <details className="item-details">
        <summary>Details</summary>
        <ReportDetails report={report} />
        <p>Suggestion: {suggestion.provider}</p>
        <div className="panel-actions">
          <label>
            Target{' '}
            <select value={incident ? target : ''} onChange={(e) => setTarget(e.target.value)}>
              <option value="">New incident</option>
              {open.map((i) => (
                <option key={i.incidentId} value={i.incidentId}>
                  {placeName(i.confirmedPlaceId)}
                </option>
              ))}
            </select>
          </label>
          {!incident && (
            <label>
              New incident ID <input value={newId} onChange={(e) => setNewId(e.target.value)} />
            </label>
          )}
          <label>
            Attention{' '}
            <select value={attention} onChange={(e) => setAttention(e.target.value as Attention | 'UNKNOWN')}>
              {ATTENTION_CHOICES.map((a) => (
                <option key={a} value={a}>
                  {ATTENTION_LABEL[a]}
                </option>
              ))}
              <option value="UNKNOWN">Unknown</option>
            </select>
          </label>
        </div>
      </details>}
      {error && (
        <p role="alert" className="panel-error">
          {error}
        </p>
      )}
    </div>
  );
}
