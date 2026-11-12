import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.route('https://**/*', route => route.abort());
});

test('quarters follow a real touch drag, including after scrolling on a short phone', async ({ page, context, browserName, isMobile }) => {
  test.skip(browserName !== 'chromium' || !isMobile, 'Chromium touch-input protocol');
  await page.setViewportSize({ width: 390, height: 600 });
  await page.goto('/');
  const touch = await context.newCDPSession(page);
  for (const number of [4, 3, 2, 1]) {
    const coin = page.locator(`.home-coin--${number}`);
    await coin.evaluate(element => element.scrollIntoView({ block: 'nearest' }));
    const from = await coin.boundingBox();
    const to = await page.locator('.home-slot__hotspot').boundingBox();
    const start = { x: from.x + from.width / 2, y: from.y + from.height / 2 };
    const end = { x: to.x + to.width / 2, y: to.y + to.height / 2 };
    await touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [start] });
    await expect(coin).toHaveClass(/is-dragging/);
    const held = await coin.boundingBox();
    for (let step = 1; step <= 10; step++) {
      await touch.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: [{ x: start.x + (end.x - start.x) * step / 10, y: start.y + (end.y - start.y) * step / 10 }]
      });
    }
    await expect.poll(async () => {
      const moved = await coin.boundingBox();
      return Math.hypot(moved.x + moved.width / 2 - (held.x + held.width / 2 + end.x - start.x),
        moved.y + moved.height / 2 - (held.y + held.height / 2 + end.y - start.y));
    }).toBeLessThan(2);
    await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    if (number !== 1) await expect(coin).toHaveAttribute('data-deposited', 'true');
  }
  await expect(page).toHaveURL(/\/arcade\/?$/);
});

test('tapping or clicking each quarter once opens the arcade', async ({ page, isMobile }) => {
  // This test covers activation/navigation in the supported reduced-motion
  // mode; the drag tests above and in site.spec.js retain animated input.
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  for (let number = 1; number <= 4; number++) {
    const coin = page.locator(`.home-coin--${number}`);
    // Locator input waits for scrolling, a stable target and hit testing. Raw
    // coordinates can land on another control while WebKit scrolls the page.
    if (isMobile) await coin.tap();
    else await coin.click();
    if (number < 4) {
      await expect(coin).toHaveAttribute('data-deposited', 'true');
      await expect(page.locator('#coin-status')).toHaveText(`${number}/4`);
    }
    // The fourth deposit navigates away; the arcade URL below is its success
    // contract, rather than a transient element in the previous DOM.
  }
  await expect(page).toHaveURL(/\/arcade\/?$/);
});

test('a quick release uses the final finger position even without a move event', async ({ page }) => {
  await page.goto('/');
  const coin = page.locator('.home-coin--1');
  const from = await coin.boundingBox();
  const to = await page.locator('.home-slot__hotspot').boundingBox();
  await coin.dispatchEvent('pointerdown', {
    pointerId: 7, pointerType: 'touch', isPrimary: true, button: 0,
    clientX: from.x + from.width / 2, clientY: from.y + from.height / 2
  });
  await coin.dispatchEvent('pointerup', {
    pointerId: 7, pointerType: 'touch', isPrimary: true, button: 0,
    clientX: to.x + to.width / 2, clientY: to.y + to.height / 2
  });
  await expect(coin).toHaveAttribute('data-deposited', 'true');
  await expect(page.locator('#coin-status')).toHaveText('1/4');
});

test('cancelled touch gestures restore the coin and allow another attempt', async ({ page }) => {
  await page.goto('/');
  const coin = page.locator('.home-coin--1');
  const rect = await coin.boundingBox();
  const pointer = { pointerId: 9, pointerType: 'touch', isPrimary: true, button: 0,
    clientX: rect.x + rect.width / 2, clientY: rect.y + rect.height / 2 };
  await coin.dispatchEvent('pointerdown', pointer);
  await coin.dispatchEvent('pointermove', { ...pointer, clientX: pointer.clientX + 40 });
  await expect(coin).toHaveClass(/is-dragging/);
  await coin.dispatchEvent('pointercancel', { ...pointer, pointerId: 10 });
  await expect(coin).toHaveClass(/is-dragging/);
  await coin.dispatchEvent('pointercancel', pointer);
  await expect(coin).not.toHaveClass(/is-dragging/);
  await expect(page.locator('body')).not.toHaveClass(/is-dragging-coin/);
  await expect(page.locator('#coin-status')).toHaveText('0/4');
  expect(await coin.evaluate(element => [element.style.left, element.style.top])).toEqual(['', '']);
  await coin.focus();
  await page.keyboard.press('Space');
  await expect(page.locator('#coin-status')).toHaveText('1/4');
});

test('small portrait and landscape layouts keep quarters and navigation reachable', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  for (const size of [{ width: 320, height: 568 }, { width: 390, height: 600 }, { width: 768, height: 360 }, { width: 844, height: 390 }]) {
    await page.setViewportSize(size);
    await page.goto('/');
    const controls = await page.locator('.home-coin, .home-label, .home-secret-card-trigger').evaluateAll(elements => elements.map(element => {
      const rect = element.getBoundingClientRect();
      const scene = document.querySelector('.home-scene').getBoundingClientRect();
      return { name: element.getAttribute('aria-label'), left: rect.left, right: rect.right, top: rect.top,
        bottom: rect.bottom, sceneBottom: scene.bottom, width: rect.width };
    }));
    for (const control of controls) {
      expect(control.left, `${size.width}px ${control.name}`).toBeGreaterThanOrEqual(0);
      expect(control.right, `${size.width}px ${control.name}`).toBeLessThanOrEqual(size.width);
      expect(control.top, `${size.width}px ${control.name}`).toBeGreaterThanOrEqual(0);
      expect(control.bottom, `${size.width}px ${control.name}`).toBeLessThanOrEqual(control.sceneBottom);
      expect(control.width).toBeGreaterThanOrEqual(44);
    }
    const overlaps = await page.locator('.home-label, .home-title, .home-slot').evaluateAll(elements => {
      const boxes = elements.map(element => ({ name: element.getAttribute('aria-label') || element.className,
        rect: element.getBoundingClientRect() }));
      return boxes.flatMap((a, index) => boxes.slice(index + 1).filter(b =>
        a.rect.left < b.rect.right && a.rect.right > b.rect.left && a.rect.top < b.rect.bottom && a.rect.bottom > b.rect.top
      ).map(b => `${a.name} overlaps ${b.name}`));
    });
    expect(overlaps, `${size.width}×${size.height}`).toEqual([]);
  }
});
