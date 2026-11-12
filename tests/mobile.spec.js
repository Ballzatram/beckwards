import { test, expect } from '@playwright/test';

/** @typedef {import('@playwright/test').Page} Page */
/** @typedef {import('@playwright/test').Locator} Locator */

/** @param {Locator} locator */
async function visibleBox(locator) {
  const box = await locator.boundingBox();
  if (!box) throw new Error(`Expected a visible target: ${locator}`);
  return box;
}

/** @param {Page} page @param {number} number */
function quarter(page, number) {
  return page.getByRole('button', { name: `Quarter ${number}`, exact: true });
}

/** @param {Page} page */
async function expectNoScroll(page) {
  expect(await page.evaluate(() => [scrollX, scrollY])).toEqual([0, 0]);
}

/** @param {Page} page @param {string} selector @param {string} context */
async function expectNoOverlap(page, selector, context) {
  const overlaps = await page.locator(selector).evaluateAll((elements) => {
    const boxes = elements.map((element) => ({
      name: element.getAttribute('aria-label') || element.className,
      rect: element.getBoundingClientRect(),
    }));
    return boxes.flatMap((a, index) =>
      boxes
        .slice(index + 1)
        .filter(
          (b) =>
            a.rect.left < b.rect.right &&
            a.rect.right > b.rect.left &&
            a.rect.top < b.rect.bottom &&
            a.rect.bottom > b.rect.top,
        )
        .map((b) => `${a.name} overlaps ${b.name}`),
    );
  });
  expect(overlaps, context).toEqual([]);
}

/** @param {Page} page @param {{ width: number, height: number }} size */
async function expectControlsInViewport(page, size) {
  const controls = await page
    .locator(
      '.home-coin, .home-label, .home-title, .home-slot, .home-secret-card-trigger',
    )
    .evaluateAll((elements) =>
      elements.map((element) => {
        const rect = element.getBoundingClientRect();
        return {
          name: element.getAttribute('aria-label') || element.className,
          left: rect.left,
          right: rect.right,
          top: rect.top,
          bottom: rect.bottom,
          width: rect.width,
        };
      }),
    );
  expect(controls, `${JSON.stringify(size)} homepage controls`).toHaveLength(
    13,
  );
  for (const control of controls) {
    const context = `${JSON.stringify(size)} ${control.name}`;
    expect(control.left, context).toBeGreaterThanOrEqual(0);
    expect(control.right, context).toBeLessThanOrEqual(size.width);
    expect(control.top, context).toBeGreaterThanOrEqual(0);
    expect(control.bottom, context).toBeLessThanOrEqual(size.height);
    expect(control.width, context).toBeGreaterThanOrEqual(44);
  }
}

test.beforeEach(async ({ page }) => {
  await page.route('https://**/*', (route) => route.abort());
});

test('quarters follow a real touch drag without scrolling on a short phone', async ({
  page,
  context,
  browserName,
  isMobile,
}) => {
  test.skip(
    browserName !== 'chromium' || !isMobile,
    'Chromium touch-input protocol',
  );
  await page.setViewportSize({ width: 390, height: 600 });
  await page.goto('/');
  const touch = await context.newCDPSession(page);
  for (const number of [4, 3, 2, 1]) {
    const coin = quarter(page, number);
    const from = await visibleBox(coin);
    const to = await visibleBox(page.locator('.home-slot__hotspot'));
    const start = { x: from.x + from.width / 2, y: from.y + from.height / 2 };
    const end = { x: to.x + to.width / 2, y: to.y + to.height / 2 };
    await touch.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [start],
    });
    const held = await visibleBox(coin);
    for (let step = 1; step <= 10; step++) {
      await touch.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: [
          {
            x: start.x + ((end.x - start.x) * step) / 10,
            y: start.y + ((end.y - start.y) * step) / 10,
          },
        ],
      });
    }
    await expect
      .poll(async () => {
        const moved = await visibleBox(coin);
        return Math.hypot(
          moved.x +
            moved.width / 2 -
            (held.x + held.width / 2 + end.x - start.x),
          moved.y +
            moved.height / 2 -
            (held.y + held.height / 2 + end.y - start.y),
        );
      })
      .toBeLessThan(2);
    await touch.send('Input.dispatchTouchEvent', {
      type: 'touchEnd',
      touchPoints: [],
    });
    if (number !== 1) {
      await expect(page.getByRole('status')).toHaveText(`${5 - number}/4`);
      await expect(coin).toBeHidden();
      await expectNoScroll(page);
    }
  }
  await expect(page).toHaveURL(/\/arcade\/?$/);
});

test('the homepage fits the visible screen even when browser chrome resizes it', async ({
  page,
}) => {
  await page.goto('/');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  for (const size of [
    { width: 390, height: 844 },
    { width: 390, height: 664 },
    { width: 390, height: 500 },
    { width: 320, height: 480 },
    { width: 320, height: 568 },
    { width: 360, height: 640 },
    { width: 430, height: 740 },
    { width: 768, height: 1024 },
    { width: 568, height: 320 },
    { width: 844, height: 390 },
  ]) {
    await page.setViewportSize(size);
    const dimensions = await page.evaluate(() => {
      const root = document.scrollingElement;
      const scene = document.querySelector('.home-scene');
      if (!root || !scene)
        throw new Error('Homepage document and scene must exist');
      return {
        width: root.scrollWidth,
        height: root.scrollHeight,
        sceneHeight: scene.getBoundingClientRect().height,
      };
    });
    expect(dimensions.width, JSON.stringify(size)).toBeLessThanOrEqual(
      size.width,
    );
    expect(dimensions.height, JSON.stringify(size)).toBeLessThanOrEqual(
      size.height,
    );
    // WebKit can round viewport units by a fraction of a CSS pixel.
    expect(
      Math.abs(dimensions.sceneHeight - size.height),
      JSON.stringify(size),
    ).toBeLessThan(1);
    await expectControlsInViewport(page, size);
    await expectNoOverlap(
      page,
      '.home-label, .home-title, .home-insert, .home-slot, .home-coin-status',
      JSON.stringify(size),
    );
  }
});

test('a background finger swipe cannot scroll the homepage or disrupt a later coin drag', async ({
  page,
  context,
  browserName,
  isMobile,
}) => {
  test.skip(
    browserName !== 'chromium' || !isMobile,
    'Chromium touch-input protocol',
  );
  await page.setViewportSize({ width: 390, height: 600 });
  await page.goto('/');
  const touch = await context.newCDPSession(page);
  await touch.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{ x: 5, y: 420 }],
  });
  for (let y = 400; y >= 200; y -= 20) {
    await touch.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ x: 5, y }],
    });
  }
  await touch.send('Input.dispatchTouchEvent', {
    type: 'touchEnd',
    touchPoints: [],
  });
  await expectNoScroll(page);
  expect(
    await page
      .locator('.home-scene')
      .evaluate((scene) => scene.getBoundingClientRect().top),
  ).toBe(0);
  const coin = quarter(page, 4);
  const from = await visibleBox(coin);
  const target = await visibleBox(page.locator('.home-slot__hotspot'));
  await touch.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{ x: from.x + from.width / 2, y: from.y + from.height / 2 }],
  });
  await touch.send('Input.dispatchTouchEvent', {
    type: 'touchMove',
    touchPoints: [
      { x: target.x + target.width / 2, y: target.y + target.height / 2 },
    ],
  });
  await touch.send('Input.dispatchTouchEvent', {
    type: 'touchEnd',
    touchPoints: [],
  });
  await expect(page.getByRole('status')).toHaveText('1/4');
  await expect(coin).toBeHidden();
  await expectNoScroll(page);
});

test('tapping or clicking each quarter once opens the arcade', async ({
  page,
  isMobile,
}) => {
  // This test covers activation/navigation in the supported reduced-motion
  // mode; the drag tests above and in site.spec.js retain animated input.
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  for (let number = 1; number <= 4; number++) {
    const coin = quarter(page, number);
    // Locator input waits for scrolling, a stable target and hit testing. Raw
    // coordinates can land on another control while WebKit scrolls the page.
    if (isMobile) await coin.tap();
    else await coin.click();
    if (number < 4) {
      await expect(coin).toBeHidden();
      await expect(page.getByRole('status')).toHaveText(`${number}/4`);
    }
    // The fourth deposit navigates away; the arcade URL below is its success
    // contract, rather than a transient element in the previous DOM.
  }
  await expect(page).toHaveURL(/\/arcade\/?$/);
});

test('a quick release uses the final finger position even without a move event', async ({
  page,
}) => {
  await page.goto('/');
  const coin = quarter(page, 1);
  const from = await visibleBox(coin);
  const to = await visibleBox(page.locator('.home-slot__hotspot'));
  await coin.dispatchEvent('pointerdown', {
    pointerId: 7,
    pointerType: 'touch',
    isPrimary: true,
    button: 0,
    clientX: from.x + from.width / 2,
    clientY: from.y + from.height / 2,
  });
  await coin.dispatchEvent('pointerup', {
    pointerId: 7,
    pointerType: 'touch',
    isPrimary: true,
    button: 0,
    clientX: to.x + to.width / 2,
    clientY: to.y + to.height / 2,
  });
  await expect(coin).toBeHidden();
  await expect(page.getByRole('status')).toHaveText('1/4');
});

test('cancelled touch gestures restore the coin and allow another attempt', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  const coin = quarter(page, 1);
  const rect = await visibleBox(coin);
  const pointer = {
    pointerId: 9,
    pointerType: 'touch',
    isPrimary: true,
    button: 0,
    clientX: rect.x + rect.width / 2,
    clientY: rect.y + rect.height / 2,
  };
  await coin.dispatchEvent('pointerdown', pointer);
  await coin.dispatchEvent('pointermove', {
    ...pointer,
    clientX: pointer.clientX + 40,
  });
  await expect
    .poll(async () => (await visibleBox(coin)).x)
    .toBeCloseTo(rect.x + 40, 0);
  await coin.dispatchEvent('pointercancel', { ...pointer, pointerId: 10 });
  expect((await visibleBox(coin)).x).toBeCloseTo(rect.x + 40, 0);
  await coin.dispatchEvent('pointercancel', pointer);
  await expect
    .poll(async () => (await visibleBox(coin)).x)
    .toBeCloseTo(rect.x, 0);
  // A cancelled pointer must no longer move the coin or count a deposit.
  await coin.dispatchEvent('pointermove', {
    ...pointer,
    clientX: pointer.clientX + 80,
  });
  expect((await visibleBox(coin)).x).toBeCloseTo(rect.x, 0);
  await expect(page.getByRole('status')).toHaveText('0/4');
  await expectNoScroll(page);
  await coin.focus();
  await page.keyboard.press('Space');
  await expect(page.getByRole('status')).toHaveText('1/4');
});

test('small portrait and landscape layouts keep quarters and navigation reachable', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  for (const size of [
    { width: 320, height: 568 },
    { width: 390, height: 600 },
    { width: 768, height: 360 },
    { width: 844, height: 390 },
  ]) {
    await page.setViewportSize(size);
    await page.goto('/');
    await expectControlsInViewport(page, size);
    await expectNoOverlap(
      page,
      '.home-label, .home-title, .home-slot',
      `${size.width}×${size.height}`,
    );
  }
});
