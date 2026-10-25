// Derived views: the shared §5 rules (also used by the SpacetimeDB module) plus UI-only labels.
// Panels and scene import these, never their own ordering.
import type { DeskState } from './contract';

export {
  ATTENTION_LABEL,
  confirmedQueue,
  needsReassessment,
  reviewBand,
  timeline,
  type ReviewItem,
} from '../../../../packages/domain/src/rules/views';

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
