// G6 derived views (§5): grouping, chronology, attention. Pure functions over one
// DeskState, shared by the replay adapter (ws/web) and the live SpacetimeDB path, so
// both show the same queue, band, and timeline. No custom tree or graph engine: a
// per-call index and stable sorts are enough at demo scale.
import type { Attention, DeskState, IncidentView, RelationKind, Report, ReportRelation, Result } from '../types';
import { fail, isId, validateWire } from '../validate';

/** Written labels shown next to every attention color (§7). */
export const ATTENTION_LABEL: Readonly<Record<Attention, string>> = Object.freeze({
  POSSIBLE_LIFE_SAFETY: 'Possible life safety',
  ACTIVE_NEED: 'Active need',
  INFORMATION: 'Information',
});

export type ReviewKind = 'POSSIBLE_LIFE_SAFETY' | 'CONTRADICTION' | 'UNKNOWN' | 'PENDING_CHANGE';

/** One row of the pinned review band. `reportId` is null for an incident-level unknown. */
export type ReviewItem = {
  kind: ReviewKind;
  /** Written label shown next to any color. */
  label: string;
  reportId: string | null;
  incidentId: string | null;
  sourceReportIds: string[];
};

export type Standing = 'CONFIRMED' | 'PROVISIONAL' | 'UNASSIGNED';

/** One original report in the immutable chronology. */
export type TimelineEntry = {
  report: Report;
  standing: Standing;
  /** Confirmed incident, or the incident a pending link points at; null if unassigned. */
  incidentId: string | null;
  /** Sent earlier than a report received before it: shown as a late, older report. */
  lateOlder: boolean;
  relations: ReportRelation[];
};

/** An incident with its confirmed and provisionally linked reports (§5 grouping). */
export type IncidentGroup = {
  incident: IncidentView;
  confirmed: Report[];
  provisional: Report[];
  relations: ReportRelation[];
};

export type ChangeFlagKind =
  | 'NEW_EVIDENCE'
  | 'POSSIBLE_LIFE_SAFETY'
  | 'POSSIBLE_CORRECTION'
  | 'POSSIBLE_CONFLICT'
  | 'REPEAT'
  | 'LATE_OLDER_REPORT';

/** Rule-based, source-backed description of unconfirmed evidence about an incident. */
export type ChangeFlag = {
  kind: ChangeFlagKind;
  incidentId: string;
  reportId: string;
  description: string;
  sourceReportIds: string[];
};

/** A reviewed change to one incident (operator edit or approved proposal). */
export type IncidentChange = {
  status?: 'OPEN' | 'RESOLVED';
  attention?: Attention | null;
  confirmedPlaceId?: string | null;
  summary?: string | null;
  addReportIds?: string[];
};

export type ChangeContext = {
  runId: string;
  incidentId: string;
  /** Receive sequence of the newest report that starts a reopened cycle. */
  reopenSequence: number;
};

const ATTENTION_RANK: Record<Attention, number> = { POSSIBLE_LIFE_SAFETY: 0, ACTIVE_NEED: 1, INFORMATION: 2 };
const REVIEW_ORDER: Record<ReviewKind, number> = { POSSIBLE_LIFE_SAFETY: 0, CONTRADICTION: 1, UNKNOWN: 2, PENDING_CHANGE: 3 };
const REVIEW_LABEL: Record<ReviewKind, string> = {
  POSSIBLE_LIFE_SAFETY: 'Possible life-safety concern · unconfirmed',
  CONTRADICTION: 'Contradiction · needs review',
  UNKNOWN: 'Unknown · needs review',
  PENDING_CHANGE: 'Pending change · needs review',
};
const UNKNOWN_ATTENTION_LABEL = 'Unknown attention · needs review';
const FLAG_ORDER: ChangeFlagKind[] = ['NEW_EVIDENCE', 'POSSIBLE_LIFE_SAFETY', 'POSSIBLE_CORRECTION', 'POSSIBLE_CONFLICT', 'REPEAT', 'LATE_OLDER_REPORT'];

/** Code-unit order, so every runtime sorts IDs the same way (no locale collation). */
const byCodeUnit = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/** One pending (unreviewed) link from a report to an incident: a suggestion, proposal, or provisional relation. */
type PendingLink = { incidentId: string | null; attention: Attention | null; kinds: RelationKind[]; sources: string[] };

type Index = {
  /** This run's reports in receive order. */
  reports: Report[];
  byId: Map<string, Report>;
  incidents: IncidentView[];
  incidentIds: Set<string>;
  /** Report ID → the incident that confirmed it. */
  confirmedIn: Map<string, string>;
  pending: Map<string, PendingLink[]>;
  lateOlder: Set<string>;
};

function index(state: DeskState): Index {
  const run = state.runId;
  const reports = state.reports.filter((r) => r.input.runId === run).sort((a, b) => a.receiveSequence - b.receiveSequence);
  const byId = new Map(reports.map((r) => [r.reportId, r]));
  const incidents = state.incidents.filter((i) => i.runId === run);
  const confirmedIn = new Map<string, string>();
  for (const i of incidents) for (const r of i.confirmedReportIds) if (!confirmedIn.has(r)) confirmedIn.set(r, i.incidentId);

  const pending = new Map<string, PendingLink[]>();
  const add = (reportId: string, link: PendingLink) => {
    const list = pending.get(reportId) ?? [];
    list.push(link);
    pending.set(reportId, list);
  };
  for (const { reviewState, suggestion: s } of state.suggestions) {
    if (reviewState !== 'PENDING' || s.runId !== run) continue;
    const kinds: RelationKind[] = s.action === 'FLAG_CORRECTION' ? ['CORRECTION'] : s.action === 'FLAG_CONFLICT' ? ['CONFLICT'] : [];
    add(s.reportId, { incidentId: s.candidateIncidentId, attention: s.attention, kinds, sources: s.evidenceReportIds });
  }
  for (const { reviewState, proposal: p } of state.proposals) {
    if (reviewState !== 'PENDING' || p.runId !== run) continue;
    const cited = new Set([...p.addReportIds, ...p.relations.map((r) => r.reportId)]);
    for (const reportId of cited) {
      const rels = p.relations.filter((r) => r.reportId === reportId);
      add(reportId, {
        incidentId: p.incidentId,
        attention: p.suggestedAttention,
        kinds: rels.map((r) => r.kind),
        sources: [...p.evidenceReportIds, ...rels.map((r) => r.targetReportId)],
      });
    }
  }
  for (const rel of state.relations) {
    if (rel.state !== 'PROVISIONAL' || rel.runId !== run) continue;
    add(rel.reportId, { incidentId: rel.incidentId, attention: null, kinds: [rel.kind], sources: [rel.targetReportId] });
  }

  // Late, older: sent earlier than the latest sent time among reports received before it.
  const lateOlder = new Set<string>();
  let latestSent = -Infinity;
  for (const r of reports) {
    const sent = r.input.sentAt === null ? NaN : Date.parse(r.input.sentAt);
    if (Number.isNaN(sent)) continue;
    if (sent < latestSent) lateOlder.add(r.reportId);
    latestSent = Math.max(latestSent, sent);
  }

  return { reports, byId, incidents, incidentIds: new Set(incidents.map((i) => i.incidentId)), confirmedIn, pending, lateOlder };
}

const linksOf = (ix: Index, reportId: string) => ix.pending.get(reportId) ?? [];

/** Incident a pending link points at, if it exists in this run. */
function linkedIncident(ix: Index, reportId: string): string | null {
  for (const l of linksOf(ix, reportId)) if (l.incidentId && ix.incidentIds.has(l.incidentId)) return l.incidentId;
  return null;
}

/** Incident whose confirmed place the report names explicitly; open incidents first. No geocoding. */
function placeIncident(ix: Index, report: Report): string | null {
  const placeId = report.input.reportedLocation?.placeId;
  if (!placeId) return null;
  const matches = ix.incidents
    .filter((i) => i.confirmedPlaceId === placeId)
    .sort((a, b) => Number(a.status !== 'OPEN') - Number(b.status !== 'OPEN') || byCodeUnit(a.incidentId, b.incidentId));
  return matches[0]?.incidentId ?? null;
}

/** Every incident an unconfirmed report may affect: its pending links plus its named place. */
function affectedIncidents(ix: Index, report: Report): Set<string> {
  const out = new Set<string>();
  for (const l of linksOf(ix, report.reportId)) if (l.incidentId && ix.incidentIds.has(l.incidentId)) out.add(l.incidentId);
  const place = placeIncident(ix, report);
  if (place) out.add(place);
  return out;
}

const unconfirmed = (ix: Index) => ix.reports.filter((r) => !ix.confirmedIn.has(r.reportId));

function knownSources(ix: Index, ids: string[]): string[] {
  return [...new Set(ids)].filter((id) => ix.byId.has(id));
}

/** Open incidents in confirmed-queue order (§5). Only confirmed state ranks. */
export function confirmedQueue(state: DeskState): IncidentView[] {
  const rank = (a: Attention | null) => (a === null ? 3 : ATTENTION_RANK[a]);
  return state.incidents
    .filter((i) => i.runId === state.runId && i.status === 'OPEN')
    .sort(
      (a, b) =>
        rank(a.attention) - rank(b.attention) ||
        a.openCycleStartSequence - b.openCycleStartSequence ||
        byCodeUnit(a.incidentId, b.incidentId),
    );
}

/** Pinned review band: unconfirmed possible harm, contradictions, unknowns, pending changes. */
export function reviewBand(state: DeskState): ReviewItem[] {
  const ix = index(state);
  const rows: { item: ReviewItem; seq: number }[] = [];
  for (const report of unconfirmed(ix)) {
    const links = linksOf(ix, report.reportId);
    const kind: ReviewKind = links.some((l) => l.attention === 'POSSIBLE_LIFE_SAFETY')
      ? 'POSSIBLE_LIFE_SAFETY'
      : links.some((l) => l.kinds.includes('CONFLICT'))
        ? 'CONTRADICTION'
        : links.length === 0
          ? 'UNKNOWN'
          : 'PENDING_CHANGE';
    rows.push({
      seq: report.receiveSequence,
      item: {
        kind,
        label: REVIEW_LABEL[kind],
        reportId: report.reportId,
        incidentId: linkedIncident(ix, report.reportId) ?? placeIncident(ix, report),
        sourceReportIds: knownSources(ix, [report.reportId, ...links.flatMap((l) => l.sources)]),
      },
    });
  }
  // Confirmed incidents with unknown attention: listed for review, never buried.
  const unknowns = ix.incidents
    .filter((i) => i.status === 'OPEN' && i.attention === null)
    .sort((a, b) => byCodeUnit(a.incidentId, b.incidentId));
  for (const i of unknowns) {
    rows.push({
      seq: Infinity,
      item: {
        kind: 'UNKNOWN',
        label: UNKNOWN_ATTENTION_LABEL,
        reportId: null,
        incidentId: i.incidentId,
        sourceReportIds: knownSources(ix, i.confirmedReportIds),
      },
    });
  }
  return rows.sort((a, b) => REVIEW_ORDER[a.item.kind] - REVIEW_ORDER[b.item.kind] || a.seq - b.seq).map((r) => r.item);
}

/** Incidents with received but unconfirmed evidence; their summaries aren't current. */
export function needsReassessment(state: DeskState): Set<string> {
  const ix = index(state);
  const flagged = new Set<string>();
  for (const report of unconfirmed(ix)) for (const id of affectedIncidents(ix, report)) flagged.add(id);
  for (const { reviewState, proposal: p } of state.proposals) {
    if (reviewState !== 'PENDING' || p.runId !== state.runId) continue;
    for (const id of [p.incidentId, ...Object.keys(p.baseIncidentVersions)]) if (ix.incidentIds.has(id)) flagged.add(id);
  }
  for (const { reviewState, suggestion: s } of state.suggestions) {
    if (reviewState === 'PENDING' && s.runId === state.runId && s.candidateIncidentId && ix.incidentIds.has(s.candidateIncidentId)) {
      flagged.add(s.candidateIncidentId);
    }
  }
  return new Set([...flagged].sort(byCodeUnit));
}

function entries(ix: Index, state: DeskState): TimelineEntry[] {
  const relations = state.relations.filter((r) => r.runId === state.runId);
  return ix.reports.map((report) => {
    const confirmed = ix.confirmedIn.get(report.reportId);
    const linked = confirmed ? null : linkedIncident(ix, report.reportId);
    return {
      report,
      standing: confirmed ? 'CONFIRMED' : linked ? 'PROVISIONAL' : 'UNASSIGNED',
      incidentId: confirmed ?? linked,
      lateOlder: ix.lateOlder.has(report.reportId),
      relations: relations.filter((r) => r.reportId === report.reportId),
    };
  });
}

/** Every original in receive order, for the whole run or one incident. */
export function timeline(state: DeskState, incidentId?: string): TimelineEntry[] {
  const all = entries(index(state), state);
  return incidentId === undefined ? all : all.filter((e) => e.incidentId === incidentId);
}

export function incidentGroups(state: DeskState): IncidentGroup[] {
  const ix = index(state);
  const all = entries(ix, state);
  return ix.incidents
    .slice()
    .sort((a, b) => byCodeUnit(a.incidentId, b.incidentId))
    .map((incident) => ({
      incident,
      confirmed: all.filter((e) => e.standing === 'CONFIRMED' && e.incidentId === incident.incidentId).map((e) => e.report),
      provisional: all.filter((e) => e.standing === 'PROVISIONAL' && e.incidentId === incident.incidentId).map((e) => e.report),
      relations: state.relations.filter((r) => r.runId === state.runId && r.incidentId === incident.incidentId),
    }));
}

export function changeFlags(state: DeskState, incidentId: string): ChangeFlag[] {
  const ix = index(state);
  const flags: ChangeFlag[] = [];
  const name = (id: string) => ix.byId.get(id)?.input.messageId ?? id;
  for (const report of unconfirmed(ix)) {
    if (!affectedIncidents(ix, report).has(incidentId)) continue;
    // Links aimed at this incident, or at none yet (a possible new incident still concerns it).
    const links = linksOf(ix, report.reportId).filter((l) => l.incidentId === null || l.incidentId === incidentId);
    const m = `${report.input.messageId} from ${report.input.sourceId}`;
    const targets = (kind: RelationKind) => knownSources(ix, links.filter((l) => l.kinds.includes(kind)).flatMap((l) => l.sources)).filter((id) => id !== report.reportId);
    const flag = (kind: ChangeFlagKind, description: string, extra: string[] = []) =>
      flags.push({ kind, incidentId, reportId: report.reportId, description, sourceReportIds: knownSources(ix, [report.reportId, ...extra]) });
    const about = (ids: string[]) => (ids.length ? ` ${ids.map(name).join(', ')}` : ' confirmed reports');

    flag('NEW_EVIDENCE', `${m} arrived (receive #${report.receiveSequence}) and is not reviewed yet; this incident's summary may not be current.`);
    if (links.some((l) => l.attention === 'POSSIBLE_LIFE_SAFETY')) {
      flag('POSSIBLE_LIFE_SAFETY', `${m}: a pending suggestion marks possible life safety. Unconfirmed; needs operator review.`);
    }
    if (links.some((l) => l.kinds.includes('CORRECTION'))) {
      const t = targets('CORRECTION');
      flag('POSSIBLE_CORRECTION', `${m} may correct${about(t)}. Not applied until reviewed.`, t);
    }
    if (links.some((l) => l.kinds.includes('CONFLICT'))) {
      const t = targets('CONFLICT');
      flag('POSSIBLE_CONFLICT', `${m} may conflict with${about(t)}. Both stay visible until reviewed.`, t);
    }
    if (links.some((l) => l.kinds.includes('REPEAT'))) {
      const t = targets('REPEAT');
      flag('REPEAT', `${m} may repeat${about(t)}: new evidence, not added severity.`, t);
    }
    if (ix.lateOlder.has(report.reportId)) {
      flag(
        'LATE_OLDER_REPORT',
        `${m} was sent at ${report.input.sentAt}, earlier than reports already received. Shown as a late, older report; it does not replace newer concerns.`,
      );
    }
  }
  const seq = (id: string) => ix.byId.get(id)!.receiveSequence;
  return flags.sort((a, b) => seq(a.reportId) - seq(b.reportId) || FLAG_ORDER.indexOf(a.kind) - FLAG_ORDER.indexOf(b.kind));
}

/** Apply one reviewed change; the shared transition for replay and the DB reducer. */
export function applyIncidentChange(current: IncidentView | null, change: IncidentChange, ctx: ChangeContext): Result<IncidentView> {
  const adds = change.addReportIds ?? [];
  if (adds.some((id) => !isId(id))) return fail('INVALID_INPUT', 'addReportIds contains an invalid report ID');

  let next: IncidentView;
  if (current === null) {
    if (change.status !== 'OPEN') return fail('INVALID_INPUT', `a new incident ${ctx.incidentId} must be created OPEN`);
    next = {
      runId: ctx.runId,
      incidentId: ctx.incidentId,
      revision: 1,
      status: 'OPEN',
      attention: change.attention ?? null,
      confirmedPlaceId: change.confirmedPlaceId ?? null,
      confirmedReportIds: [...new Set(adds)],
      summary: change.summary ?? null,
      openCycleStartSequence: ctx.reopenSequence,
    };
  } else {
    if (current.runId !== ctx.runId) return fail('WRONG_RUN', `incident ${current.incidentId} belongs to another run`);
    if (current.incidentId !== ctx.incidentId) return fail('INVALID_INPUT', `change is for ${ctx.incidentId}, not ${current.incidentId}`);
    if (change.status === 'RESOLVED' && current.status === 'RESOLVED') {
      return fail('INVALID_INPUT', `incident ${current.incidentId} is already resolved`);
    }
    const reopening = change.status === 'OPEN' && current.status === 'RESOLVED';
    if (reopening && ctx.reopenSequence < current.openCycleStartSequence) {
      return fail('INVALID_INPUT', `a reopened cycle cannot start (#${ctx.reopenSequence}) before the previous one (#${current.openCycleStartSequence})`);
    }
    const reportIds = [...current.confirmedReportIds];
    for (const id of adds) if (!reportIds.includes(id)) reportIds.push(id);
    next = {
      ...current,
      status: change.status ?? current.status,
      attention: change.attention === undefined ? current.attention : change.attention,
      confirmedPlaceId: change.confirmedPlaceId === undefined ? current.confirmedPlaceId : change.confirmedPlaceId,
      summary: change.summary === undefined ? current.summary : change.summary,
      confirmedReportIds: reportIds,
      openCycleStartSequence: reopening ? ctx.reopenSequence : current.openCycleStartSequence,
      revision: current.revision,
    };
    if (JSON.stringify(next) === JSON.stringify(current)) return fail('INVALID_INPUT', `change to ${current.incidentId} has no effect`);
    next.revision = current.revision + 1;
  }
  const valid = validateWire('IncidentView', next);
  return valid.ok ? { ok: true, value: next } : valid;
}

/** Invariants every DeskState must hold, in replay and live alike. Returns violations. */
export function deskInvariants(state: DeskState): string[] {
  const v: string[] = [];
  const run = state.runId;
  const reportIds = new Set<string>();
  const seqs = new Set<number>();
  const identities = new Set<string>();
  for (const r of state.reports) {
    if (r.input.runId !== run) v.push(`report ${r.reportId} belongs to run ${r.input.runId}, not ${run}`);
    if (!Number.isInteger(r.receiveSequence) || r.receiveSequence < 1) v.push(`report ${r.reportId} has receive sequence ${r.receiveSequence}`);
    if (seqs.has(r.receiveSequence)) v.push(`receive sequence ${r.receiveSequence} is used twice`);
    seqs.add(r.receiveSequence);
    if (reportIds.has(r.reportId)) v.push(`report ID ${r.reportId} is used twice`);
    reportIds.add(r.reportId);
    const identity = JSON.stringify([r.input.runId, r.input.sourceId, r.input.messageId]);
    if (identities.has(identity)) v.push(`message ${r.input.messageId} from ${r.input.sourceId} is stored twice (a retransmission is not new evidence)`);
    identities.add(identity);
  }

  const incidentIds = new Set<string>();
  const confirmedIn = new Map<string, string>();
  for (const i of state.incidents) {
    if (i.runId !== run) v.push(`incident ${i.incidentId} belongs to run ${i.runId}, not ${run}`);
    if (incidentIds.has(i.incidentId)) v.push(`incident ID ${i.incidentId} is used twice`);
    incidentIds.add(i.incidentId);
    if (!seqs.has(i.openCycleStartSequence)) v.push(`incident ${i.incidentId} opens its cycle at #${i.openCycleStartSequence}, which no report has`);
    for (const r of i.confirmedReportIds) {
      if (!reportIds.has(r)) v.push(`incident ${i.incidentId} confirms missing report ${r}`);
      const other = confirmedIn.get(r);
      if (other !== undefined) v.push(`report ${r} is confirmed in both ${other} and ${i.incidentId}`);
      confirmedIn.set(r, i.incidentId);
    }
  }

  for (const rel of state.relations) {
    if (rel.runId !== run) v.push(`relation ${rel.relationId} belongs to run ${rel.runId}`);
    for (const r of [rel.reportId, rel.targetReportId]) if (!reportIds.has(r)) v.push(`relation ${rel.relationId} cites missing report ${r}`);
    if (!incidentIds.has(rel.incidentId)) v.push(`relation ${rel.relationId} cites missing incident ${rel.incidentId}`);
    if (rel.state === 'CONFIRMED' && rel.reviewer === null) v.push(`confirmed relation ${rel.relationId} has no reviewer`);
  }

  for (const { suggestion: s, suggestionId } of state.suggestions) {
    if (s.runId !== run) continue;
    for (const r of [s.reportId, ...s.evidenceReportIds]) if (!reportIds.has(r)) v.push(`suggestion ${suggestionId} cites missing report ${r}`);
    if (s.candidateIncidentId !== null && !incidentIds.has(s.candidateIncidentId)) {
      v.push(`suggestion ${suggestionId} names missing incident ${s.candidateIncidentId}`);
    }
  }
  for (const { proposal: p } of state.proposals) {
    if (p.runId !== run) continue;
    const cited = [...p.addReportIds, ...p.evidenceReportIds, ...p.relations.flatMap((r) => [r.reportId, r.targetReportId])];
    for (const r of new Set(cited)) if (!reportIds.has(r)) v.push(`proposal ${p.proposalId} cites missing report ${r}`);
  }
  return v;
}
