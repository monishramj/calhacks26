// Claude hierarchy: every incident's working picture merged into one tree. Sites are grouped by the kind Claude
// gave them and ranked by severity, then report count; each site shows its subareas and cited claims.
// Unconfirmed working state, never the queue. New nodes fade in as pictures arrive.
import type { Attention, IncidentPicture, PictureSite } from '../adapters/contract';
import { useDesk } from '../adapters/DeskContext';
import { AttentionTag, placeName } from '../panels/shared';
import type { PanelProps } from '../panels';
import './hierarchy.css';

const RANK: Record<Attention, number> = { POSSIBLE_LIFE_SAFETY: 3, ACTIVE_NEED: 2, INFORMATION: 1 };
const rank = (a: Attention | null) => (a ? RANK[a] : 0);
const worst = (xs: (Attention | null)[]) => xs.reduce<Attention | null>((w, a) => (rank(a) > rank(w) ? a : w), null);
const sev = (a: Attention | null) => (a ? `sev-${a.toLowerCase().replace(/_/g, '-')}` : 'sev-unknown');
const KIND_LABEL: Record<PictureSite['siteKind'], string> = { school: 'Schools', shelter: 'Shelters', residence: 'Residences', other: 'Other sites' };
const short = (id: string) => id.split(':').pop();
const n = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`;

type Site = PictureSite & { incidentId: string; area: string; stale: boolean };

export function ClaudeHierarchy({ selectedIncidentId, onSelectIncident, onOpenDesk }: PanelProps & { onOpenDesk: () => void }) {
  const { state } = useDesk();
  if (!state) return <main className="hierarchy"><p className="empty">No source connected.</p></main>;
  const pictures: IncidentPicture[] = state.pictures ?? [];
  const sites: Site[] = pictures.flatMap((p) => p.areas.flatMap((a) =>
    a.sites.map((s) => ({ ...s, incidentId: p.incidentId, area: a.label, stale: p.status === 'STALE' }))));
  const kinds = (Object.keys(KIND_LABEL) as PictureSite['siteKind'][])
    .map((kind) => ({
      kind,
      sites: sites.filter((s) => s.siteKind === kind).sort((a, b) => rank(b.severity) - rank(a.severity) || b.reportIds.length - a.reportIds.length),
    }))
    .filter((k) => k.sites.length > 0)
    .sort((a, b) => rank(worst(b.sites.map((s) => s.severity))) - rank(worst(a.sites.map((s) => s.severity))));
  const pictured = new Set(pictures.map((p) => p.incidentId));
  const waiting = state.incidents.filter((i) => !pictured.has(i.incidentId));
  const cited = new Set(sites.flatMap((s) => s.reportIds));
  const open = (incidentId: string) => { onSelectIncident(incidentId); onOpenDesk(); };

  return (
    <main className="hierarchy" aria-label="Claude hierarchy">
      <div className="tree">
        <div className="branch">
          <div className="node root">
            <strong>Outer Sunset</strong>
            <span className="muted">{n(state.reports.length, 'report')} · {n(state.incidents.length, 'incident')}</span>
            <span className="muted">{n(cited.size, 'report')} placed by Claude in {n(sites.length, 'site')}</span>
          </div>
          {(kinds.length > 0 || waiting.length > 0) && <div className="children">
            {kinds.map(({ kind, sites: group }) => (
              <div className="branch" key={kind}>
                <div className={`node group ${sev(worst(group.map((s) => s.severity)))}`}>
                  <span className="kind">Site kind</span>
                  <strong>{KIND_LABEL[kind]}</strong>
                  <span className="muted">{n(group.length, 'site')} · {n(new Set(group.flatMap((s) => s.reportIds)).size, 'report')}</span>
                </div>
                <div className="children">
                  {group.map((s) => (
                    <div className="branch" key={`${s.incidentId}:${s.label}`}>
                      <button type="button" className={`node site ${sev(s.severity)}${s.incidentId === selectedIncidentId ? ' selected' : ''}`}
                        onClick={() => open(s.incidentId)} title="Show on the desk">
                        <span className="kind">{s.area} · {s.incidentId}</span>
                        <strong>{s.label}</strong>
                        <span className="node-meta"><AttentionTag attention={s.severity} /><span className="muted">{n(s.reportIds.length, 'report')}</span>
                          {s.stale && <span className="updating">Claude updating…</span>}</span>
                        {s.conflicts[0] && <span className="change-flag">Conflict: {s.conflicts[0]}</span>}
                      </button>
                      {s.subareas.length > 0 && <div className="children">
                        {s.subareas.map((sub) => (
                          <div className="branch" key={sub.label}>
                            <div className={`node subarea ${sev(sub.severity)}`}>
                              <span className="kind">Subarea · {n(sub.reportIds.length, 'report')}</span>
                              <strong>{sub.label}</strong>
                              <ul className="claims">
                                {sub.claims.slice(0, 3).map((c) => (
                                  <li key={c.text}>{c.text} <span className="cites">{c.reportIds.map(short).join(' ')}</span></li>
                                ))}
                              </ul>
                              {sub.chronology.some((c) => c.late) && <span className="change-flag">Late report kept below newer ones</span>}
                              {sub.uncertainties[0] && <span className="muted uncertain" title={sub.uncertainties.join('; ')}>Uncertain: {sub.uncertainties[0]}</span>}
                            </div>
                          </div>
                        ))}
                      </div>}
                    </div>
                  ))}
                </div>
              </div>
            ))}
            {waiting.length > 0 && <div className="branch">
              <div className="node group sev-unknown">
                <span className="kind">Confirmed, no picture yet</span>
                <strong>Waiting for Claude</strong>
                <span className="muted">{n(waiting.length, 'incident')}</span>
              </div>
              <div className="children">
                {waiting.map((i) => (
                  <div className="branch" key={i.incidentId}>
                    <button type="button" className={`node site ${sev(i.attention)}`} onClick={() => open(i.incidentId)}>
                      <span className="kind">{i.incidentId}</span>
                      <strong>{placeName(i.confirmedPlaceId)}</strong>
                      <span className="muted">{n(i.confirmedReportIds.length, 'report')}</span>
                    </button>
                  </div>
                ))}
              </div>
            </div>}
          </div>}
        </div>
      </div>
      {pictures.length === 0 && <p className="empty">Claude builds the hierarchy as reports are confirmed. Press Play.</p>}
    </main>
  );
}
