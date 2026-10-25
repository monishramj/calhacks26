// Coordinator entry: long-running worker loop on SpacetimeDB (or --fixture: one pass over the in-memory backend).
//   npm start                # Laya from LOCAL_LAYA_URL while healthy; enrich with Claude if ANTHROPIC_API_KEY and CLAUDE_MODEL are set
//   npm start -- --laya-stub # labeled stub instead of Laya
import { enrichReady } from './inference/claude/enrich';
import { createFixtureBackend } from './fixtureBackend';
import { layaReady, runLoop, runOnce, type LayaMode } from './runner';
import { connectStdb } from './stdbBackend';

const url = process.env.LOCAL_LAYA_URL;
const getOpts = async (): Promise<{ laya: LayaMode; claude: boolean }> => ({
  laya: process.argv.includes('--laya-stub') ? { kind: 'stub' } : url && (await layaReady(url)) ? { kind: 'http', url } : { kind: 'off' },
  claude: enrichReady(),
});
const opts = await getOpts();
const info = { provider: 'claude', enrich: opts.claude ? process.env.CLAUDE_MODEL : 'unavailable', laya: opts.laya.kind };

if (process.argv.includes('--fixture')) {
  const backend = createFixtureBackend();
  console.log(JSON.stringify({ event: 'start', backend: 'fixture', runId: backend.runId, ...info }));
  const handled = await runOnce(backend, backend.runId, opts);
  console.log(JSON.stringify({ event: 'done', handled, stillQueued: backend.jobs.filter((j) => j.job.state === 'QUEUED').map((j) => j.job.jobId) }));
  process.exit(0);
}

const backend = await connectStdb(process.env.SPACETIMEDB_URI || 'http://127.0.0.1:3000', process.env.SPACETIMEDB_DATABASE || 'incident-desk');
console.log(JSON.stringify({ event: 'start', backend: 'spacetimedb', identity: backend.identityHex, ...info }));
await Promise.all([runLoop(backend, getOpts, { only: 'laya' }), runLoop(backend, getOpts, { only: 'claude' })]);
