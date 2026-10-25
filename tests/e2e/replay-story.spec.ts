import { expect, test, type Page } from '@playwright/test';

// §8 demonstration on the isolated browser replay: start state, R07 surfaces as an
// unconfirmed possible life-safety concern, operator approval moves the school up.
// Every assertion is about labeled fixture data; nothing here claims a live provider ran.

const queue = (page: Page) => page.locator('#section-queue');
const review = (page: Page) => page.locator('#section-review');

async function queueOrder(page: Page): Promise<string[]> {
  const text = await queue(page).locator('li').allInnerTexts();
  return text.map((t) => t.match(/INC-[a-z]+/)?.[0] ?? '?');
}

test('labeled replay: R07 needs review, approval moves the school up', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('run-mode')).toHaveText('LOCAL REPLAY');
  // Banner and scene both carry the disclosure.
  await expect(page.getByText('Fictional Helene-inspired exercise', { exact: false }).first()).toBeVisible();
  await expect(page.getByText(/Inference: fixture/)).toBeVisible();

  await expect.poll(() => queueOrder(page)).toEqual(['INC-residence', 'INC-shelter', 'INC-school']);
  await expect(review(page).getByText('Nothing needs review.')).toBeVisible();

  await page.getByRole('button', { name: 'Send next report (#7)' }).click();
  await expect(page.getByText('7 / 12 delivered')).toBeVisible();
  const r07 = 'Correction: the school gym is clear, but someone may still be upstairs in the main building.';
  await expect(review(page).getByText(r07)).toBeVisible();
  await expect(review(page).getByText(/unconfirmed/i).first()).toBeVisible();
  // A provisional hint does not move the confirmed queue.
  await expect.poll(() => queueOrder(page)).toEqual(['INC-residence', 'INC-shelter', 'INC-school']);

  await review(page).getByRole('button', { name: 'Approve' }).click();
  await expect.poll(() => queueOrder(page)).toEqual(['INC-school', 'INC-residence', 'INC-shelter']);
  await expect(review(page).getByText('Nothing needs review.')).toBeVisible();
});

test('every original stays inspectable through R12, and R11 does not erase R07', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Send next report (#7)' }).click();
  await review(page).getByRole('button', { name: 'Approve' }).click();
  for (const n of [8, 9, 10, 11, 12]) {
    await page.getByRole('button', { name: `Send next report (#${n})` }).click();
  }
  await expect(page.getByRole('button', { name: 'All reports sent' })).toBeDisabled();
  await expect.poll(() => queueOrder(page)).toEqual(['INC-school', 'INC-residence', 'INC-shelter']);
  const feed = page.locator('#section-incoming');
  await expect(feed.getByText('Earlier school gym report: all people our team checked were outside.')).toBeVisible();
  await expect(feed.getByText('School main building search is not complete. We cannot give an all-clear.')).toBeVisible();
  await expect(feed.locator('li')).toHaveCount(12);
});

test('reset starts a fresh replay run', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Send next report (#7)' }).click();
  await page.getByRole('button', { name: 'Reset run' }).click();
  await expect(page.getByText('6 / 12 delivered')).toBeVisible();
  await expect(review(page).getByText('Nothing needs review.')).toBeVisible();
});
