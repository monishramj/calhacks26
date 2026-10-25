// G0 TEST · permissions and outcome provenance. Roles come from backend-verified
// identities (§17). Workers cannot approve; no agent approves its own proposal.
import { describe, expect, it } from 'vitest';
import { authorize, checkProviderAllowed } from '../src/index.ts';

const ROLES = ['operator', 'bridge', 'simulator', 'worker'] as const;
type Role = (typeof ROLES)[number];

// [method, ctx, roles allowed]. Every other role must get UNAUTHORIZED.
const MATRIX: [string, Record<string, string> | undefined, Role[]][] = [
  ['subscribeState', undefined, ['operator', 'bridge', 'simulator', 'worker']],
  ['receiveReport', { origin: 'radio' }, ['bridge']],
  ['receiveReport', { origin: 'scenario' }, ['simulator']],
  ['receiveReport', { origin: 'operator' }, ['operator']],
  ['submitLocalSuggestion', { provider: 'local_laya' }, ['worker']],
  ['submitIncidentProposal', { provider: 'claude' }, ['worker']],
  ['submitIncidentProposal', { provider: 'recording' }, ['worker']],
  ['submitIncidentProposal', { provider: 'operator' }, ['operator']],
  ['approveProposal', undefined, ['operator']],
  ['rejectProposal', undefined, ['operator']],
  ['operatorEdit', undefined, ['operator']],
  ['claimJob', undefined, ['worker']],
  ['advanceScenario', undefined, ['operator']],
  ['resetRun', undefined, ['operator']],
];

describe('authorize', () => {
  for (const [method, ctx, allowed] of MATRIX) {
    for (const role of ROLES) {
      const expectOk = allowed.includes(role);
      it(`${role} ${expectOk ? 'may' : 'may not'} ${method}${ctx ? ' ' + JSON.stringify(ctx) : ''}`, () => {
        const r = authorize(role, method, ctx);
        if (expectOk) expect(r).toEqual({ ok: true, value: null });
        else expect(r).toMatchObject({ ok: false, error: { code: 'UNAUTHORIZED' } });
      });
    }
  }

  it('a worker cannot approve even a proposal it did not submit', () => {
    expect(authorize('worker', 'approveProposal', { proposalSubmittedByRole: 'operator' })).toMatchObject({
      ok: false,
      error: { code: 'UNAUTHORIZED' },
    });
  });

  it('a worker cannot pass its output off as operator-authored', () => {
    expect(authorize('worker', 'submitIncidentProposal', { provider: 'operator' })).toMatchObject({
      ok: false,
      error: { code: 'UNAUTHORIZED' },
    });
  });

  it('an operator cannot submit a proposal labeled as Claude output', () => {
    expect(authorize('operator', 'submitIncidentProposal', { provider: 'claude' })).toMatchObject({
      ok: false,
      error: { code: 'UNAUTHORIZED' },
    });
  });

  it('a browser cannot assert radio verification', () => {
    expect(authorize('operator', 'receiveReport', { origin: 'radio' })).toMatchObject({ ok: false, error: { code: 'UNAUTHORIZED' } });
  });

  it('an unknown role is unauthorized', () => {
    expect(authorize('claude', 'approveProposal')).toMatchObject({ ok: false, error: { code: 'UNAUTHORIZED' } });
    expect(authorize('team_lead', 'operatorEdit')).toMatchObject({ ok: false, error: { code: 'UNAUTHORIZED' } });
  });

  it('an unknown method is invalid input, not silently allowed', () => {
    expect(authorize('operator', 'dispatchTeam')).toMatchObject({ ok: false, error: { code: 'INVALID_INPUT' } });
  });
});

describe('checkProviderAllowed: a stub or fixture never stands in for a real provider', () => {
  const cases: [string, string, string, boolean][] = [
    ['live', 'submitLocalSuggestion', 'local_laya', true],
    ['live', 'submitLocalSuggestion', 'recording', true],
    ['live', 'submitLocalSuggestion', 'fixture', false],
    ['live', 'submitLocalSuggestion', 'claude', false],
    ['live', 'submitLocalSuggestion', 'rule', false],
    ['live', 'submitIncidentProposal', 'claude', true],
    ['live', 'submitIncidentProposal', 'operator', true],
    ['live', 'submitIncidentProposal', 'recording', true],
    ['live', 'submitIncidentProposal', 'fixture', false],
    ['live', 'submitIncidentProposal', 'local_laya', false],
    ['replay', 'submitLocalSuggestion', 'fixture', true],
    ['replay', 'submitLocalSuggestion', 'recording', true],
    ['replay', 'submitLocalSuggestion', 'local_laya', false],
    ['replay', 'submitIncidentProposal', 'fixture', true],
    ['replay', 'submitIncidentProposal', 'operator', true],
    ['replay', 'submitIncidentProposal', 'claude', false],
  ];
  it.each(cases)('%s %s provider=%s → allowed=%s', (mode, method, provider, allowed) => {
    const r = checkProviderAllowed(mode, method, provider);
    if (allowed) expect(r).toEqual({ ok: true, value: null });
    else expect(r).toMatchObject({ ok: false, error: { code: 'INVALID_SOURCE' } });
  });

  it('an unknown mode is invalid input', () => {
    expect(checkProviderAllowed('hybrid', 'submitLocalSuggestion', 'local_laya')).toMatchObject({
      ok: false,
      error: { code: 'INVALID_INPUT' },
    });
  });
});
