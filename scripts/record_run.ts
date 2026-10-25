// Records one real live run (SpacetimeDB + Laya + Claude through the running coordinator) for dashboard playback.
// Needs the dev:live stack up (scripts/dev-live.sh). Feeds every exercise report in delivery order, waits for
// Laya and the Claude check, plays the operator (approves what sat in the review band for OPERATOR_LAG reports),
// and stores each step's table changes. Run: npx tsx scripts/record_run.ts
import { readFileSync, writeFileSync } from 'node:fs';
import { DELIVERIES } from '../apps/web/src/network/mesh';
import { reviewBand } from '../packages/domain/src/rules/views';
import fixture from '../fixtures/replay/sunset-exercise.json';

const URI = 'http://127.0.0.1:3000';
const DB = 'incident-desk';
const OPERATOR_LAG = 3;
const LIMIT = Number(process.env.LIMIT ?? Infinity);
// Reports sent between waits: the pipeline works several at once, and late results land in later steps.
const BATCH = Number(process.env.BATCH ?? 5);
const skipped = new Set<string>();
const env = Object.fromEntries(
  readFileSync('apps/web/.env.local', 'utf8').split('\n').filter(Boolean).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]),
);
const OP = env.VITE_STDB_TOKEN, SIM = env.VITE_STDB_SIM_TOKEN;
const TABLES = ['report', 'incident', 'relation', 'suggestion', 'proposal', 'review_event', 'incident_picture', 'claude_check', 'incident_signature'] as const;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function call(reducer: string, arg: unknown, token = OP) {
  const res = await fetch(`${URI}/v1/database/${DB}/call/${reducer}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify([JSON.stringify(arg)]),
  });
  return res.ok ? null : (await res.text()).trim();
}

async function sql(q: string): Promise<Record<string, any>[]> {
  const res = await fetch(`${URI}/v1/database/${DB}/sql`, { method: 'POST', headers: { Authorization: `Bearer ${OP}` }, body: q });
  if (!res.ok) throw new Error(await res.text());
  const [r] = await res.json();
  const names = r.schema.elements.map((e: any) => (e.name.some as string).replace(/_(\w)/g, (_, c) => c.toUpperCase()));
  return r.rows.map((row: unknown[]) => Object.fromEntries(names.map((n: string, i: number) => [n, row[i]])));
}

/** Each table as a set of row strings for the run (the json column; signatures as a small object). */
async function snapshot(runId: string): Promise<Record<string, Set<string>>> {
  const out: Record<string, Set<string>> = {};
  for (const t of TABLES) {
    const rows = (await sql(`SELECT * FROM ${t}`)).filter((r) => r.runId === runId);
    out[t] = new Set(rows.map((r) => (t === 'incident_signature' ? JSON.stringify({ incidentId: r.incidentId, signature: r.signature }) : r.json)));
  }
  return out;
}

/** The same DeskState the live adapter builds, for the review band rule. */
function desk(runId: string, s: Record<string, Set<string>>): any {
  const rows = (t: string) => [...s[t]].map((j) => JSON.parse(j));
  return {
    runId, mode: 'LIVE',
    reports: rows('report').sort((a, b) => a.receiveSequence - b.receiveSequence),
    incidents: rows('incident'), relations: rows('relation'), suggestions: rows('suggestion'), proposals: rows('proposal'),
    reviewEvents: rows('review_event').sort((a, b) => a.sequence - b.sequence), scenario: null,
    inputSignatures: Object.fromEntries(rows('incident_signature').map((r) => [r.incidentId, r.signature])),
    pictures: rows('incident_picture'), checks: rows('claude_check'),
  };
}

/** Waits until no job of the given kinds is waiting or running. */
async function settle(runId: string, kinds: string[], maxMs: number) {
  const end = Date.now() + maxMs;
  while (Date.now() < end) {
    const busy = (await sql('SELECT * FROM job')).filter((j) => j.runId === runId && (j.state === 'QUEUED' || j.state === 'CLAIMED') && kinds.includes(JSON.parse(j.json).kind));
    if (busy.length === 0) return true;
    await sleep(500);
  }
  return false;
}

/** The operator approves what the card suggests, as the review band's Approve button does. */
async function operate(runId: string, st: any, deliveredAt: Map<string, number>, step: number, lag: number) {
  for (const item of reviewBand(st)) {
    const report = st.reports.find((r: any) => r.reportId === item.reportId);
    if (!report || skipped.has(report.reportId) || step - (deliveredAt.get(report.input.messageId) ?? step) < lag) continue;
    const proposal = st.proposals.find((p: any) => p.reviewState === 'PENDING' && p.proposal.addReportIds.includes(report.reportId))?.proposal;
    const suggestion = st.suggestions.find((s: any) => s.suggestion.reportId === report.reportId)?.suggestion;
    const commandId = crypto.randomUUID();
    let err: string | null = null;
    if (proposal) {
      err = await call('approve_proposal', { runId, commandId, proposalId: proposal.proposalId, inputSignature: st.inputSignatures[proposal.incidentId], baseIncidentVersions: proposal.baseIncidentVersions });
    } else if (suggestion) {
      const place = report.input.reportedLocation?.placeId ?? null;
      const open = st.incidents.filter((i: any) => i.status === 'OPEN');
      const claude = st.checks.find((c: any) => c.check.reportId === report.reportId)?.check.candidateIncidentId;
      const incident = open.find((i: any) => i.incidentId === claude) ?? open.find((i: any) => i.incidentId === suggestion.candidateIncidentId)
        ?? open.find((i: any) => place && i.confirmedPlaceId === place);
      const base = `INC-${place ?? report.input.messageId}`;
      const incidentId = incident?.incidentId ?? (st.incidents.some((i: any) => i.incidentId === base) ? `${base}-${report.input.messageId}` : base);
      err = await call('operator_edit', {
        runId, commandId, incidentId, baseRevision: incident?.revision ?? 0,
        changes: incident ? { addReportIds: [report.reportId], attention: suggestion.attention } : { status: 'OPEN', attention: suggestion.attention, addReportIds: [report.reportId], confirmedPlaceId: place },
        reason: null, sourceReportIds: [report.reportId],
      });
    } else continue;
    if (err) skipped.add(report.reportId), console.log(`  operator skipped ${report.input.messageId}: ${err.slice(0, 120)}`);
    // Fresh state after each write: revisions and signatures moved.
    return true;
  }
  return false;
}

const diff = (a: Record<string, Set<string>>, b: Record<string, Set<string>>) => {
  const add: Record<string, string[]> = {}, remove: Record<string, string[]> = {};
  for (const t of TABLES) {
    const plus = [...b[t]].filter((x) => !a[t].has(x)), minus = [...a[t]].filter((x) => !b[t].has(x));
    if (plus.length) add[t] = plus;
    if (minus.length) remove[t] = minus;
  }
  return { add, remove };
};

function save(runId: string, steps: unknown[]) {
  writeFileSync(process.env.OUT ?? 'fixtures/replay/claude-run.json', JSON.stringify({
    about: 'One real live run: SpacetimeDB, Laya and Claude via the coordinator, operator approvals by scripts/record_run.ts after '
      + `${OPERATOR_LAG} reports in review. Each step is the table rows that changed after that report.`,
    exerciseVersion: fixture.exerciseVersion, recordedAt: new Date().toISOString(), runId, steps,
  }) + '\n');
}

async function main() {
  const [deskRow] = await sql('SELECT * FROM desk');
  const err = await call('reset_run', { runId: deskRow.runId, commandId: crypto.randomUUID() });
  if (err) throw new Error(`reset_run: ${err}`);
  await sleep(500);
  const [{ runId }] = await sql('SELECT * FROM desk');
  console.log(`run ${runId}: ${DELIVERIES.length} reports`);
  const deliveredAt = new Map<string, number>();
  const steps: unknown[] = [];
  let prev = await snapshot(runId);
  const t0 = Date.now();
  const deliveries = DELIVERIES.slice(0, LIMIT);
  for (const [i, d] of deliveries.entries()) {
    const src = (fixture.reports as Record<string, any>)[d.messageId];
    const sendErr = await call('receive_report', {
      runId, sourceId: src.sourceId, messageId: d.messageId, text: src.text, origin: 'scenario', sentAt: src.sentAt, reportedEventAt: null,
      reportedLocation: src.placeId ? { placeId: src.placeId, source: 'sender_explicit' } : null,
      transport: { verification: 'not_applicable', encoding: 'not_applicable', measurementSource: 'not_applicable', originalBytes: null, applicationPacketBytes: null },
    }, SIM);
    if (sendErr?.startsWith('WRONG_RUN')) throw new Error(`run was reset by another client at ${d.messageId}; recorded ${steps.length} steps`);
    if (sendErr) throw new Error(`receive_report ${d.messageId}: ${sendErr}`);
    deliveredAt.set(d.messageId, i);
    const last = i === deliveries.length - 1;
    if ((i + 1) % BATCH === 0 || last) await settle(runId, ['LOCAL_SUGGESTION', 'LOCAL_CHECK'], 90_000);
    // Operator pass (one write at a time, re-reading state between), then let any new checks finish.
    if ((i + 1) % BATCH === 0 || last) for (let n = 0; n < 20 && (await operate(runId, desk(runId, await snapshot(runId)), deliveredAt, i, last ? 0 : OPERATOR_LAG)); n++);
    if (last) await settle(runId, ['LOCAL_SUGGESTION', 'LOCAL_CHECK', 'INCIDENT_PROPOSAL'], 300_000);
    const next = await snapshot(runId);
    steps.push({ messageId: d.messageId, ...diff(prev, next) });
    save(runId, steps);
    prev = next;
    const st = desk(runId, next);
    console.log(`${i + 1}/${deliveries.length} ${d.messageId} · ${Math.round((Date.now() - t0) / 1000)}s · incidents ${st.incidents.length} · pictures ${st.pictures.length} · checks ${st.checks.length} · review ${reviewBand(st).length}`);
  }
  console.log(`wrote fixtures/replay/claude-run.json (${steps.length} steps)`);
}

main().catch((e) => { console.error(e); process.exit(1); });
