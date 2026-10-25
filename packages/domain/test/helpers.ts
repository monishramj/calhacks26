import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';

export const DOMAIN_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const REPO_ROOT = resolve(DOMAIN_ROOT, '..', '..');
export const SCHEMA_PATH = join(DOMAIN_ROOT, 'schema', 'contract.schema.json');
export const CORPUS_DIR = join(DOMAIN_ROOT, 'test', 'corpus');

/** The wire types G0 freezes. The test owns this list; WIRE_TYPES must match it. */
export const EXPECTED_WIRE_TYPES = [
  'ReportInput',
  'Report',
  'IncidentView',
  'LabelScore',
  'LocalSuggestion',
  'IncidentProposal',
  'ReportRelation',
  'SuggestionRecord',
  'ProposalRecord',
  'Job',
  'JobInput',
  'ReviewEvent',
  'ScenarioState',
  'ContractError',
  'ApproveProposalCommand',
  'RejectProposalCommand',
  'OperatorEditCommand',
  'ClaimJobCommand',
  'SubmitLocalSuggestionCommand',
  'SubmitIncidentProposalCommand',
  'AdvanceScenarioCommand',
  'ResetRunCommand',
  'IncidentPictureDraft',
  'IncidentPicture',
  'SubmitIncidentPictureCommand',
  'ClaudeCheck',
  'SubmitClaudeCheckCommand',
  'ClaudeCheckRecord',
] as const;

export type CorpusCase = { name: string; payload: unknown; crossField?: boolean };
export type Corpus = { type: string; valid: CorpusCase[]; invalid: CorpusCase[] };

export function loadSchema(): any {
  return JSON.parse(readFileSync(SCHEMA_PATH, 'utf8'));
}

export function loadCorpus(): Corpus[] {
  return readdirSync(CORPUS_DIR)
    .filter((f) => f.endsWith('.json'))
    .sort()
    .map((f) => JSON.parse(readFileSync(join(CORPUS_DIR, f), 'utf8')) as Corpus);
}

export function corpusFor(type: string): Corpus {
  const found = loadCorpus().find((c) => c.type === type);
  if (!found) throw new Error(`no corpus for ${type}`);
  return found;
}

export function firstValid(type: string): any {
  return structuredClone(corpusFor(type).valid[0]!.payload);
}

/** Validators compiled straight from the committed schema, independent of src/. */
export function schemaValidators(): Record<string, (v: unknown) => boolean> {
  const schema = loadSchema();
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  ajv.addSchema(schema);
  const out: Record<string, (v: unknown) => boolean> = {};
  for (const name of Object.keys(schema.$defs ?? {})) {
    const fn = ajv.getSchema(`${schema.$id}#/$defs/${name}`);
    if (fn) out[name] = (v) => fn(v) as boolean;
  }
  return out;
}

export function readJsonIfExists(path: string): any | null {
  return existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : null;
}

// The R01–R12 rule-test script (GROUND_TRUTH §18). The demo runs the Outer Sunset exercise in fixtures/private/exercise.
export const EXERCISE_PATH = join(REPO_ROOT, 'packages', 'domain', 'test', 'fixtures', 'r01-r12.exercise.json');
export const EXPECTATIONS_PATH = join(REPO_ROOT, 'packages', 'domain', 'test', 'fixtures', 'r01-r12.expectations.json');
export const SUNSET_EXERCISE_PATH = join(REPO_ROOT, 'fixtures', 'private', 'exercise', 'exercise.json');
export const SUNSET_EXPECTATIONS_PATH = join(REPO_ROOT, 'fixtures', 'private', 'exercise', 'expectations.json');

/** §18 table rows, parsed from the ground truth so fixtures can't drift from it. */
export function groundTruthExercise(): { id: string; text: string; expected: string }[] {
  const doc = readFileSync(join(REPO_ROOT, 'docs', 'GROUND_TRUTH.md'), 'utf8');
  const rows: { id: string; text: string; expected: string }[] = [];
  for (const line of doc.split(/\r?\n/)) {
    const m = /^\| (R\d\d) \| (.+?) \| (.+?) \|$/.exec(line);
    if (m) rows.push({ id: m[1]!, text: m[2]!, expected: m[3]! });
  }
  return rows;
}
