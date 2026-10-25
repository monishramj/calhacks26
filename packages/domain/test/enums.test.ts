// G0 TEST · enums, versions, adapter surface (§17 "Commands and adapter").
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  ADAPTER_METHODS,
  ATTENTIONS,
  CONTRACT_VERSION,
  ERROR_CODES,
  LOCAL_ACTIONS,
  MAX_ID_LENGTH,
  MAX_REPORT_TEXT_BYTES,
  PROVIDERS,
  ROLES,
} from '../src/index.ts';
import { DOMAIN_ROOT, loadSchema } from './helpers.ts';

describe('§17 enums', () => {
  it('Attention has exactly the three categories, highest attention first', () => {
    expect(ATTENTIONS).toEqual(['POSSIBLE_LIFE_SAFETY', 'ACTIVE_NEED', 'INFORMATION']);
  });
  it('LocalAction', () => {
    expect([...LOCAL_ACTIONS].sort()).toEqual(
      ['ATTACH_REPORT', 'FLAG_CONFLICT', 'FLAG_CORRECTION', 'NEW_INCIDENT', 'REQUEST_REVIEW'].sort(),
    );
  });
  it('Provider', () => {
    expect([...PROVIDERS].sort()).toEqual(['claude', 'fixture', 'local_laya', 'operator', 'recording', 'rule'].sort());
  });
  it('typed errors are exactly the six §17 codes', () => {
    expect([...ERROR_CODES].sort()).toEqual(
      ['INVALID_INPUT', 'INVALID_SOURCE', 'SERVICE_UNAVAILABLE', 'STALE_REVISION', 'UNAUTHORIZED', 'WRONG_RUN'].sort(),
    );
  });
  it('caller roles are backend identities, with no team or dispatcher role', () => {
    expect([...ROLES].sort()).toEqual(['bridge', 'operator', 'simulator', 'worker']);
  });
});

describe('adapter surface', () => {
  it('has the ten §17 methods plus the Claude picture submission and auto-confirm', () => {
    expect([...ADAPTER_METHODS].sort()).toEqual(
      [
        'advanceScenario',
        'approveProposal',
        'autoConfirm',
        'claimJob',
        'operatorEdit',
        'receiveReport',
        'rejectProposal',
        'resetRun',
        'submitIncidentPicture',
        'submitIncidentProposal',
        'submitLocalSuggestion',
        'subscribeState',
      ].sort(),
    );
  });
});

describe('versions and bounds', () => {
  it('CONTRACT_VERSION is frozen at 1.x and matches the schema and the changelog', () => {
    expect(CONTRACT_VERSION).toMatch(/^1\.\d+\.\d+$/);
    expect(loadSchema()['x-contractVersion']).toBe(CONTRACT_VERSION);
    const changelog = readFileSync(join(DOMAIN_ROOT, 'CHANGELOG.md'), 'utf8');
    expect(changelog).toContain(`- v${CONTRACT_VERSION}`);
  });
  it('identifier bound is 128 characters', () => {
    expect(MAX_ID_LENGTH).toBe(128);
  });
  it('report text has a positive byte bound', () => {
    expect(Number.isInteger(MAX_REPORT_TEXT_BYTES)).toBe(true);
    expect(MAX_REPORT_TEXT_BYTES).toBeGreaterThan(0);
  });
});
