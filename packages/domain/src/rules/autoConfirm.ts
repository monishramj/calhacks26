// Claude checks Laya (v1.4.0). Pure rules shared by the SpacetimeDB module and the coordinator fixture:
// which incidents a report's jobs see, what Laya's answer is when it asked for review, and whether
// Laya and Claude agree on a change safe enough to confirm without a person.
import type { Attention, ClaudeCheck, IncidentView, LocalAction, LocalSuggestion } from '../types';
import type { IncidentChange } from './views';
import { ATTENTIONS, LOCAL_ACTIONS } from './contract';

/** Laya's option limit: more choices than this are uncalibrated, and the worker refuses inference. */
export const MAX_CANDIDATES = 10;
/** Laya mass on possible life safety at or above this counts as possible harm (same floor as the Laya worker). */
export const HARM_FLOOR = 0.15;

export type PlacePosition = { x: number; z: number };

/**
 * Open incidents a report's jobs compare against: those at the report's stated place first, then the
 * nearest by place position, at most `max`. Without a stated place (or position), the newest open
 * incidents are taken instead. Ties keep the newest incident first.
 */
export function nearestOpenIncidents(
  incidents: readonly IncidentView[],
  placeId: string | null,
  positions: ReadonlyMap<string, PlacePosition>,
  max = MAX_CANDIDATES,
): IncidentView[] {
  const from = placeId === null ? undefined : positions.get(placeId);
  const distance = (i: IncidentView) => {
    if (i.confirmedPlaceId !== null && i.confirmedPlaceId === placeId) return 0;
    const at = i.confirmedPlaceId === null ? undefined : positions.get(i.confirmedPlaceId);
    return from && at ? Math.hypot(from.x - at.x, from.z - at.z) : Infinity;
  };
  return incidents
    .filter((i) => i.status === 'OPEN')
    .map((i) => ({ i, d: distance(i) }))
    .sort((a, b) => a.d - b.d || b.i.openCycleStartSequence - a.i.openCycleStartSequence)
    .slice(0, max)
    .map((x) => x.i);
}

export type LayaView = { action: LocalAction; candidateIncidentId: string | null; attention: Attention | null; possibleHarm: boolean };

const top = (s: LocalSuggestion, labels: readonly string[]) =>
  s.scores.filter((x) => labels.includes(x.label)).sort((a, b) => b.value - a.value)[0]?.label ?? null;

/**
 * Laya's own answer. Laya almost always returns REQUEST_REVIEW with scores (its certainty bar is strict),
 * so a field it left open is read from its top-scored label for that question.
 */
export function layaView(s: LocalSuggestion): LayaView {
  const candidates = Object.keys(s.baseIncidentVersions);
  const harm = s.scores.find((x) => x.label === 'POSSIBLE_LIFE_SAFETY')?.value ?? 0;
  const attention = s.attention ?? (top(s, ATTENTIONS) as Attention | null);
  return {
    action: s.action !== 'REQUEST_REVIEW' ? s.action : ((top(s, LOCAL_ACTIONS) as LocalAction | null) ?? 'REQUEST_REVIEW'),
    candidateIncidentId: s.candidateIncidentId ?? top(s, candidates) ?? (candidates.length === 1 ? candidates[0] : null),
    attention,
    possibleHarm: attention === 'POSSIBLE_LIFE_SAFETY' || harm >= HARM_FLOOR,
  };
}

export type AutoConfirmArgs = {
  suggestion: LocalSuggestion;
  check: ClaudeCheck;
  /** The report's sender-stated place, if any. */
  placeId: string | null;
  /** Current incidents of the run. */
  incidents: readonly IncidentView[];
};
export type AutoConfirmDecision =
  | { confirm: true; incidentId: string | null; change: IncidentChange; reason: string }
  | { confirm: false; reasons: string[] };

const RANK: Record<Attention, number> = { INFORMATION: 0, ACTIVE_NEED: 1, POSSIBLE_LIFE_SAFETY: 2 };

/**
 * May this report confirm without a person? Only when Laya and Claude agree on the incident (or both say
 * a new incident at the report's stated place) and on attention, neither says possible life safety,
 * Claude's action is a plain attach or new incident, and every incident either saw is unchanged.
 * Corrections, conflicts and review requests always go to a person, and so does any report on an incident that is
 * currently possible life safety (it may be an all-clear: lowering life safety needs a person). An attach never lowers attention.
 * `incidentId` is null for a new incident (the backend names it).
 */
export function autoConfirmDecision({ suggestion, check, placeId, incidents }: AutoConfirmArgs): AutoConfirmDecision {
  const laya = layaView(suggestion);
  const reasons: string[] = [];
  if (suggestion.reportId !== check.reportId || suggestion.runId !== check.runId) reasons.push('Laya and Claude looked at different reports');
  if (laya.possibleHarm || check.attention === 'POSSIBLE_LIFE_SAFETY') reasons.push('possible life safety: a person decides');
  if (check.action !== 'NEW_INCIDENT' && check.action !== 'ATTACH_REPORT') reasons.push(`Claude says ${check.action}: a person decides`);
  if (laya.action !== check.action) reasons.push(`Laya says ${laya.action}, Claude says ${check.action}`);
  if (check.attention === null || laya.attention !== check.attention) reasons.push(`attention differs: Laya ${laya.attention ?? 'unknown'}, Claude ${check.attention ?? 'unknown'}`);

  const byId = new Map(incidents.map((i) => [i.incidentId, i]));
  for (const base of [suggestion.baseIncidentVersions, check.baseIncidentVersions]) {
    for (const [id, revision] of Object.entries(base)) {
      if ((byId.get(id)?.revision ?? 0) !== revision) reasons.push(`${id} changed since the models looked`);
    }
  }
  if (incidents.some((i) => i.confirmedReportIds.includes(check.reportId))) reasons.push('the report is already confirmed');

  const target = check.candidateIncidentId === null ? undefined : byId.get(check.candidateIncidentId);
  if (check.action === 'ATTACH_REPORT') {
    if (laya.candidateIncidentId !== check.candidateIncidentId) reasons.push(`incident differs: Laya ${laya.candidateIncidentId ?? 'none'}, Claude ${check.candidateIncidentId}`);
    if (target?.status !== 'OPEN') reasons.push('the incident is not open');
    if (target?.attention === 'POSSIBLE_LIFE_SAFETY') reasons.push('the incident is possible life safety: only a person may lower it');
  }
  if (check.action === 'NEW_INCIDENT' && placeId === null) reasons.push('a new incident needs a place the sender stated');
  if (reasons.length) return { confirm: false, reasons: [...new Set(reasons)] };

  const attention = check.attention!;
  const why = `Laya and Claude agree: ${check.action === 'NEW_INCIDENT' ? `new incident at ${placeId}` : `attach to ${target!.incidentId}`}, ${attention}`;
  if (check.action === 'NEW_INCIDENT') {
    return { confirm: true, incidentId: null, change: { status: 'OPEN', attention, addReportIds: [check.reportId], confirmedPlaceId: placeId }, reason: why };
  }
  const raises = target!.attention === null || RANK[attention] > RANK[target!.attention];
  return { confirm: true, incidentId: target!.incidentId, change: { addReportIds: [check.reportId], ...(raises ? { attention } : {}) }, reason: why };
}
