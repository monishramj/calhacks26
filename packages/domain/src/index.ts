// @calhacks26/domain: contract v1. See README.md and CHANGELOG.md.
export * from './types';
export {
  CONTRACT_VERSION,
  MAX_DEPTH,
  MAX_ID_LENGTH,
  MAX_REPORT_TEXT_BYTES,
  MAX_WIRE_BYTES,
  WIRE_TYPES,
  parseWire,
  validateWire,
} from './validate';
export {
  ADAPTER_METHODS,
  ATTENTIONS,
  ERROR_CODES,
  LOCAL_ACTIONS,
  PROVIDERS,
  ROLES,
  acceptReport,
  authorize,
  buildJobInput,
  canonicalJson,
  checkFreshness,
  checkProviderAllowed,
  checkSourceOwnership,
  citedReportIds,
  classifyIntake,
  computeInputSignature,
  recallCommand,
  recordCommand,
} from './rules/contract';
export type { Assigned, BuildJobInputArgs, CommandLedger, FreshnessCurrent, FreshnessSubmitted, SignatureInput } from './rules/contract';
export { checkPicture } from './rules/picture';
export { HARM_FLOOR, MAX_CANDIDATES, autoConfirmDecision, layaView, nearestOpenIncidents } from './rules/autoConfirm';
export type { AutoConfirmArgs, AutoConfirmDecision, LayaView, PlacePosition } from './rules/autoConfirm';
export {
  ATTENTION_LABEL,
  applyIncidentChange,
  changeFlags,
  confirmedQueue,
  deskInvariants,
  incidentGroups,
  needsReassessment,
  reviewBand,
  timeline,
} from './rules/views';
export type {
  ChangeContext,
  ChangeFlag,
  ChangeFlagKind,
  IncidentChange,
  IncidentGroup,
  ReviewItem,
  ReviewKind,
  Standing,
  TimelineEntry,
} from './rules/views';
