// Confirmed queue (§5): only operator-confirmed state, in derived.ts order.
// Provisional hints never reorder this list.
import { useState, type FormEvent } from 'react';
import type { Attention, IncidentView } from '../adapters/contract';
import { ATTENTION_LABEL, confirmedQueue, needsReassessment } from '../adapters/derived';
import { useDesk } from '../adapters/DeskContext';
import type { PanelProps } from './index';
import { AttentionTag, useCommand } from './shared';

export function ConfirmedQueue({ selectedIncidentId, onSelectIncident }: PanelProps) {
  const { state } = useDesk();
  if (!state) return <p className="empty">No source connected.</p>;
  const queue = confirmedQueue(state.incidents);
  if (queue.length === 0) return <p className="empty">No confirmed incidents.</p>;
  const flagged = needsReassessment(state);
  return (
    <ol className="panel-list" aria-label="Confirmed incidents in queue order">
      {queue.map((incident, i) => (
        <QueueCard
          key={incident.incidentId}
          rank={i + 1}
          incident={incident}
          flagged={flagged.has(incident.incidentId)}
          selected={incident.incidentId === selectedIncidentId}
          onSelectIncident={onSelectIncident}
        />
      ))}
    </ol>
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
  return (
    <li className={`panel-card${selected ? ' selected' : ''}`} data-testid={`queue-${incident.incidentId}`}>
      <button
        type="button"
        className="card-select"
        aria-current={selected ? 'true' : undefined}
        onClick={() => onSelectIncident(incident.incidentId)}
      >
        <strong data-testid="rank">{rank}.</strong> <strong>{incident.incidentId}</strong>{' '}
        <AttentionTag attention={incident.attention} />
        <span className="muted">{incident.confirmedPlaceId ?? 'location unknown'}</span>
        <p className="original-text">{incident.summary ?? <em>No summary</em>}</p>
        <span className="muted">
          rev {incident.revision} · {incident.confirmedReportIds.length} confirmed report
          {incident.confirmedReportIds.length === 1 ? '' : 's'} · open since #{incident.openCycleStartSequence}
        </span>
        {flagged && (
          <>
            {' '}
            <span className="change-flag">New evidence · needs reassessment</span>
          </>
        )}
      </button>
      <OverrideControl incident={incident} />
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
        attention: attention === 'UNKNOWN' ? null : attention,
        status,
        reason: reason.trim(),
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
