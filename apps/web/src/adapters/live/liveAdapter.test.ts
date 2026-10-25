import { vi } from 'vitest';
import type { DeskState } from '../contract';
import { exerciseFixture } from '../replay';

// A fake SpacetimeDB connection: the test fires the builder's callbacks by hand.
const h = vi.hoisted(() => ({ cb: {} as Record<string, (...a: any[]) => void>, rows: [] as any[], conn: null as any, applied: () => {} }));
vi.mock('./module_bindings', () => {
  const table = (rows: () => any[]) => ({ iter: () => rows(), onInsert() {}, onUpdate() {}, onDelete() {} });
  const empty = table(() => []);
  const db = { desk: table(() => h.rows), report: empty, incident: empty, relation: empty, suggestion: empty, proposal: empty, reviewEvent: empty, incidentSignature: empty, incidentPicture: empty, job: empty };
  const conn = { db, subscriptionBuilder: () => ({ onApplied: (f: () => void) => ((h.applied = f), { subscribeToAllTables() {} }) }) };
  h.conn = conn;
  const builder: any = new Proxy({}, { get: (_t, k: string) => (f: any) => (k === 'build' ? conn : (f && (h.cb[k] = f), builder)) });
  return { DbConnection: { builder: () => builder } };
});

import { createLiveAdapter } from './liveAdapter';

const setup = () => {
  h.rows = [{ runId: 'run1' }];
  const fetchMock = vi.fn(async () => new Response('', { status: 200 }));
  vi.stubGlobal('fetch', fetchMock);
  const adapter = createLiveAdapter(exerciseFixture, { uri: 'ws://x', database: 'd' });
  let st: DeskState | null = null;
  adapter.subscribeState((s) => (st = s));
  h.cb.onConnect(h.conn);
  return { adapter, fetchMock, get: () => st! };
};

describe('live adapter database loss', () => {
  it('keeps the last view as LOCAL DEGRADED and stops writes', async () => {
    const { adapter, fetchMock, get } = setup();
    h.applied();
    expect(get().mode).toBe('LIVE');
    h.cb.onDisconnect({}, new Error('closed'), 1, 1000);
    expect(get().mode).toBe('LOCAL DEGRADED');
    expect(get().runId).toBe('run1');
    const r = await adapter.operatorEdit({} as any);
    expect(r).toMatchObject({ ok: false, error: { code: 'SERVICE_UNAVAILABLE' } });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns to LIVE with fresh state once the resubscription lands', () => {
    const { get } = setup();
    h.applied();
    h.cb.onDisconnect({}, new Error('closed'), 1, 1000);
    h.rows = [{ runId: 'run2' }]; // changed while we were away
    expect(get().runId).toBe('run1'); // still the last confirmed view until the new data arrives
    h.applied();
    expect(get()).toMatchObject({ mode: 'LIVE', runId: 'run2' });
  });
});
