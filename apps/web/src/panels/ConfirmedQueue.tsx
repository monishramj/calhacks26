// Confirmed queue: backend-confirmed state, in derived.ts order.
// Provisional hints never reorder this list.
import { useState, type FormEvent, type KeyboardEvent } from 'react';
import type { Attention, IncidentView } from '../adapters/contract';
import { ATTENTION_LABEL, confirmedQueue, needsReassessment } from '../adapters/derived';
import { useDesk } from '../adapters/DeskContext';
import type { PanelProps } from './index';
import { AttentionTag, RelativeAge, pictureClaims, placeName, useCommand } from './shared';

const FILTERS: { id: Attention | 'ALL'; label: string }[] = [
  { id: 'ALL', label: 'All' },
  { id: 'POSSIBLE_LIFE_SAFETY', label: 'Life safety' },
  { id: 'ACTIVE_NEED', label: 'Need' },
  { id: 'INFORMATION', label: 'Info' },
];

export function ConfirmedQueue({ selectedIncidentId, onSelectIncident }: PanelProps) {
  const { state } = useDesk();
  const [filter, setFilter] = useState<Attention | 'ALL'>('ALL');
  if (!state) return <p className="empty">No source connected.</p>;
  const queue = confirmedQueue(state);
  if (queue.length === 0) return <p className="empty">No confirmed incidents.</p>;
  const flagged = needsReassessment(state);
  const shown = queue.map((incident, i) => ({ incident, rank: i + 1 })).filter(({ incident }) => filter === 'ALL' || incident.attention === filter);
  // Up/Down move the selection through the visible rows (the scene follows the selection).
  function onKeyDown(e: KeyboardEvent) {
    if ((e.target as HTMLElement).closest('input, select, textarea')) return;
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();
    const at = shown.findIndex((row) => row.incident.incidentId === selectedIncidentId);
    const next = shown[Math.max(0, Math.min(shown.length - 1, at + (e.key === 'ArrowDown' ? 1 : -1)))];
    if (next) onSelectIncident(next.incident.incidentId);
    requestAnimationFrame(() => document.querySelector<HTMLButtonElement>(`[data-testid="queue-${next?.incident.incidentId}"] .card-select`)?.focus());
  }
  return (
    <>
      <div className="queue-filters" role="group" aria-label="Filter by attention">
        {FILTERS.map((f) => {
          const n = f.id === 'ALL' ? queue.length : queue.filter((i) => i.attention === f.id).length;
          return <button key={f.id} type="button" aria-pressed={filter === f.id} onClick={() => setFilter(f.id)}>{f.label} {n}</button>;
        })}
      </div>
      <ol className="panel-list queue-list" aria-label="Confirmed incidents in queue order" onKeyDown={onKeyDown}>
        {shown.map(({ incident, rank }) => (
          <QueueCard
            key={incident.incidentId}
            rank={rank}
            incident={incident}
            flagged={flagged.has(incident.incidentId)}
            selected={incident.incidentId === selectedIncidentId}
            onSelectIncident={onSelectIncident}
          />
        ))}
      </ol>
    </>
  );
}

function QueueCard({
  rank,
  incident,
  flagged,
  selected,
  onSelectIncident,
}: {
  rank: number;
  incident: IncidentView;
  flagged: boolean;
  selected: boolean;
  onSelectIncident: PanelProps['onSelectIncident'];
}) {
  const { state } = useDesk();
  const reports = state?.reports.filter((r) => incident.confirmedReportIds.includes(r.reportId)).sort((a, b) => a.receiveSequence - b.receiveSequence) ?? [];
  const picture = state?.pictures?.find((p) => p.incidentId === incident.incidentId);
  const summary = incident.summary ?? pictureClaims(picture)[0];
  const lastReview = state?.reviewEvents.filter((e) => e.incidentId === incident.incidentId && e.acceptedChanges.length > 0).sort((a, b) => b.sequence - a.sequence)[0];
  const autoConfirmed = (lastReview?.actorRole as string | undefined) === 'claude_check';
  return (
    <li className={`panel-card queue-row${selected ? ' selected' : ''}`} data-testid={`queue-${incident.incidentId}`}>
      <button
        type="button"
        className="card-select"
        aria-current={selected ? 'true' : undefined}
        onClick={() => onSelectIncident(incident.incidentId)}
      >
        <span className="queue-line">
          <strong data-testid="rank">{rank}.</strong> <AttentionTag attention={incident.attention} />{' '}
          <strong className="queue-place">{placeName(incident.confirmedPlaceId)}</strong>
          <RelativeAge since={reports[0]?.receivedAt} />
        </span>
        {summary && <p className="queue-summary" title={summary}>{!incident.summary && <span className="muted">Unconfirmed · </span>}{summary}</p>}
        {flagged && <span className="change-flag">New report · review needed</span>}
        {autoConfirmed && <span className="tag auto-confirmed">Auto-confirmed · Laya + Claude agree</span>}
      </button>
      {selected && <details className="item-details">
        <summary>Details</summary>
        <p>Incident: {incident.incidentId} · Revision {incident.revision}</p>
        <p>{reports.length} confirmed reports · {Array.from(new Set(reports.map((r) => r.provenance))).join(', ')}</p>
        {state?.relations.filter((r) => r.incidentId === incident.incidentId).map((r) =>
          <p key={r.relationId}>{r.reportId} {r.kind.toLowerCase()} of {r.targetReportId} · {r.state.toLowerCase()}</p>)}
      </details>}
      {selected && <OverrideControl incident={incident} />}
    </li>
  );
}

type AttentionChoice = Attention | 'UNKNOWN';

function OverrideControl({ incident }: { incident: IncidentView }) {
  const { run, error, busy } = useCommand();
  const [open, setOpen] = useState(false);
  const [attention, setAttention] = useState<AttentionChoice>(incident.attention ?? 'UNKNOWN');
  const [status, setStatus] = useState<'OPEN' | 'RESOLVED'>(incident.status);
  const [reason, setReason] = useState('');
  const id = incident.incidentId;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!reason.trim()) return;
    const r = await run((a, runId, commandId) =>
      a.operatorEdit({
        runId,
        commandId,
        incidentId: id,
        baseRevision: incident.revision,
        changes: { attention: attention === 'UNKNOWN' ? null : attention, status },
        reason: reason.trim(),
        sourceReportIds: [],
      }),
    );
    if (r?.ok) {
      setOpen(false);
      setReason('');
    }
  }

  return (
    <div>
      {!open ? (
        <div className="panel-actions">
          <button
            type="button"
            aria-label={`Override ${id}`}
            onClick={() => {
              setAttention(incident.attention ?? 'UNKNOWN');
              setStatus(incident.status);
              setOpen(true);
            }}
          >
            Override
          </button>
        </div>
      ) : (
        <form className="panel-actions" onSubmit={submit} aria-label={`Override ${id}`}>
          <label>
            Attention{' '}
            <select value={attention} onChange={(e) => setAttention(e.target.value as AttentionChoice)}>
              {(Object.keys(ATTENTION_LABEL) as Attention[]).map((a) => (
                <option key={a} value={a}>
                  {ATTENTION_LABEL[a]}
                </option>
              ))}
              <option value="UNKNOWN">Unknown</option>
            </select>
          </label>
          <label>
            Status{' '}
            <select value={status} onChange={(e) => setStatus(e.target.value as 'OPEN' | 'RESOLVED')}>
              <option value="OPEN">Open</option>
              <option value="RESOLVED">Resolved</option>
            </select>
          </label>
          <label>
            Reason for override <input value={reason} onChange={(e) => setReason(e.target.value)} />
          </label>
          <button type="submit" disabled={busy || !reason.trim()}>
            Apply override
          </button>
          <button type="button" onClick={() => setOpen(false)}>
            Cancel
          </button>
        </form>
      )}
      {error && (
        <p role="alert" className="panel-error">
          {error}
        </p>
      )}
    </div>
  );
}
