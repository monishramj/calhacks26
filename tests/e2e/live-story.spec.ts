import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';

// Live two-window story against a local SpacetimeDB, the Laya worker and the coordinator, all running.
// The test only acts as the operator in the browser: it sends reports, and approves or leaves suggestions.
// LIVE_E2E=1 npx playwright test live-story   (LIVE_APP_URL: a dashboard you started, default localhost:5175)
test.skip(!process.env.LIVE_E2E, 'needs a running local SpacetimeDB, Laya and coordinator (LIVE_E2E=1)');

const APP = process.env.LIVE_APP_URL ?? 'http://localhost:5175/';
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
const card = (page: Page, message: string) => review(page).getByTestId(`review-${message}`);
const queueOrder = async (page: Page) => (await queue(page).locator('li').allInnerTexts()).map((t) => t.match(/INC-[a-z]+/)?.[0] ?? '?');
const send = (page: Page, n: number) => page.getByRole('button', { name: `Send next report (#${n})` }).click();

// Operator approves a Laya suggestion: names the incident (new or existing) and the attention, then Approve.
async function approve(page: Page, message: string, o: { target?: string; newId?: string; attention: string }) {
  const c = card(page, message);
  if (o.newId) await c.getByLabel('New incident ID').fill(o.newId);
  else await c.getByLabel('Target').selectOption(o.target!);
  await c.getByLabel('Attention').selectOption(o.attention);
  await c.getByRole('button', { name: 'Approve' }).click();
}

test('live: Laya suggestions reach the review band, the operator approves R07, and the school moves to #1 in the other window', async ({ browser }) => {
  test.setTimeout(15 * 60_000);
  const [desk] = await sql('SELECT * FROM desk');
  await call('reset_run', { commandId: crypto.randomUUID(), runId: desk.run_id });

  const a = await browser.newPage();
  const b = await browser.newPage();
  for (const p of [a, b]) {
    await p.goto(APP);
    await expect(p.getByTestId('run-mode')).toHaveText('LIVE');
  }

  for (let n = 1; n <= 7; n++) await send(a, n);
  await expect(b.getByText('7 / 12 delivered')).toBeVisible();

  // Laya runs in the coordinator after each report arrives; each card gets a suggestion before it can be approved.
  for (const m of ['R01', 'R02', 'R03', 'R07']) await expect(card(a, m).getByText(/Suggestion:/)).toBeVisible({ timeout: 4 * 60_000 });

  // Operator-created incidents from R01-R03: the school, a shelter, and the house beside the school.
  await approve(a, 'R01', { newId: 'INC-school', attention: 'INFORMATION' });
  await approve(a, 'R02', { newId: 'INC-shelter', attention: 'ACTIVE_NEED' });
  await approve(a, 'R03', { newId: 'INC-residence', attention: 'POSSIBLE_LIFE_SAFETY' });
  await expect.poll(() => queueOrder(b)).toEqual(['INC-residence', 'INC-shelter', 'INC-school']);

  // R07 is a correction about the school. Its suggestion was made before the school existed, so the operator picks the target.
  await approve(a, 'R07', { target: 'INC-school', attention: 'POSSIBLE_LIFE_SAFETY' });
  await expect.poll(() => queueOrder(b)).toEqual(['INC-school', 'INC-residence', 'INC-shelter']);
  await expect.poll(() => queueOrder(a)).toEqual(['INC-school', 'INC-residence', 'INC-shelter']);

  // R08-R12 arrive after the school exists. Their suggestions stay pending; none may lower the school.
  for (let n = 8; n <= 12; n++) await send(a, n);
  await expect(b.getByText('12 / 12 delivered')).toBeVisible();
  await expect(card(b, 'R11')).toBeVisible();
  await expect.poll(() => queueOrder(b)).toEqual(['INC-school', 'INC-residence', 'INC-shelter']);
  await expect.poll(() => queueOrder(a)).toEqual(['INC-school', 'INC-residence', 'INC-shelter']);
});
