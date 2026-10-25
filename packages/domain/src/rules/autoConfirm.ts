// Claude checks Laya (v1.4.0). Pure rules shared by the SpacetimeDB module and the coordinator fixture:
// which incidents a report's jobs see, what Laya's answer is when it asked for review, and whether
// Laya and Claude agree on a change safe enough to confirm without a person.
import type { Attention, ClaudeCheck, IncidentView, LocalAction, LocalSuggestion } from '../types';
import { ATTENTION_LABEL, type IncidentChange } from './views';
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

export type LayaView = { action: LocalAction; candidateIncidentId: string | null; attention: Attention | null; harm: number; possibleHarm: boolean };

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
    harm,
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

// Plain words for the reasons operators read.
const ACTION_WORDS: Record<LocalAction, string> = {
  NEW_INCIDENT: 'a new incident',
  ATTACH_REPORT: 'add to an incident',
  FLAG_CORRECTION: 'a possible correction',
  FLAG_CONFLICT: 'a possible conflict',
  REQUEST_REVIEW: 'unclear',
};
const att = (a: Attention | null) => (a ? ATTENTION_LABEL[a].toLowerCase() : 'unknown');

const RANK: Record<Attention, number> = { INFORMATION: 0, ACTIVE_NEED: 1, POSSIBLE_LIFE_SAFETY: 2 };

/**
 * May this report confirm without a person? Only when Laya and Claude agree on attention, neither says
 * possible life safety (Laya also puts under HARM_FLOOR on it), Claude's action is a plain attach or a new
 * incident at the report's stated place, and every incident either saw is unchanged. Laya's action and
 * incident are not compared: its action read is weak, so Claude decides where the report goes.
 * Corrections, conflicts and review requests always go to a person, and so does any report on an incident that is
 * currently possible life safety (it may be an all-clear: lowering life safety needs a person). An attach never lowers attention.
 * `incidentId` is null for a new incident (the backend names it). Reasons are plain sentences, most
 * important first, so the first one can stand alone in the review band.
 */
export function autoConfirmDecision({ suggestion, check, placeId, incidents }: AutoConfirmArgs): AutoConfirmDecision {
  const laya = layaView(suggestion);
  const reasons: string[] = [];
  const target = check.candidateIncidentId === null ? undefined : incidents.find((i) => i.incidentId === check.candidateIncidentId);
  if (suggestion.reportId !== check.reportId || suggestion.runId !== check.runId) reasons.push('Laya and Claude looked at different reports.');
  // Say which model raised life safety, and how: Laya's floor mass alone is not "Laya says life safety".
  if (check.attention === 'POSSIBLE_LIFE_SAFETY') reasons.push('Claude reads possible life safety, so a person decides.');
  if (laya.attention === 'POSSIBLE_LIFE_SAFETY') reasons.push('Laya reads possible life safety, so a person decides.');
  if (check.action === 'ATTACH_REPORT' && target?.attention === 'POSSIBLE_LIFE_SAFETY') reasons.push('The incident is possible life safety; only a person may lower it.');
  if (check.action !== 'NEW_INCIDENT' && check.action !== 'ATTACH_REPORT') reasons.push(`Claude reads ${ACTION_WORDS[check.action]}, so a person decides.`);
  if (check.attention === null || laya.attention !== check.attention) reasons.push(`Laya and Claude disagree on attention: Laya says ${att(laya.attention)}, Claude says ${att(check.attention)}.`);
  if (laya.possibleHarm && laya.attention !== 'POSSIBLE_LIFE_SAFETY') {
    reasons.push(`Laya puts ${Math.round(laya.harm * 100)}% on life safety, so a person decides.`);
  }

  const byId = new Map(incidents.map((i) => [i.incidentId, i]));
  for (const base of [suggestion.baseIncidentVersions, check.baseIncidentVersions]) {
    for (const [id, revision] of Object.entries(base)) {
      if ((byId.get(id)?.revision ?? 0) !== revision) reasons.push(`${id} changed since the models looked.`);
    }
  }
  if (incidents.some((i) => i.confirmedReportIds.includes(check.reportId))) reasons.push('The report is already confirmed.');
  if (check.action === 'ATTACH_REPORT' && target?.status !== 'OPEN') reasons.push('The incident is not open.');
  if (check.action === 'NEW_INCIDENT' && placeId === null) reasons.push('A new incident needs a place the sender stated.');
  if (reasons.length) return { confirm: false, reasons: [...new Set(reasons)] };

  const attention = check.attention!;
  const why = `Laya and Claude agree on ${att(attention)}; Claude ${check.action === 'NEW_INCIDENT' ? `opens a new incident at ${placeId}` : `adds it to ${target!.incidentId}`}.`;
  if (check.action === 'NEW_INCIDENT') {
    return { confirm: true, incidentId: null, change: { status: 'OPEN', attention, addReportIds: [check.reportId], confirmedPlaceId: placeId }, reason: why };
  }
  const raises = target!.attention === null || RANK[attention] > RANK[target!.attention];
  return { confirm: true, incidentId: target!.incidentId, change: { addReportIds: [check.reportId], ...(raises ? { attention } : {}) }, reason: why };
}
