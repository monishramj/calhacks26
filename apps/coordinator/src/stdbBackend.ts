// Live WorkerBackend on SpacetimeDB 2.13 (bindings: src/module_bindings, from `spacetime generate`).
// Reducers take one JSON command string and return nothing, so claimJob reads the claimed job row
// (json + inputJson) from the subscribed `job` table. Errors arrive as "CODE: message".
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { validateWire, type Job, type JobInput, type Result } from '@calhacks26/domain';
import { DbConnection } from './module_bindings';
import type { WorkerBackend } from './fixtureBackend';

const TOKEN_FILE = new URL('../.worker-token', import.meta.url);

export type StdbBackend = WorkerBackend & {
  identityHex: string;
  /** Active run id from the `desk` row, or null before it is delivered. */
  runId(): string | null;
  /** Jobs of these kinds waiting in the active run. */
  queued(kinds: string[]): number;
  onChange(cb: () => void): void;
  close(): void;
};

const fail = (e: unknown): Result<never> => {
  const m = (e as Error)?.message ?? String(e);
  const hit = /([A-Z_]{4,}): (.*)/s.exec(m);
  return { ok: false, error: { code: (hit?.[1] ?? 'INVALID_INPUT') as never, message: hit?.[2] ?? m } };
};

export async function connectStdb(uri: string, database: string): Promise<StdbBackend> {
  const saved = existsSync(TOKEN_FILE) ? readFileSync(TOKEN_FILE, 'utf8').trim() : undefined;
  const listeners: Array<() => void> = [];
  let me = '';
  const conn = await new Promise<DbConnection>((resolve, reject) => {
    const c = DbConnection.builder()
      .withUri(uri)
      .withDatabaseName(database)
      .withToken(saved)
      .onConnect((conn, identity, token) => {
        me = identity.toHexString();
        if (token !== saved) writeFileSync(TOKEN_FILE, token, { mode: 0o600 });
        resolve(conn);
      })
      .onConnectError((_c, e) => reject(e))
      .build();
    void c;
  });
  await new Promise<void>((resolve, reject) =>
    conn.subscriptionBuilder().onApplied(() => resolve()).onError((ctx) => reject(ctx.event ?? new Error('subscription failed')))
      .subscribe(['SELECT * FROM desk', 'SELECT * FROM job']),
  );
  const poke = () => listeners.forEach((f) => f());
  conn.db.job.onInsert(poke); conn.db.job.onUpdate(poke); conn.db.desk.onInsert(poke); conn.db.desk.onUpdate(poke);

  const runId = () => [...conn.db.desk.iter()][0]?.runId ?? null;
  const jobs = () => [...conn.db.job.iter()].filter((r) => r.runId === runId());
  const handed = new Set<string>();
  const call = async (run: () => Promise<unknown>): Promise<Result<null>> => {
    try { await run(); return { ok: true, value: null }; } catch (e) { return fail(e); }
  };

  return {
    identityHex: me,
    runId,
    // A claim whose lease lapsed (a worker timed out) is retried, so it counts as waiting work.
    queued: (kinds) =>
      jobs().filter((r) => {
        const job = JSON.parse(r.json) as Job;
        const lapsed = r.state === 'CLAIMED' && job.claim !== null && Date.parse(job.claim.leaseExpiresAt) < Date.now();
        return (r.state === 'QUEUED' || lapsed) && kinds.includes(job.kind);
      }).length,
    onChange: (cb) => void listeners.push(cb),
    close: () => conn.disconnect(),
    async claimJob(cmd) {
      const r = await call(() => conn.reducers.claimJob({ commandJson: JSON.stringify(cmd) }));
      if (!r.ok) return r;
      for (const row of jobs()) {
        const job = JSON.parse(row.json) as Job;
        const key = `${job.jobId}#${job.attempts}`;
        if (job.state !== 'CLAIMED' || job.claim?.workerIdentity !== me || !cmd.kinds.includes(job.kind) || handed.has(key)) continue;
        const v = validateWire<JobInput>('JobInput', JSON.parse(row.inputJson));
        if (!v.ok) return v;
        handed.add(key);
        return { ok: true, value: { job, input: v.value } };
      }
      return { ok: true, value: null };
    },
    async submitLocalSuggestion(cmd) {
      const r = await call(() => conn.reducers.submitLocalSuggestion({ commandJson: JSON.stringify(cmd) }));
      return r.ok ? { ok: true, value: { suggestionId: cmd.jobId } } : r;
    },
    async submitIncidentPicture(cmd) {
      const r = await call(() => conn.reducers.submitIncidentPicture({ commandJson: JSON.stringify(cmd) }));
      return r.ok ? { ok: true, value: { incidentId: cmd.picture.incidentId } } : r;
    },
    async submitIncidentProposal(cmd) {
      const r = await call(() => conn.reducers.submitIncidentProposal({ commandJson: JSON.stringify(cmd) }));
      return r.ok ? { ok: true, value: { proposalId: cmd.proposal.proposalId } } : r;
    },
  };
}
