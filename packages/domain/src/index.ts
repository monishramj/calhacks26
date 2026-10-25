// G0 TEST harness stub. Every export exists so the contract tests load and fail on
// behavior, not on missing modules. G0 IMPLEMENT replaces each body; the tests in
// ../test define what each must do. Do not import this from other workstreams yet.

export type ErrorCode =
  | 'STALE_REVISION'
  | 'INVALID_SOURCE'
  | 'INVALID_INPUT'
  | 'UNAUTHORIZED'
  | 'WRONG_RUN'
  | 'SERVICE_UNAVAILABLE';

export type ContractError = { code: ErrorCode; message: string };
export type Result<T> = { ok: true; value: T } | { ok: false; error: ContractError };

const pending = (what: string): { ok: false; error: ContractError } => ({
  ok: false,
  error: { code: 'SERVICE_UNAVAILABLE', message: `G0 IMPLEMENT pending: ${what}` },
});

export const CONTRACT_VERSION: string = '0.0.0-unfrozen';

export const ATTENTIONS: readonly string[] = [];
export const LOCAL_ACTIONS: readonly string[] = [];
export const PROVIDERS: readonly string[] = [];
export const ERROR_CODES: readonly string[] = [];
export const ROLES: readonly string[] = [];
export const ADAPTER_METHODS: readonly string[] = [];
/** Names of every `$defs` entry in schema/contract.schema.json. */
export const WIRE_TYPES: readonly string[] = [];

export const MAX_ID_LENGTH: number = 0;
export const MAX_REPORT_TEXT_BYTES: number = 0;

/** Validate an already-parsed value against the wire contract for `type`. */
export function validateWire(_type: string, _value: unknown): Result<unknown> {
  return pending('validateWire');
}

/** Parse JSON text from another process (e.g. Python) and validate it. Never throws. */
export function parseWire(_type: string, _json: string): Result<unknown> {
  return pending('parseWire');
}

/** Backend side of receiveReport: wrap a validated input with backend-assigned fields. */
export function acceptReport(_input: unknown, _assigned: unknown): Result<unknown> {
  return pending('acceptReport');
}

/** Classify an incoming report against stored reports by (runId, sourceId, messageId). */
export function classifyIntake(_existing: readonly unknown[], _input: unknown): Result<unknown> {
  return pending('classifyIntake');
}

/** Idempotency for mutating commands keyed by commandId. */
export function recallCommand(_ledger: ReadonlyMap<string, unknown>, _commandId: string, _payload: unknown): Result<unknown> {
  return pending('recallCommand');
}

/** Return a ledger that also holds `result` for `commandId` (the input ledger is unchanged). */
export function recordCommand(
  ledger: ReadonlyMap<string, unknown>,
  _commandId: string,
  _payload: unknown,
  _result: unknown,
): ReadonlyMap<string, unknown> {
  return ledger;
}

export function authorize(_role: string, _method: string, _ctx?: unknown): Result<null> {
  return pending('authorize');
}

export function checkProviderAllowed(_mode: string, _method: string, _provider: string): Result<null> {
  return pending('checkProviderAllowed');
}

export function computeInputSignature(_input: unknown): string {
  return '';
}

export function checkFreshness(_submitted: unknown, _current: unknown): Result<null> {
  return pending('checkFreshness');
}

/** Every report ID an IncidentProposal or LocalSuggestion cites. */
export function citedReportIds(_proposalOrSuggestion: unknown): string[] {
  return [];
}

export function checkSourceOwnership(_runId: string, _reportIds: readonly string[], _known: ReadonlyMap<string, unknown>): Result<null> {
  return pending('checkSourceOwnership');
}

/** Build the model-facing job input from delivered state only. */
export function buildJobInput(_args: unknown): Result<unknown> {
  return pending('buildJobInput');
}
