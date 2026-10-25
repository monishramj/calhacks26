import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';

// Live two-client story against a local SpacetimeDB (scripts/stdb-setup.sh): LIVE_E2E=1 npx playwright test live-story
// No worker runs here, so the test plays the operator-authored part itself over HTTP (labeled provider "operator").
test.skip(!process.env.LIVE_E2E, 'needs a running local SpacetimeDB (LIVE_E2E=1)');

const env = Object.fromEntries(
  readFileSync('.env.local' /* cwd = apps/web */, 'utf8').split('\n').filter(Boolean).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]),
);
const base = env.VITE_STDB_URI.replace(/^ws/, 'http') + `/v1/database/${env.VITE_STDB_DATABASE}`;
const auth = { Authorization: `Bearer ${env.VITE_STDB_TOKEN}` };

async function call(reducer: string, arg: unknown) {
  const r = await fetch(`${base}/call/${reducer}`, { method: 'POST', headers: { ...auth, 'Content-Type': 'application/json' }, body: JSON.stringify([JSON.stringify(arg)]) });
  expect(r.ok, `${reducer}: ${await r.clone().text()}`).toBe(true);
}
async function sql(q: string): Promise<Record<string, any>[]> {
  const r = await fetch(`${base}/sql`, { method: 'POST', headers: auth, body: q });
  const [res] = await r.json();
  const names = res.schema.elements.map((e: any) => e.name.some);
  return res.rows.map((row: unknown[]) => Object.fromEntries(names.map((n: string, i: number) => [n, row[i]])));
}

const queue = (page: Page) => page.locator('#section-queue');
const review = (page: Page) => page.locator('#section-review');
const queueOrder = async (page: Page) => (await queue(page).locator('li').allInnerTexts()).map((t) => t.match(/INC-[a-z]+/)?.[0] ?? '?');

test('live: approval in one window moves the school to #1 in the other', async ({ browser }) => {
  const [desk] = await sql('SELECT * FROM desk');
  await call('reset_run', { commandId: crypto.randomUUID(), runId: desk.run_id });

  const a = await browser.newPage();
  const b = await browser.newPage();
  for (const p of [a, b]) {
    await p.goto('http://localhost:5175/');
    await expect(p.getByTestId('run-mode')).toHaveText('LIVE');
  }
  for (let n = 1; n <= 7; n++) await a.getByRole('button', { name: `Send next report (#${n})` }).click();
  await expect(b.getByText('7 / 12 delivered')).toBeVisible();

  // Operator-authored incidents from R01-R03 so the school has something to overtake.
  const run = (await sql('SELECT * FROM desk'))[0];
  const rid = async (m: string) => JSON.parse((await sql(`SELECT * FROM report WHERE message_id = '${m}' AND run_id = '${run.run_id}'`))[0].json).reportId as string;
  const propose = async (id: string, incidentId: string, base: number, report: string, attention: string, signature: string) => {
    const proposal = {
      runId: run.run_id, proposalId: id, incidentId, baseIncidentVersions: { [incidentId]: base }, inputSignature: signature,
      addReportIds: [report], relations: [], suggestedStatus: base ? null : 'OPEN', suggestedAttention: attention,
      suggestedSummary: null, evidenceReportIds: [report], uncertainties: [], provider: 'operator',
    };
    await call('submit_incident_proposal', { jobId: null, proposal });
    return proposal;
  };
  for (const [m, inc, att] of [['R01', 'INC-school', 'INFORMATION'], ['R02', 'INC-shelter', 'ACTIVE_NEED'], ['R03', 'INC-residence', 'POSSIBLE_LIFE_SAFETY']]) {
    const sig = (await sql('SELECT * FROM desk'))[0].new_incident_signature;
    const p = await propose(`${run.run_id}-op-${m}`, inc, 0, await rid(m), att, sig);
    await call('approve_proposal', { commandId: crypto.randomUUID(), runId: run.run_id, proposalId: p.proposalId, inputSignature: sig, baseIncidentVersions: p.baseIncidentVersions });
  }
  await expect.poll(() => queueOrder(a)).toEqual(['INC-residence', 'INC-shelter', 'INC-school']);

  // R07 as a pending possible-harm proposal on the school.
  const sig = (await sql("SELECT * FROM incident_signature WHERE incident_id = 'INC-school'"))[0].signature;
  await propose(`${run.run_id}-op-R07`, 'INC-school', 1, await rid('R07'), 'POSSIBLE_LIFE_SAFETY', sig);
  await expect(review(b).getByText('Correction: the school gym is clear', { exact: false })).toBeVisible();
  await expect.poll(() => queueOrder(b)).toEqual(['INC-residence', 'INC-shelter', 'INC-school']);

  await review(a).getByRole('button', { name: 'Approve' }).click();
  await expect.poll(() => queueOrder(a)).toEqual(['INC-school', 'INC-residence', 'INC-shelter']);
  await expect.poll(() => queueOrder(b)).toEqual(['INC-school', 'INC-residence', 'INC-shelter']);
});
