// G6 derived views (§5): grouping, chronology, attention. Pure functions over one
// DeskState, shared by the replay adapter (ws/web) and the live SpacetimeDB path, so
// both show the same queue, band, and timeline. No custom tree or graph engine.
//
// G6 TEST harness stub: every export exists so the tests in test/g6 load and fail on
// behavior. G6 IMPLEMENT replaces each body.
import type { Attention, DeskState, IncidentView, Report, ReportRelation, Result } from '../types';

/** Written labels shown next to every attention color (§7). */
export const ATTENTION_LABEL: Readonly<Record<Attention, string>> = Object.freeze({} as Record<Attention, string>);

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

/** Open incidents in confirmed-queue order (§5). Only confirmed state ranks. */
export function confirmedQueue(_state: DeskState): IncidentView[] {
  return [];
}

/** Pinned review band: unconfirmed possible harm, contradictions, unknowns, pending changes. */
export function reviewBand(_state: DeskState): ReviewItem[] {
  return [];
}

/** Incidents with received but unconfirmed evidence; their summaries aren't current. */
export function needsReassessment(_state: DeskState): Set<string> {
  return new Set();
}

/** Every original in receive order, for the whole run or one incident. */
export function timeline(_state: DeskState, _incidentId?: string): TimelineEntry[] {
  return [];
}

export function incidentGroups(_state: DeskState): IncidentGroup[] {
  return [];
}

export function changeFlags(_state: DeskState, _incidentId: string): ChangeFlag[] {
  return [];
}

/** Apply one reviewed change; the shared transition for replay and the DB reducer. */
export function applyIncidentChange(_current: IncidentView | null, _change: IncidentChange, _ctx: ChangeContext): Result<IncidentView> {
  return { ok: false, error: { code: 'SERVICE_UNAVAILABLE', message: 'G6 IMPLEMENT pending: applyIncidentChange' } };
}

/** Invariants every DeskState must hold, in replay and live alike. Returns violations. */
export function deskInvariants(_state: DeskState): string[] {
  return [];
}
