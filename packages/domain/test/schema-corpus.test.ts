// G0 TEST · wire contract: the committed JSON Schema and src/ validators must agree on
// every corpus payload. Python runs the same corpus (test/python/test_wire_contract.py).
import { describe, expect, it } from 'vitest';
import { WIRE_TYPES, parseWire, validateWire } from '../src/index.ts';
import { EXPECTED_WIRE_TYPES, loadCorpus, loadSchema, schemaValidators } from './helpers.ts';

const corpus = loadCorpus();

describe('schema structure', () => {
  const schema = loadSchema();

  it('WIRE_TYPES lists exactly the frozen wire types', () => {
    expect([...WIRE_TYPES].sort()).toEqual([...EXPECTED_WIRE_TYPES].sort());
  });

  it('has a corpus file for every wire type and a $defs entry for every corpus file', () => {
    expect(corpus.map((c) => c.type).sort()).toEqual([...EXPECTED_WIRE_TYPES].sort());
    for (const c of corpus) expect(Object.keys(schema.$defs)).toContain(c.type);
  });

  it.each(EXPECTED_WIRE_TYPES)('%s is a closed object with every property required (explicit nulls, no hidden extras)', (name) => {
    const def = schema.$defs[name];
    expect(typeof def, `${name} is still a placeholder`).toBe('object');
    expect(def.type).toBe('object');
    const closed = def.additionalProperties === false || def.unevaluatedProperties === false;
    expect(closed, `${name} must reject unknown fields`).toBe(true);
    const props = Object.keys(def.properties ?? {});
    expect(props.length).toBeGreaterThan(0);
    expect([...(def.required ?? [])].sort()).toEqual(props.sort());
  });
});

describe.each(corpus.map((c) => [c.type, c] as const))('corpus %s', (type, c) => {
  const validators = schemaValidators();

  it.each(c.valid.map((v) => [v.name, v.payload] as const))('schema accepts: %s', (_name, payload) => {
    expect(validators[type]!(payload)).toBe(true);
  });
  const schemaExpressible = c.invalid.filter((v) => !v.crossField);
  it.each(schemaExpressible.map((v) => [v.name, v.payload] as const))('schema rejects: %s', (_name, payload) => {
    expect(validators[type]!(payload)).toBe(false);
  });

  it.each(c.valid.map((v) => [v.name, v.payload] as const))('validateWire accepts: %s', (_name, payload) => {
    const r = validateWire(type, payload);
    expect(r).toEqual({ ok: true, value: payload });
  });
  it.each(c.invalid.map((v) => [v.name, v.payload] as const))('validateWire rejects with INVALID_INPUT: %s', (_name, payload) => {
    const r = validateWire(type, payload);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('INVALID_INPUT');
  });

  it.each(c.valid.map((v) => [v.name, v.payload] as const))('parseWire round-trips serialized JSON: %s', (_name, payload) => {
    const r = parseWire(type, JSON.stringify(payload));
    expect(r).toEqual({ ok: true, value: payload });
  });
});

describe('validateWire on unknown types', () => {
  it('rejects an unknown type name with INVALID_INPUT instead of accepting', () => {
    const r = validateWire('TeamAssignment', { team: 'a' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('INVALID_INPUT');
  });
});
