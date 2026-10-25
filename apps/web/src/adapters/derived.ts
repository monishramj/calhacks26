// INTERIM derived views (G6) on contract v1 types. ws/state's G6 rules
// (packages/domain/src/rules/views.ts) are on ws/state, not yet on main; swap this
// file for them when they merge. Panels and scene import these, never their own ordering.
// Policy is §5: confirmed queue sorts by operator-confirmed category, then oldest
// unresolved cycle sequence, then stable incident ID. Confidence never enters it.
import type { Attention, DeskState, IncidentView, ProposalRecord, Report } from './contract';

const ATTENTION_RANK: Record<Attention, number> = {
  POSSIBLE_LIFE_SAFETY: 0,
  ACTIVE_NEED: 1,
  INFORMATION: 2,
};

function rank(attention: Attention | null): number {
  return attention === null ? 3 : ATTENTION_RANK[attention];
}

/** Open confirmed incidents in queue order. Resolved incidents are not in the queue. */
export function confirmedQueue(state: DeskState): IncidentView[] {
  return state.incidents
    .filter((i) => i.status === 'OPEN')
    .slice()
    .sort(
      (a, b) =>
        rank(a.attention) - rank(b.attention) ||
        a.openCycleStartSequence - b.openCycleStartSequence ||
        (a.incidentId < b.incidentId ? -1 : a.incidentId > b.incidentId ? 1 : 0),
    );
}

export type ReviewItem = {
  kind: 'POSSIBLE_LIFE_SAFETY' | 'CONTRADICTION' | 'UNKNOWN' | 'PENDING_CHANGE';
  /** Written label shown next to any color. */
  label: string;
  reportId: string;
  incidentId: string | null;
  proposal: ProposalRecord | null;
};

const REVIEW_KIND_ORDER: Record<ReviewItem['kind'], number> = {
  POSSIBLE_LIFE_SAFETY: 0,
  CONTRADICTION: 1,
  UNKNOWN: 2,
  PENDING_CHANGE: 3,
};

/**
 * Pinned review band (§5): unconfirmed possible life-safety concerns, contradictions,
 * and unknowns. A provisional hint may order this band, never the confirmed queue.
 */
export function reviewBand(state: DeskState): ReviewItem[] {
  const items: ReviewItem[] = [];
  const pendingByReport = new Map<string, ProposalRecord>();
  for (const p of state.proposals) {
    if (p.reviewState === 'PENDING') for (const r of p.proposal.addReportIds) pendingByReport.set(r, p);
  }
  const confirmed = new Set(state.incidents.flatMap((i) => i.confirmedReportIds));
  for (const report of state.reports) {
    if (confirmed.has(report.reportId)) continue;
    const proposal = pendingByReport.get(report.reportId) ?? null;
    const suggestion = state.suggestions.find((s) => s.suggestion.reportId === report.reportId)?.suggestion ?? null;
    const incidentId = proposal?.proposal.incidentId ?? suggestion?.candidateIncidentId ?? null;
    const hasConflict =
      suggestion?.action === 'FLAG_CONFLICT' || proposal?.proposal.relations.some((r) => r.kind === 'CONFLICT') === true;
    const possibleHarm =
      suggestion?.attention === 'POSSIBLE_LIFE_SAFETY' || proposal?.proposal.suggestedAttention === 'POSSIBLE_LIFE_SAFETY';
    let kind: ReviewItem['kind'];
    if (possibleHarm) kind = 'POSSIBLE_LIFE_SAFETY';
    else if (hasConflict) kind = 'CONTRADICTION';
    else if (!suggestion && !proposal) kind = 'UNKNOWN';
    else kind = 'PENDING_CHANGE';
    items.push({ kind, label: REVIEW_LABEL[kind], reportId: report.reportId, incidentId, proposal });
  }
  const seq = new Map(state.reports.map((r) => [r.reportId, r.receiveSequence]));
  return items.sort(
    (a, b) => REVIEW_KIND_ORDER[a.kind] - REVIEW_KIND_ORDER[b.kind] || seq.get(a.reportId)! - seq.get(b.reportId)!,
  );
}

const REVIEW_LABEL: Record<ReviewItem['kind'], string> = {
  POSSIBLE_LIFE_SAFETY: 'Possible life-safety concern · unconfirmed',
  CONTRADICTION: 'Contradiction · needs review',
  UNKNOWN: 'Unknown · needs review',
  PENDING_CHANGE: 'Pending change · needs review',
};

/** Incidents with received but unconfirmed evidence; their summaries are not current. */
export function needsReassessment(state: DeskState): Set<string> {
  const flagged = new Set<string>();
  for (const item of reviewBand(state)) if (item.incidentId) flagged.add(item.incidentId);
  return flagged;
}

/** Immutable chronology: every original, in receive order, for one incident or all. */
export function timeline(state: DeskState, incidentId?: string): Report[] {
  let reports = state.reports;
  if (incidentId) {
    const incident = state.incidents.find((i) => i.incidentId === incidentId);
    const related = new Set(incident?.confirmedReportIds ?? []);
    for (const item of reviewBand(state)) if (item.incidentId === incidentId) related.add(item.reportId);
    reports = reports.filter((r) => related.has(r.reportId));
  }
  return reports.slice().sort((a, b) => a.receiveSequence - b.receiveSequence);
}

/** Source label from what was actually received (v1 has no state-level provenance). */
export function sourceLabel(state: DeskState): string {
  const kinds = [...new Set(state.reports.map((r) => r.provenance))];
  return kinds.length ? kinds.join(' + ') : 'none';
}

/** Inference label from the providers of stored suggestions and proposals. */
export function inferenceLabel(state: DeskState): string {
  const providers = [
    ...new Set([...state.suggestions.map((s) => s.suggestion.provider), ...state.proposals.map((p) => p.proposal.provider)]),
  ];
  return providers.length ? providers.join(' + ') : 'none yet';
}

export const ATTENTION_LABEL: Record<Attention, string> = {
  POSSIBLE_LIFE_SAFETY: 'Possible life safety',
  ACTIVE_NEED: 'Active need',
  INFORMATION: 'Information',
};
