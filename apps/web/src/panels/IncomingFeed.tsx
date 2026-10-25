// Incoming feed (§5, §9), grouped by stated place: one card per place with Claude's newest one-line reading,
// how its reports were grouped into incidents, and the highest attention seen. Expanding a card lists every
// original, newest first, verbatim. Read-only; selection is the only action.
import { useState } from 'react';
import type { Attention, DeskState, Report } from '../adapters/contract';
import { useDesk } from '../adapters/DeskContext';
import type { PanelProps } from './index';
import { AttentionTag, ReportDetails, placeName } from './shared';

const RANK: Record<Attention, number> = { POSSIBLE_LIFE_SAFETY: 3, ACTIVE_NEED: 2, INFORMATION: 1 };

/** True when an earlier-received report was sent later than this one (R11-style late arrival). */
function arrivedLate(report: Report, all: Report[]): boolean {
  const sent = report.input.sentAt;
  if (!sent) return false;
  const t = Date.parse(sent);
  return all.some(
    (r) => r.receiveSequence < report.receiveSequence && r.input.sentAt !== null && Date.parse(r.input.sentAt) > t,
  );
}

type Group = { placeId: string | null; reports: Report[] };

function groups(state: DeskState): Group[] {
  const by = new Map<string | null, Report[]>();
  for (const r of state.reports) {
    const id = r.input.reportedLocation?.placeId ?? null;
    by.set(id, [...(by.get(id) ?? []), r]);
  }
  return [...by].map(([placeId, reports]) => ({ placeId, reports: reports.reverse() }))
    .sort((a, b) => b.reports[0].receiveSequence - a.reports[0].receiveSequence);
}

export function IncomingFeed({ selectedIncidentId, onSelectIncident }: PanelProps) {
  const { state } = useDesk();
  const [open, setOpen] = useState<string | null | undefined>(undefined);
  if (!state) return <p className="empty">No source connected.</p>;
  if (state.reports.length === 0) return <p className="empty">No reports received.</p>;
  const newest = state.reports.at(-1)!.reportId;
  return (
    <ol className="panel-list" aria-label="Incoming reports by place, most recent first">
      {groups(state).map((g) => (
        <PlaceCard key={g.placeId ?? 'none'} group={g} state={state} fresh={g.reports[0].reportId === newest}
          expanded={open === g.placeId} onToggle={() => setOpen(open === g.placeId ? undefined : g.placeId)}
          selectedIncidentId={selectedIncidentId} onSelectIncident={onSelectIncident} />
      ))}
    </ol>
  );
}

function PlaceCard({ group, state, fresh, expanded, onToggle, selectedIncidentId, onSelectIncident }: {
  group: Group; state: DeskState; fresh: boolean; expanded: boolean; onToggle: () => void;
} & PanelProps) {
  const ids = new Set(group.reports.map((r) => r.reportId));
  const checks = (state.checks ?? []).filter((c) => ids.has(c.check.reportId));
  const checkOf = (id: string) => checks.find((c) => c.check.reportId === id);
  const incidents = state.incidents.filter((i) => i.confirmedReportIds.some((id) => ids.has(id)));
  const confirmed = group.reports.filter((r) => incidents.some((i) => i.confirmedReportIds.includes(r.reportId))).length;
  const auto = checks.filter((c) => c.outcome === 'AUTO_CONFIRMED').length;
  const attention = [...checks.map((c) => c.check.attention), ...incidents.map((i) => i.attention)]
    .filter((a): a is Attention => a !== null).sort((a, b) => RANK[b] - RANK[a])[0] ?? null;
  const latest = group.reports.map((r) => checkOf(r.reportId)).find(Boolean);
  const target = incidents[0]?.incidentId ?? null;
  return (
    <li className={`panel-card place-card${fresh ? ' fresh' : ''}`} aria-current={target !== null && target === selectedIncidentId ? 'true' : undefined}>
      <button type="button" className="card-select" aria-expanded={expanded} onClick={() => { onToggle(); onSelectIncident(target); }}>
        <span className="report-meta">
          <strong>{placeName(group.placeId)}</strong>
          <span className="count-badge" aria-label={`${group.reports.length} reports`}>{group.reports.length}</span>
          <AttentionTag attention={attention} />
        </span>
        {latest && <p className="ai-summary place-summary"><span className="ai-label">Claude</span> {latest.check.summary}</p>}
        <span className="muted">
          {group.reports.length} report{group.reports.length === 1 ? '' : 's'} grouped into {incidents.length || 'no'} incident{incidents.length === 1 ? '' : 's'}
          {' · '}{confirmed} confirmed{auto > 0 && ` (${auto} by Claude check)`}
          {group.reports.length - confirmed > 0 && ` · ${group.reports.length - confirmed} waiting`}
        </span>
      </button>
      {expanded && <ol className="report-timeline place-reports" aria-label={`Reports at ${placeName(group.placeId)}, newest first`}>
        {group.reports.map((r) => {
          const c = checkOf(r.reportId);
          return <li key={r.reportId}>
            <p className="original-text">{r.input.text}</p>
            {c && <p className="muted">Claude · {c.outcome === 'AUTO_CONFIRMED' ? 'confirmed automatically' : 'sent to a person'}: {c.reason}</p>}
            {arrivedLate(r, state.reports) && <p className="change-flag">Arrived late · sent before a report already received</p>}
            <details className="item-details"><summary>Details</summary><ReportDetails report={r} /></details>
          </li>;
        })}
      </ol>}
    </li>
  );
}
