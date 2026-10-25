import { expect, test } from '@playwright/test';

test('3D map and 2D view share controlled selection with the queue and history', async ({ page }, testInfo) => {
  const external: string[] = [];
  page.on('request', (request) => {
    if (!request.url().startsWith('http://127.0.0.1:5182') && !request.url().startsWith('data:') && !request.url().startsWith('blob:http://127.0.0.1:5182/')) external.push(request.url());
  });
  await page.goto('/');
  const scene = page.getByRole('region', { name: 'Exercise scene', exact: true });
  await expect(scene.locator('canvas')).toBeVisible();
  await scene.getByRole('button', { name: /School information/i }).click();
  await expect(scene.getByRole('button', { name: /School information/i })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#section-history')).toContainText('INC-school');
  await page.screenshot({ path: testInfo.outputPath('sf-waterfront.png') });
  await page.locator('#section-queue').getByRole('button', { name: /1.*INC-residence/i }).click();
  await expect(scene.getByRole('button', { name: /Residence possible life safety/i })).toHaveAttribute('aria-pressed', 'true');
  await scene.getByRole('button', { name: '2D map', exact: true }).press('Enter');
  await expect(scene.getByRole('img', { name: /exercise map.*2d/i })).toBeVisible();
  await expect(scene.getByRole('button', { name: /Residence possible life safety/i })).toHaveAttribute('aria-pressed', 'true');
  await scene.getByRole('button', { name: /Heatmap/i }).press('Space');
  await expect(scene.getByRole('note', { name: 'Heatmap legend' })).toContainText('fixed radius 45');
  await expect(scene.getByRole('note', { name: 'Heatmap legend' })).toContainText('not severity');
  expect(external).toEqual([]);
});

test('missing GLB is visibly labeled and retains procedural incident selection', async ({ page }) => {
  await page.route('**/scene/bay-area.glb', (route) => route.abort());
  await page.goto('/');
  const scene = page.getByRole('region', { name: 'Exercise scene', exact: true });
  await expect(scene.getByRole('status')).toContainText('procedural geometry fallback');
  await scene.getByRole('button', { name: /School information/i }).click();
  await expect(page.locator('#section-history')).toContainText('INC-school');
});

test('WebGL context loss switches to the aligned 2D map without losing selection', async ({ page }) => {
  await page.goto('/');
  const scene = page.getByRole('region', { name: 'Exercise scene', exact: true });
  await expect(scene.locator('canvas')).toBeVisible();
  await scene.getByRole('button', { name: /School information/i }).click();
  await page.evaluate(() => {
    const context = document.querySelector('canvas')?.getContext('webgl2');
    const extension = context?.getExtension('WEBGL_lose_context');
    if (!extension) throw new Error('Test browser cannot induce context loss');
    extension.loseContext();
  });
  await expect(scene.getByText('WebGL unavailable · 2D map')).toBeVisible();
  await expect(scene.getByRole('img', { name: /exercise map.*2d/i })).toBeVisible();
  await expect(scene.getByRole('button', { name: /School information/i })).toHaveAttribute('aria-pressed', 'true');
});

test('WebGL unavailable at startup keeps keyboard selection and original history', async ({ page }) => {
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
  await scene.getByRole('button', { name: /School information/i }).press('Enter');
  await expect(page.locator('#section-history')).toContainText('School gym evacuation complete. Everyone our team checked is outside.');
  await expect(scene.getByRole('button', { name: /School information/i })).toHaveAttribute('aria-pressed', 'true');
});


test('embedded facade and roof JPEGs decode in the real browser', async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.addInitScript(() => {
    const original = window.createImageBitmap.bind(window);
    const state = window as typeof window & { decodedSceneImages: number };
    state.decodedSceneImages = 0;
    window.createImageBitmap = (async (...args: Parameters<typeof original>) => {
      const image = await original(...args);
      if (image.width === 1024 && image.height === 1024) state.decodedSceneImages++;
      return image;
    }) as typeof original;
  });
  await page.goto('/');
  await expect.poll(() => page.evaluate(() => (window as typeof window & { decodedSceneImages: number }).decodedSceneImages)).toBe(3);
  await expect(page.getByRole('region', { name: 'Exercise scene', exact: true }).getByRole('status')).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath('textured-sf.png') });
  expect(errors).toEqual([]);
});
