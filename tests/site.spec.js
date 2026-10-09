import { test, expect } from '@playwright/test';

const noteEndpoint = 'https://formsubmit.co/ajax/**';

async function unlockNotes(page) {
  await page.addInitScript(() => localStorage.setItem('beckwardsStickyNoteUnlocked', 'true'));
  await page.goto('/sticky-note/');
}

async function arcade(page) {
  await page.goto('/arcade/');
  await expect.poll(() => page.evaluate(() => window.GAME?.mode())).toBe('READY');
  await expect(page.locator('#stage')).not.toContainText('Loading');
}

test.beforeEach(async ({ page }) => {
  // No tests send messages, play external videos, or emit analytics.
  await page.route('https://**/*', route => route.abort());
});

test('all current pages load their local assets without runtime errors', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('response', response => {
    if (response.url().startsWith('http://127.0.0.1:8765') && response.status() >= 400) {
      errors.push(`${response.status()} ${response.url()}`);
    }
  });
  await page.addInitScript(() => {
    if (window !== window.top) return;
    localStorage.setItem('beckwardsStickyNoteUnlocked', 'true');
    sessionStorage.setItem('beckwardsInfiniteJestUnlocked', 'true');
  });
  for (const route of ['/', '/arcade/', '/contact/', '/digital/', '/findmyrobot/', '/live/', '/music/', '/socials/', '/store/', '/lyrics/', '/sticky-note/', '/infinite-jest/']) {
    await page.goto(route);
    await page.locator('body').waitFor();
    await expect.poll(() => page.evaluate(() => Array.from(document.images).filter(img => img.getAttribute('src') && img.loading !== 'lazy' && !img.hidden && (!img.complete || !img.naturalWidth)).map(img => img.getAttribute('src')))).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), route).toBe(true);
  }
  expect(errors).toEqual([]);
});

test('home coins can be dragged into the slot and open the arcade', async ({ page }) => {
  await page.goto('/');
  for (const coin of await page.locator('.home-coin').all()) {
    const from = await coin.boundingBox();
    const to = await page.locator('.home-slot__hotspot').boundingBox();
    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
    await page.mouse.down();
    await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 8 });
    await page.mouse.up();
    await expect(coin).toHaveAttribute('data-deposited', 'true');
  }
  await expect(page).toHaveURL(/\/arcade\/?$/);
});

test('four distinct secret codes unlock notes and stay unlocked on reload', async ({ page }) => {
  await page.goto('/secret-card/');
  const inputs = page.locator('[data-secret-code-input]');
  await inputs.nth(0).fill('B301');
  await expect(inputs.nth(0)).toBeDisabled();
  await expect(page.locator('[data-secret-card-status]')).toHaveText('1 of 4 codes accepted');
  await inputs.nth(1).fill('B301');
  await expect(inputs.nth(1)).toBeEnabled();
  await expect(page.locator('[data-secret-card-status]')).toHaveText('That code has already been used');
  for (let i = 1; i < 4; i++) await inputs.nth(i).fill(`b30${i + 1}`);
  await expect(page).toHaveURL(/\/sticky-note\/?$/);
  await page.reload();
  await expect(page.locator('[data-sticky-note-message]')).toBeVisible();
});

test('contact failure leaves the email visible and does not claim it copied', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: () => Promise.reject(new Error('denied')) } });
    document.execCommand = () => false;
  });
  await page.goto('/contact/');
  const tab = page.locator('[data-contact-tab]').first();
  await tab.click();
  await expect(page.locator('[data-copy-status-text]')).toContainText('beckwardss@gmail.com');
  await expect(tab).toBeVisible();
});

test('contact success removes only the selected tab', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: async text => { window.copiedEmail = text; } } });
  });
  await page.goto('/contact/');
  await page.locator('[data-contact-tab]').first().click();
  await expect.poll(() => page.evaluate(() => window.copiedEmail)).toBe('beckwardss@gmail.com');
  await expect(page.locator('[data-contact-tab].is-removed')).toHaveCount(1);
});

test('note form preserves the draft on an unconfirmed response', async ({ page }) => {
  await page.route(noteEndpoint, route => route.fulfill({ json: {} }));
  await unlockNotes(page);
  await page.locator('[data-sticky-note-message]').fill('How did you make that synth sound?');
  await page.locator('[data-sticky-note-submit]').click();
  await expect(page.locator('[data-sticky-note-status]')).not.toContainText('NOTE SENT');
  await expect(page.locator('[data-sticky-note-form]')).toHaveClass(/has-email-fallback/);
  await expect(page.locator('[data-sticky-note-message]')).toHaveValue('How did you make that synth sound?');
});

test('note form confirms success and sends only once', async ({ page }) => {
  let requests = 0;
  let finishRequest;
  const gate = new Promise(resolve => { finishRequest = resolve; });
  await page.route(noteEndpoint, async route => {
    requests += 1;
    await gate;
    await route.fulfill({ json: { success: 'true' } });
  });
  await unlockNotes(page);
  await page.locator('[data-sticky-note-message]').fill('How do you record the drums?');
  await page.locator('form').evaluate(form => {
    form.dispatchEvent(new Event('submit', { cancelable: true }));
    form.dispatchEvent(new Event('submit', { cancelable: true }));
  });
  await expect.poll(() => requests).toBeGreaterThan(0);
  finishRequest();
  await expect(page.locator('[data-sticky-note-status]')).toHaveText('NOTE SENT. THANK YOU.');
  expect(requests).toBe(1);
  await expect(page.locator('[data-sticky-note-message]')).toHaveValue('');
  await expect(page.locator('[data-sticky-note-submit]')).toBeEnabled();
});

test('arcade ignores early input until assets are ready', async ({ page }) => {
  let finishRequest;
  const gate = new Promise(resolve => { finishRequest = resolve; });
  await page.route('**/assets/data/manifest.json', async route => { await gate; await route.continue(); });
  await page.goto('/arcade/');
  await expect.poll(() => page.evaluate(() => Boolean(window.GAME))).toBe(true);
  await page.evaluate(() => { GAME.moveRight(); GAME.drop(); });
  const earlyMode = await page.evaluate(() => GAME.mode());
  finishRequest();
  expect(earlyMode).toBe('LOADING');
  await expect.poll(() => page.evaluate(() => GAME.mode())).toBe('READY');
});

test('arcade stops movement when the window loses focus', async ({ page }) => {
  await arcade(page);
  await page.keyboard.down('ArrowRight');
  await expect.poll(() => page.evaluate(() => GAME.mode())).toBe('MOVING');
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  expect(await page.evaluate(() => GAME.mode())).toBe('READY');
  await page.keyboard.up('ArrowRight');
});

test('arcade completes a grab, opens a reward, and retries', async ({ page }) => {
  await arcade(page);
  const button = page.locator('[data-arcade-drop]:visible');
  await button.click();
  await expect(page.locator('#reward-modal')).toBeVisible({ timeout: 10000 });
  await expect.poll(() => page.locator('#reward-image').evaluate(img => img.complete && img.naturalWidth > 0)).toBe(true);
  await expect(page.locator('#reward-download')).toHaveAttribute('download', /\.png$/);
  await page.locator('#reward-panel').focus();
  await page.keyboard.press('Shift+Tab');
  await expect(page.getByRole('button', { name: 'Back', exact: true })).toBeFocused();
  await page.getByRole('button', { name: 'Back', exact: true }).click();
  await button.click();
  await expect.poll(() => page.evaluate(() => GAME.mode())).toBe('READY');
});

test('arcade does not steal Enter from its Home link', async ({ page }) => {
  await arcade(page);
  await page.getByRole('link', { name: 'Home', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL('http://127.0.0.1:8765/');
});

test('failed arcade artwork can be retried without reloading the page', async ({ page }) => {
  const image = '**/claw%20open.png*';
  await page.route(image, route => route.fulfill({ status: 503, body: 'temporarily unavailable' }));
  await page.goto('/arcade/');
  await expect.poll(() => page.evaluate(() => GAME.mode())).toBe('ERROR');
  await expect(page.locator('[data-arcade-drop]:visible')).toBeDisabled();
  await page.unroute(image);
  await page.getByRole('button', { name: 'Retry loading' }).click();
  await expect.poll(() => page.evaluate(() => GAME.mode())).toBe('READY');
  await expect(page.locator('[data-arcade-drop]:visible')).toBeEnabled();
});

test('slow audio cannot block arcade controls', async ({ page }) => {
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  await page.route('**/*.wav*', async route => { await gate; await route.abort(); });
  await page.goto('/arcade/');
  await expect.poll(() => page.evaluate(() => GAME.mode())).toBe('READY');
  await expect(page.locator('[data-arcade-drop]:visible')).toBeEnabled();
  release();
});

test('a stalled note request times out and keeps the draft', async ({ page }) => {
  let requested = false;
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  await page.route(noteEndpoint, async route => {
    requested = true;
    await gate;
    await route.abort();
  });
  await unlockNotes(page);
  await page.clock.install();
  await page.locator('[data-sticky-note-message]').fill('Will there be another album?');
  await page.locator('[data-sticky-note-submit]').click();
  await expect.poll(() => requested).toBe(true);
  await page.clock.fastForward(12001);
  await expect(page.locator('[data-sticky-note-form]')).toHaveClass(/has-email-fallback/);
  await expect(page.locator('[data-sticky-note-message]')).toHaveValue('Will there be another album?');
  await expect(page.locator('[data-sticky-note-submit]')).toBeEnabled();
  release();
});

test('arcade pauses an active grab while hidden and resumes it', async ({ page }) => {
  await arcade(page);
  await page.clock.install();
  await page.locator('[data-arcade-drop]:visible').click();
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  const mode = await page.evaluate(() => GAME.mode());
  await page.clock.fastForward(10000);
  expect(await page.evaluate(() => GAME.mode())).toBe(mode);
  await expect(page.locator('#reward-modal')).toBeHidden();
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => false });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await page.clock.runFor(3500);
  await expect(page.locator('#reward-modal')).toBeVisible();
});
