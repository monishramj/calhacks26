// @calhacks26/domain: contract v1. See README.md and CHANGELOG.md.
export * from './types.ts';
export { CONTRACT_VERSION, MAX_ID_LENGTH, MAX_REPORT_TEXT_BYTES, WIRE_TYPES, parseWire, validateWire } from './validate.ts';
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
} from './rules.ts';
export type { Assigned, BuildJobInputArgs, CommandLedger, FreshnessCurrent, FreshnessSubmitted, SignatureInput } from './rules.ts';
