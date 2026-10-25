import { expect, test } from '@playwright/test';

test('3D Outer Sunset and 2D view share selection with the queue and history, offline', async ({ page }, testInfo) => {
  const external: string[] = [];
  page.on('request', (request) => {
    if (!/^(http:\/\/127\.0\.0\.1:5182|data:|blob:)/.test(request.url())) external.push(request.url());
  });
  await page.goto('/');
  const scene = page.getByRole('region', { name: 'Exercise scene', exact: true });
  await expect(scene.locator('canvas')).toBeVisible();
  await page.locator('#section-queue').getByRole('button', { name: /INC-residence/i }).first().click();
  await expect(scene.getByRole('button', { name: 'Selected', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#section-history')).toContainText('INC-residence');
  await page.screenshot({ path: testInfo.outputPath('outer-sunset.png') });
  await scene.getByRole('button', { name: '2D map', exact: true }).press('Enter');
  await expect(scene.getByRole('img', { name: /exercise map.*2d/i })).toBeVisible();
  await expect(page.locator('#section-history')).toContainText('INC-residence');
  await scene.getByRole('button', { name: /Heatmap/i }).press('Space');
  await expect(scene.getByRole('note', { name: 'Heatmap legend' })).toContainText('fixed radius 60');
  await expect(scene.getByRole('note', { name: 'Heatmap legend' })).toContainText('not severity');
  expect(external).toEqual([]);
});

test('WebGL context loss switches to the 2D map', async ({ page }) => {
  await page.goto('/');
  const scene = page.getByRole('region', { name: 'Exercise scene', exact: true });
  await expect(scene.locator('canvas')).toBeVisible();
  await page.evaluate(() => {
    const extension = document.querySelector('canvas')?.getContext('webgl2')?.getExtension('WEBGL_lose_context');
    if (!extension) throw new Error('Test browser cannot induce context loss');
    extension.loseContext();
  });
  await expect(scene.getByText('WebGL unavailable · 2D map')).toBeVisible();
  await expect(scene.getByRole('img', { name: /exercise map.*2d/i })).toBeVisible();
});

test('WebGL unavailable at startup shows the 2D map', async ({ page }) => {
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, ...args: Parameters<typeof original>) {
      if (String(args[0]).startsWith('webgl')) return null;
      return original.apply(this, args);
    } as typeof original;
  });
  await page.goto('/');
  const scene = page.getByRole('region', { name: 'Exercise scene', exact: true });
  await expect(scene.getByText('WebGL unavailable · 2D map')).toBeVisible();
  await expect(scene.getByRole('img', { name: /exercise map.*2d/i })).toBeVisible();
});
