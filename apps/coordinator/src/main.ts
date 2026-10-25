// Coordinator entry. Backend: FIXTURE (in-memory) until G3's live adapter lands.
//   npm start -w @calhacks26/coordinator               # Laya from LOCAL_LAYA_URL if healthy, Claude if keyed
//   npm start -w @calhacks26/coordinator -- --laya-stub  # labeled stub instead of Laya
import { createFixtureBackend } from './fixtureBackend';
import { layaReady, runOnce, type LayaMode } from './runner';

const backend = createFixtureBackend();
const url = process.env.LOCAL_LAYA_URL;
let laya: LayaMode = { kind: 'off' };
if (process.argv.includes('--laya-stub')) laya = { kind: 'stub' };
else if (url && (await layaReady(url))) laya = { kind: 'http', url };
const claude = Boolean(process.env.ANTHROPIC_API_KEY && process.env.CLAUDE_MODEL);

console.log(JSON.stringify({ event: 'start', backend: 'fixture', runId: backend.runId, laya: laya.kind, claude: claude ? process.env.CLAUDE_MODEL : 'unavailable' }));
const handled = await runOnce(backend, backend.runId, { laya, claude });
const left = backend.jobs.filter((j) => j.job.state === 'QUEUED').map((j) => j.job.jobId);
console.log(JSON.stringify({ event: 'done', handled, stillQueued: left }));
