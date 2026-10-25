// Coordinator job runner (D-007): claimJob -> Laya or Claude -> submit through the backend.
// It only claims kinds whose provider is actually up, so an offline provider leaves jobs
// queued and reports reviewable instead of producing a fake result (§10).
import { validateWire, type Result, type Job, type JobInput, type JobKind, type LocalSuggestion } from '@calhacks26/domain';
import { check } from './inference/claude/check';
import { enrich } from './inference/claude/enrich';
import type { WorkerBackend } from './fixtureBackend';

const MAX_ATTEMPTS = 3;
type Backend = WorkerBackend;

const LAYA_TIMEOUT_MS = 10_000;
/** Picture jobs wait for a short quiet period so reports that arrive together share one pass (one job per incident). */
const SETTLE_MS = 1500;
const SETTLE_MAX_MS = 4000;

export type LayaMode = { kind: 'http'; url: string } | { kind: 'stub' } | { kind: 'off' };

/** GET /health on the Laya worker (services/local-laya). */
export async function layaReady(url: string): Promise<boolean> {
  try {
    const r = await fetch(new URL('/health', url), { signal: AbortSignal.timeout(3000) });
    return r.ok && (await r.json()).status === 'ready';
  } catch {
    return false;
  }
}

/** POST /suggest with the JobInput; the worker returns a LocalSuggestion or {error:{code}}. */
async function layaSuggest(url: string, input: JobInput): Promise<LocalSuggestion | string> {
  try {
    const r = await fetch(new URL('/suggest', url), {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(input), signal: AbortSignal.timeout(LAYA_TIMEOUT_MS),
    });
    const body = await r.json();
    if (!r.ok) return `laya ${r.status} ${body?.error?.code ?? ''}`.trim();
    const v = validateWire<LocalSuggestion>('LocalSuggestion', body);
    if (!v.ok) return `laya returned an invalid suggestion: ${v.error.message}`;
    if (v.value.inputSignature !== input.inputSignature || v.value.provider !== 'local_laya') return 'laya changed inputSignature or provider';
    return v.value;
  } catch (e) {
    return `laya unreachable: ${(e as Error).name}`;
  }
}

/** STUB, labeled provider 'fixture': routes the report to manual review. Never a Laya result. */
function stubSuggestion(job: Job, input: JobInput): LocalSuggestion {
  return {
    runId: input.runId, reportId: input.targetReportId!, action: 'REQUEST_REVIEW', candidateIncidentId: null, attention: null,
    scores: [], evidenceReportIds: [input.targetReportId!], baseIncidentVersions: job.baseIncidentVersions,
    inputSignature: input.inputSignature, provider: 'fixture',
  };
}

export async function runOnce(backend: Backend, runId: string, opts: { laya: LayaMode; claude: boolean; log?: (line: object) => void }) {
  const log = opts.log ?? ((l) => console.log(JSON.stringify(l)));
  const kinds: JobKind[] = [];
  if (opts.laya.kind !== 'off') kinds.push('LOCAL_SUGGESTION');
  if (opts.claude) kinds.push('LOCAL_CHECK', 'INCIDENT_PROPOSAL');
  if (kinds.length === 0) return log({ event: 'idle', why: 'no provider available: Laya off, Claude unavailable' }), 0;

  let handled = 0;
  for (;;) {
    // Checks before pictures: a check can confirm a report now; a picture only describes.
    let claimed: Awaited<ReturnType<Backend['claimJob']>> = { ok: true, value: null };
    for (const k of kinds) {
      claimed = await backend.claimJob({ runId, kinds: [k] });
      if (!claimed.ok || claimed.value) break;
    }
    if (!claimed.ok) return log({ event: 'claim_failed', error: claimed.error }), handled;
    if (!claimed.value) return handled;
    const { job, input } = claimed.value;
    handled += 1;
    if (job.attempts > MAX_ATTEMPTS) return log({ event: 'giving_up', jobId: job.jobId, attempts: job.attempts }), handled;

    if (job.kind === 'LOCAL_SUGGESTION') {
      const s = opts.laya.kind === 'http' ? await layaSuggest(opts.laya.url, input) : stubSuggestion(job, input);
      if (typeof s === 'string') { log({ event: 'laya_failed', jobId: job.jobId, detail: s }); return handled; }
      const r = await backend.submitLocalSuggestion({ jobId: job.jobId, suggestion: s });
      log({ event: 'suggestion', jobId: job.jobId, provider: s.provider, action: s.action, submitted: r.ok ? r.value : r.error });
    } else if (job.kind === 'LOCAL_CHECK') {
      const res = await check(job, input);
      if (!res.ok) { log({ event: 'claude_check_failed', jobId: job.jobId, ...res }); return handled; }
      const r = await backend.autoConfirm({ jobId: job.jobId, check: res.check });
      log({ event: 'claude_check', jobId: job.jobId, reportId: res.check.reportId, action: res.check.action, attention: res.check.attention, model: res.model, ms: res.ms, submitted: r.ok ? r.value : r.error });
    } else {
      const res = await enrich(job, input);
      if (!res.ok) { log({ event: 'claude_failed', jobId: job.jobId, ...res }); return handled; }
      // The optional queue proposal goes first: submitting the picture finishes the job.
      if (res.proposal) {
        const p = await backend.submitIncidentProposal({ jobId: job.jobId, proposal: res.proposal });
        log({ event: 'proposal', jobId: job.jobId, submitted: p.ok ? p.value : p.error, proposal: res.proposal });
      }
      const r = await backend.submitIncidentPicture({ jobId: job.jobId, picture: res.picture });
      log({ event: 'picture', jobId: job.jobId, incidentId: res.picture.incidentId, model: res.model, responses: res.responses, toolExecutions: res.toolExecutions, ms: res.ms, submitted: r.ok ? r.value : r.error });
    }
  }
}

/**
 * Long-running loop (one per provider, see `only`): run when the active run has queued jobs for a provider that is up, else wait for a table change or the tick.
 * The Claude loop runs `claudeConcurrency` jobs at once (CLAUDE_CONCURRENCY, default 3).
 */
export async function runLoop(
  backend: Backend & { runId(): string | null; queued(kinds: string[]): number; onChange(cb: () => void): void },
  getOpts: () => Promise<{ laya: LayaMode; claude: boolean }>,
  { tickMs = 3000, signal, only, claudeConcurrency = Number(process.env.CLAUDE_CONCURRENCY) || 3 }: { tickMs?: number; signal?: AbortSignal; only?: 'laya' | 'claude'; claudeConcurrency?: number } = {},
) {
  let wake = () => {};
  let lastChange = 0;
  backend.onChange(() => ((lastChange = Date.now()), wake()));
  while (!signal?.aborted) {
    const runId = backend.runId(); // jobs of old runs are never claimed: claim is always for the active run
    const all = await getOpts();
    // `only` makes this an independent loop for one provider, so a slow Claude job never queues behind Laya (or the reverse).
    const opts: { laya: LayaMode; claude: boolean } = { laya: only === 'claude' ? { kind: 'off' } : all.laya, claude: only === 'laya' ? false : all.claude };
    const kinds = [...(opts.laya.kind !== 'off' ? ['LOCAL_SUGGESTION'] : []), ...(opts.claude ? ['LOCAL_CHECK', 'INCIDENT_PROPOSAL'] : [])];
    if (runId && kinds.length && backend.queued(kinds) > 0) {
      if (kinds.includes('INCIDENT_PROPOSAL') && backend.queued(['LOCAL_CHECK']) === 0) {
        // Debounce pictures (checks never wait): until confirmations stop for SETTLE_MS (capped), so a burst makes one pass per incident.
        const started = Date.now();
        while (Date.now() - lastChange < SETTLE_MS && Date.now() - started < SETTLE_MAX_MS) await new Promise((r) => setTimeout(r, 100));
      }
      // A failed pass is logged and retried later; it must not stop the worker.
      const lanes = opts.claude && only === 'claude' ? claudeConcurrency : 1;
      await Promise.all(
        Array.from({ length: lanes }, () => runOnce(backend, runId, opts).catch((e: unknown) => console.log(JSON.stringify({ event: 'loop_error', detail: (e as Error).message })))),
      );
    }
    await new Promise<void>((res) => { wake = res; setTimeout(res, tickMs); });
  }
}
