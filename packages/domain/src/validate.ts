// Wire validation: the committed JSON Schema (ajv) plus the cross-field rules JSON
// Schema can't express. python/domain_contract.py mirrors the cross-field rules.
import Ajv2020 from 'ajv/dist/2020.js';
import type { ValidateFunction } from 'ajv';
import schema from '../schema/contract.schema.json' with { type: 'json' };
import type { ContractError, ErrorCode, Result } from './types';

export const CONTRACT_VERSION: string = schema['x-contractVersion'];
export const MAX_ID_LENGTH: number = schema['x-maxIdLength'];
export const MAX_REPORT_TEXT_BYTES: number = schema['x-maxReportTextBytes'];
/** Largest JSON text parseWire will parse, in UTF-8 bytes. */
export const MAX_WIRE_BYTES: number = schema['x-maxWireBytes'];
/** Deepest object/array nesting any wire value may have. */
export const MAX_DEPTH: number = schema['x-maxDepth'];
export const WIRE_TYPES: readonly string[] = Object.freeze(Object.keys(schema.$defs));

const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
export const isId = (v: unknown): v is string => typeof v === 'string' && ID_PATTERN.test(v);

export const fail = (code: ErrorCode, message: string): { ok: false; error: ContractError } => ({
  ok: false,
  error: { code, message: message.length > 500 ? message.slice(0, 497) + '...' : message },
});

const ajv = new Ajv2020({ allErrors: false, strict: false });
ajv.addSchema(schema);
const compiled = new Map<string, ValidateFunction>();
function validatorFor(type: string): ValidateFunction | null {
  if (!Object.hasOwn(schema.$defs, type)) return null;
  let fn = compiled.get(type);
  if (!fn) {
    fn = ajv.getSchema(`${schema.$id}#/$defs/${type}`)!;
    compiled.set(type, fn);
  }
  return fn;
}

const utf8Bytes = (s: string) => new TextEncoder().encode(s).length;

/** Depth-bounded walk: numbers must be finite and nesting must stay within MAX_DEPTH. */
function shapeProblem(v: unknown, depth = 0): string | null {
  if (typeof v === 'number') return Number.isFinite(v) ? null : 'numbers must be finite';
  if (v === null || typeof v !== 'object') return null;
  if (depth >= MAX_DEPTH) return `nesting deeper than ${MAX_DEPTH}`;
  for (const x of Array.isArray(v) ? v : Object.values(v)) {
    const p = shapeProblem(x, depth + 1);
    if (p) return p;
  }
  return null;
}

/** Picture nodes: chronology and claims may cite only the node's own reports. */
function pictureProblem(n: any): string | null {
  const own = new Set<string>(n.reportIds);
  for (const e of n.chronology) {
    if (!own.has(e.reportId)) return `chronology in ${n.label} names ${e.reportId}, which is not one of its reports`;
    if (e.supersedesReportId !== null && !own.has(e.supersedesReportId)) return `chronology in ${n.label} supersedes ${e.supersedesReportId}, which is not one of its reports`;
  }
  for (const c of n.claims ?? []) {
    const stray = c.reportIds.find((id: string) => !own.has(id));
    if (stray) return `claim in ${n.label} cites ${stray}, which is not one of its reports`;
  }
  for (const child of n.sites ?? n.subareas ?? []) {
    const p = pictureProblem(child);
    if (p) return p;
  }
  return null;
}

/** Cross-field rules (schema `x-crossFieldRules`). Returns a message or null. */
function crossField(type: string, v: any): string | null {
  switch (type) {
    case 'ReportInput':
      return utf8Bytes(v.text) > MAX_REPORT_TEXT_BYTES ? `text is over the ${MAX_REPORT_TEXT_BYTES}-byte limit; rejected, not truncated` : null;
    case 'Report':
      return crossField('ReportInput', v.input);
    case 'JobInput':
      for (const r of v.reports) {
        if (utf8Bytes(r.text) > MAX_REPORT_TEXT_BYTES) return `report ${r.reportId} text is over the ${MAX_REPORT_TEXT_BYTES}-byte limit`;
      }
      return null;
    case 'LocalSuggestion':
      return v.candidateIncidentId !== null && !Object.hasOwn(v.baseIncidentVersions, v.candidateIncidentId)
        ? 'candidateIncidentId must appear in baseIncidentVersions'
        : null;
    case 'IncidentProposal':
      if (!Object.hasOwn(v.baseIncidentVersions, v.incidentId)) return 'baseIncidentVersions must include incidentId';
      for (const r of v.relations) if (r.reportId === r.targetReportId) return 'a relation cannot point a report at itself';
      return null;
    case 'ReportRelation':
      return v.reportId === v.targetReportId ? 'a relation cannot point a report at itself' : null;
    case 'ReviewEvent':
      return v.newRevision > v.priorRevision ? null : 'newRevision must be greater than priorRevision';
    case 'SuggestionRecord':
      return crossField('LocalSuggestion', v.suggestion);
    case 'ProposalRecord':
      return crossField('IncidentProposal', v.proposal);
    case 'SubmitLocalSuggestionCommand':
      return crossField('LocalSuggestion', v.suggestion);
    case 'SubmitIncidentProposalCommand':
      return crossField('IncidentProposal', v.proposal);
    case 'IncidentPictureDraft':
    case 'IncidentPicture':
      for (const area of v.areas) {
        const p = pictureProblem(area);
        if (p) return p;
      }
      return null;
    case 'SubmitIncidentPictureCommand':
      return crossField('IncidentPictureDraft', v.picture);
    default:
      return null;
  }
}

/** Validate an already-parsed value against the wire contract for `type`. */
export function validateWire<T = unknown>(type: string, value: unknown): Result<T> {
  try {
    return validateUnsafe<T>(type, value);
  } catch {
    return fail('INVALID_INPUT', `${String(type).slice(0, 64)}: could not be validated`);
  }
}

function validateUnsafe<T>(type: string, value: unknown): Result<T> {
  const fn = validatorFor(type);
  if (!fn) return fail('INVALID_INPUT', `unknown wire type ${JSON.stringify(type).slice(0, 80)}`);
  const shape = shapeProblem(value);
  if (shape) return fail('INVALID_INPUT', `${type}: ${shape}`);
  if (!fn(value)) {
    const e = fn.errors?.[0];
    const why = e?.keyword === 'maxLength' || e?.keyword === 'maxItems' ? 'is too long; rejected, not truncated' : (e?.message ?? 'is invalid');
    return fail('INVALID_INPUT', `${type}${e?.instancePath ?? ''} ${why}`);
  }
  const cross = crossField(type, value);
  if (cross) return fail('INVALID_INPUT', `${type}: ${cross}`);
  return { ok: true, value: value as T };
}

/** Parse JSON text from another process (e.g. Python) and validate it. Never throws. */
export function parseWire<T = unknown>(type: string, json: string): Result<T> {
  if (typeof json !== 'string') return fail('INVALID_INPUT', `${type}: wire value must be JSON text`);
  if (json.length > MAX_WIRE_BYTES || utf8Bytes(json) > MAX_WIRE_BYTES) {
    return fail('INVALID_INPUT', `${type}: JSON text is over the ${MAX_WIRE_BYTES}-byte wire limit; rejected, not truncated`);
  }
  let value: unknown;
  try {
    value = JSON.parse(json);
  } catch {
    return fail('INVALID_INPUT', `${type}: not valid JSON (NaN and Infinity are not JSON)`);
  }
  return validateWire<T>(type, value);
}
