// Claude's working picture (unconfirmed): area -> site -> subarea -> claims, for the selected incident or all.
// It is working state for the operator. Only an approved proposal changes the confirmed queue.
import { useState } from 'react';
import type { IncidentPicture, PictureNode, Report } from '../adapters/contract';
import { useDesk } from '../adapters/DeskContext';
import { AttentionTag } from './shared';

export function PicturePanel({ selectedIncidentId }: { selectedIncidentId: string | null }) {
  const { state } = useDesk();
  const [highlight, setHighlight] = useState<string | null>(null);
  if (!state) return <p className="panel-empty">Not connected.</p>;
  const pictures = (state.pictures ?? []).filter((p) => !selectedIncidentId || p.incidentId === selectedIncidentId);
  if (pictures.length === 0) {
    return <p className="panel-empty">No working picture yet. Claude writes one for each open incident after reports arrive.</p>;
  }
  const label = (reportId: string | null) => {
    if (!reportId) return '';
    const r: Report | undefined = state.reports.find((x) => x.reportId === reportId);
    return r ? r.input.messageId : reportId;
  };
  const chip = (reportId: string) => (
    <button
      key={reportId}
      type="button"
      className={`picture-chip${highlight === reportId ? ' active' : ''}`}
      aria-pressed={highlight === reportId}
      onClick={() => setHighlight(highlight === reportId ? null : reportId)}
    >
      {label(reportId)}
    </button>
  );
  const notes = (n: PictureNode) => (
    <>
      {n.chronology.filter((e) => e.late || e.supersedesReportId).map((e) => (
        <p key={e.reportId} className="picture-note">
          {label(e.reportId)}
          {e.late ? ' · late (sent before a newer report; does not override)' : ''}
          {e.supersedesReportId ? ` · supersedes ${label(e.supersedesReportId)}` : ''}
        </p>
      ))}
      {n.uncertainties.map((u) => (
        <p key={u} className="picture-note">Uncertain: {u}</p>
      ))}
      {n.conflicts.map((c) => (
        <p key={c} className="picture-note">Conflict: {c}</p>
      ))}
    </>
  );
  return (
    <div className="picture">
      <p className="panel-note">Unconfirmed. Claude's working picture, not the confirmed queue.</p>
      {pictures.map((p: IncidentPicture) => (
        <article key={p.incidentId} className="picture-incident">
          <h3>
            {p.incidentId} <span className="tag tag-provenance">Claude (model output)</span>
          </h3>
          {p.status === 'STALE' ? (
            <p className="picture-stale" role="status">
              Stale since {label(p.staleSinceReportId)}: Claude has not updated this picture yet. It still shows reports up to #{p.throughSequence}.
            </p>
          ) : (
            <p className="panel-note">Current through receive #{p.throughSequence}.</p>
          )}
          {p.areas.map((a) => (
            <div key={a.label} className="picture-node">
              <strong>{a.label}</strong> <AttentionTag attention={a.severity} />
              {notes(a)}
              {a.sites.map((s) => (
                <div key={s.label} className="picture-node picture-site">
                  <span>{s.siteKind} · {s.label}</span> <AttentionTag attention={s.severity} />
                  {notes(s)}
                  {s.subareas.map((x) => (
                    <div key={x.label} className="picture-node picture-subarea">
                      <span>{x.label}</span> <AttentionTag attention={x.severity} />
                      {x.claims.map((c) => (
                        <p key={c.text} className="picture-claim">
                          {c.text} {c.reportIds.map(chip)}
                        </p>
                      ))}
                      {notes(x)}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          ))}
          {highlight && p.areas.length > 0 && <p className="panel-note">Highlighted: {label(highlight)}</p>}
        </article>
      ))}
    </div>
  );
}
