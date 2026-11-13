import { test, expect } from '@playwright/test';

/** @typedef {import('@playwright/test').Page} Page */
/** @param {Page} page */
async function ready(page) {
  await page.goto('/arcade/');
  await expect(page.locator('[data-arcade-drop]:visible')).toBeEnabled({
    timeout: 10000,
  });
  return page.locator('[data-arcade-joystick]:visible');
}

/** @param {Page} page */
async function clawPixels(page) {
  return page.locator('#game-canvas').evaluate((canvas) => {
    if (!(canvas instanceof HTMLCanvasElement))
      throw new Error('Missing game canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Missing game context');
    /** @param {number} top @param {number} height */
    const count = (top, height) => {
      const pixels = ctx.getImageData(
        0,
        Math.floor((canvas.height * top) / 1440),
        canvas.width,
        Math.ceil((canvas.height * height) / 1440),
      ).data;
      let result = 0;
      for (let i = 3; i < pixels.length; i += 4)
        if ((pixels[i] || 0) > 32) result++;
      return result / ((canvas.width / 2560) * (canvas.height / 1440));
    };
    // Require both head and arms. Neither band includes the rod.
    return Math.min(count(377, 48), count(510, 140));
  });
}

test.beforeEach(async ({ page }) => {
  await page.route('https://**/*', (route) => route.abort());
});

test('claw arms remain visible when intermediate canvas copies are unavailable', async ({
  page,
}) => {
  await page.addInitScript(() => {
    const draw = CanvasRenderingContext2D.prototype.drawImage;
    /** @this {CanvasRenderingContext2D} @param {CanvasImageSource} source @param {number[]} coordinates */
    CanvasRenderingContext2D.prototype.drawImage = function (
      source,
      ...coordinates
    ) {
      // Model discarded offscreen backing stores, leaving the displayed canvas usable.
      if (
        this.canvas instanceof HTMLCanvasElement &&
        this.canvas.id !== 'game-canvas'
      )
        return;
      Reflect.apply(draw, this, [source, ...coordinates]);
    };
  });
  await ready(page);
  expect(
    await clawPixels(page),
    'The claw must include arms, not only its rod',
  ).toBeGreaterThan(100);
});

test('an idle claw redraws after its displayed canvas is restored', async ({
  page,
}) => {
  await ready(page);
  await page.locator('#game-canvas').evaluate((canvas) => {
    if (!(canvas instanceof HTMLCanvasElement))
      throw new Error('Missing game canvas');
    canvas.getContext('2d')?.clearRect(0, 0, canvas.width, canvas.height);
    canvas.dispatchEvent(new Event('contextrestored'));
  });
  expect(await clawPixels(page)).toBeGreaterThan(100);
});

test('an idle claw returns after backgrounding discards its displayed pixels', async ({
  page,
}) => {
  await ready(page);
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', {
      configurable: true,
      get: () => true,
    });
    document.dispatchEvent(new Event('visibilitychange'));
    const canvas = document.querySelector('#game-canvas');
    if (!(canvas instanceof HTMLCanvasElement))
      throw new Error('Missing game canvas');
    canvas.getContext('2d')?.clearRect(0, 0, canvas.width, canvas.height);
    Object.defineProperty(document, 'hidden', {
      configurable: true,
      get: () => false,
    });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  expect(await clawPixels(page)).toBeGreaterThan(100);
});

test('repeated slider sweeps leave exactly the original resting image', async ({
  page,
}, testInfo) => {
  const slider = await ready(page);
  const box = await slider.boundingBox();
  if (!box) throw new Error('Missing slider bounds');
  await slider.focus();
  const reference = await slider.screenshot();
  for (let pass = 0; pass < 8; pass++) {
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + 4, box.y + box.height / 2, { steps: 8 });
    await page.mouse.move(box.x + box.width - 4, box.y + box.height / 2, {
      steps: 8,
    });
    await page.mouse.up();
    await expect(slider).toHaveAttribute('aria-valuenow', '0');
    const resting = await slider.screenshot();
    expect(
      resting.equals(reference),
      `Sweep ${pass + 1} left a painted trail`,
    ).toBe(true);
    expect(await clawPixels(page)).toBeGreaterThan(100);
  }
  await testInfo.attach('slider-after-sweeps.png', {
    body: await slider.screenshot(),
    contentType: 'image/png',
  });
  await page.setViewportSize({ width: 390, height: 600 });
  await expect(page.locator('[data-arcade-joystick]:visible')).toHaveAttribute(
    'aria-valuenow',
    '0',
  );
  expect(await clawPixels(page)).toBeGreaterThan(100);
  await testInfo.attach('arcade-after-resize.png', {
    body: await page.screenshot(),
    contentType: 'image/png',
  });
});
