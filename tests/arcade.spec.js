import { test, expect } from '@playwright/test';

/** @typedef {import('@playwright/test').Page} Page */
/** @param {Page} page */
async function readyArcade(page) {
  await page.goto('/arcade/');
  await expect
    .poll(() => page.evaluate(() => window.GAME?.mode()))
    .toBe('READY');
  return page.locator('[data-arcade-joystick]:visible');
}

/** @param {Page} page */
async function clawPosition(page) {
  return page.locator('#game-canvas').evaluate((canvas) => {
    if (!(canvas instanceof HTMLCanvasElement))
      throw new Error('Missing canvas');
    const pixels = canvas
      .getContext('2d')
      ?.getImageData(
        0,
        Math.round((canvas.height * 450) / 1440),
        canvas.width,
        1,
      ).data;
    if (!pixels) throw new Error('Missing renderer');
    let sum = 0,
      count = 0;
    for (let x = 0; x < canvas.width; x++) {
      if ((pixels[x * 4 + 3] || 0) > 100) {
        sum += x;
        count++;
      }
    }
    if (!count) throw new Error('Claw rod was not drawn');
    return sum / count;
  });
}

test.beforeEach(async ({ page }) => {
  await page.route('https://**/*', (route) => route.abort());
});

test('victory audio starts loading even while all other sounds are stalled', async ({
  page,
}) => {
  test.skip(
    !(await page.evaluate(() => typeof AudioContext !== 'undefined')),
    'This browser build has no Web Audio API; media fallback is covered separately',
  );
  await page.clock.install({ time: new Date('2026-11-12T12:00:00Z') });
  await page.clock.pauseAt(new Date('2026-11-12T12:01:00Z'));
  let release = () => {};
  const held = new Promise((resolve) => {
    release = () => resolve(undefined);
  });
  let victoryRequested = false;
  page.on('request', (request) => {
    if (request.url().includes('prize%20victory.mp3')) victoryRequested = true;
  });
  await page.route(/\.wav(\?|$)/, async (route) => {
    await held;
    await route.abort();
  });
  try {
    await page.goto('/arcade/', { waitUntil: 'domcontentloaded' });
    // No audio-loading deadline has advanced; unrelated sounds cannot gate win.
    await expect.poll(() => victoryRequested).toBe(true);
    // Artwork readiness must not depend on a frozen browser clock (WebKit can
    // defer image completion). The independent request was already observed.
    await page.clock.resume();
    await expect
      .poll(() => page.evaluate(() => window.GAME?.mode()))
      .toBe('READY');
  } finally {
    release();
  }
});

test('optional stalled sound keeps the legacy arcade loading deadline bounded', async ({
  page,
}) => {
  let release = () => {};
  const held = new Promise((resolve) => {
    release = () => resolve(undefined);
  });
  await page.route(/\.(wav|mp3)(\?|$)/, async (route) => {
    await held;
    await route.abort();
  });
  try {
    await page.goto('/arcade-legacy.html', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#stage')).not.toContainText('Loading', {
      timeout: 10000,
    });
    await expect(page.locator('#stage')).not.toContainText('Error');
    await expect(page.locator('#stage canvas')).toBeVisible();
  } finally {
    release();
  }
});

test('bringing mobile controls into focus keeps the cabinet stationary', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 664 });
  const slider = await readyArcade(page);
  const before = await slider.boundingBox();
  await slider.focus();
  await slider.evaluate((gate) =>
    gate.scrollIntoView({ block: 'center', inline: 'center' }),
  );
  await page.keyboard.press('ArrowRight');
  expect(
    await page.evaluate(() => ({
      page: scrollY,
      scene: document.querySelector('.arcade-scene')?.scrollTop,
    })),
  ).toEqual({ page: 0, scene: 0 });
  expect(await slider.boundingBox()).toEqual(before);
});

test('a small slider movement engages, reverses, and releases the claw', async ({
  page,
}) => {
  await page.clock.install({ time: new Date('2026-11-12T12:00:00Z') });
  const slider = await readyArcade(page);
  // install() alone still advances in real time between browser round trips.
  await page.clock.pauseAt(new Date('2026-11-12T12:01:00Z'));
  const initial = await clawPosition(page);
  await slider.dispatchEvent('pointerdown', {
    pointerId: 1,
    clientX: 0,
    button: 0,
    isPrimary: true,
  });
  await slider.evaluate((gate) => {
    const rect = gate.getBoundingClientRect();
    const mobile = gate.classList.contains('arcade-mobile-gate');
    const center = rect.left + rect.width * (mobile ? 0.5 : 0.58);
    const travel = Math.max(24, rect.width * (mobile ? 0.32 : 0.22));
    gate.dispatchEvent(
      new PointerEvent('pointermove', {
        bubbles: true,
        pointerId: 1,
        clientX: center + travel * 0.15,
      }),
    );
  });
  expect(await page.evaluate(() => window.GAME?.mode())).toBe('MOVING');
  await page.clock.runFor(34);
  const right = await clawPosition(page);
  expect(right).toBeGreaterThan(initial);
  await expect(slider).toHaveAttribute('aria-valuetext', 'Moving right');
  await slider.evaluate((gate) => {
    const rect = gate.getBoundingClientRect();
    const mobile = gate.classList.contains('arcade-mobile-gate');
    const center = rect.left + rect.width * (mobile ? 0.5 : 0.58);
    const travel = Math.max(18, rect.width * (mobile ? 0.32 : 0.14));
    gate.dispatchEvent(
      new PointerEvent('pointermove', {
        bubbles: true,
        pointerId: 1,
        clientX: center - travel * 0.15,
      }),
    );
  });
  await page.clock.runFor(34);
  await expect(slider).toHaveAttribute('aria-valuetext', 'Moving left');
  expect(await clawPosition(page)).toBeLessThan(right);
  await slider.dispatchEvent('pointerup', { pointerId: 1 });
  expect(await page.evaluate(() => window.GAME?.mode())).toBe('READY');
  await expect(slider).toHaveAttribute('aria-valuenow', '0');
});

test('global A/D keys retain the remaining held direction and clear on blur', async ({
  page,
}) => {
  await readyArcade(page);
  await page.keyboard.down('a');
  await page.keyboard.down('d');
  await page.keyboard.up('d');
  expect(await page.evaluate(() => window.GAME?.mode())).toBe('MOVING');
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  await page.keyboard.up('a');
  expect(await page.evaluate(() => window.GAME?.mode())).toBe('READY');
});

test('drag bursts use one layout measurement and cancellation permits an immediate regrab', async ({
  page,
}, testInfo) => {
  const slider = await readyArcade(page);
  const metrics = await slider.evaluate((gate) => {
    const rect = gate.getBoundingClientRect();
    const original = gate.getBoundingClientRect.bind(gate);
    let layoutReads = 0;
    gate.getBoundingClientRect = () => {
      layoutReads++;
      return original();
    };
    const center =
      rect.left +
      rect.width * (gate.classList.contains('arcade-mobile-gate') ? 0.5 : 0.58);
    const at = performance.now();
    gate.dispatchEvent(
      new PointerEvent('pointerdown', {
        bubbles: true,
        pointerId: 7,
        clientX: center,
        isPrimary: true,
        button: 0,
      }),
    );
    for (let i = 0; i < 60; i++)
      gate.dispatchEvent(
        new PointerEvent('pointermove', {
          bubbles: true,
          pointerId: 7,
          clientX: center + (i % 2 ? 30 : -30),
          cancelable: true,
        }),
      );
    const mode = window.GAME?.mode();
    gate.dispatchEvent(
      new PointerEvent('pointercancel', { bubbles: true, pointerId: 7 }),
    );
    gate.getBoundingClientRect = original;
    return { layoutReads, mode, burstMs: performance.now() - at };
  });
  expect(metrics.layoutReads).toBe(1);
  expect(metrics.mode).toBe('MOVING');
  expect(await page.evaluate(() => window.GAME?.mode())).toBe('READY');
  await expect(slider).toHaveAttribute('aria-valuenow', '0');
  await slider.press('ArrowRight');
  expect(await page.evaluate(() => window.GAME?.mode())).toBe('READY');
  await testInfo.attach('joystick-burst.json', {
    body: JSON.stringify(metrics),
    contentType: 'application/json',
  });
});

test('native mobile touch can reverse, cancel, and grab again without scrolling', async ({
  page,
  context,
  browserName,
  isMobile,
}) => {
  test.skip(
    browserName !== 'chromium' || !isMobile,
    'Chromium mobile touch protocol',
  );
  const slider = await readyArcade(page);
  const box = await slider.boundingBox();
  if (!box) throw new Error('Slider is not visible');
  const touch = await context.newCDPSession(page);
  const x = box.x + box.width / 2,
    y = box.y + box.height / 2;
  const point = (/** @type {number} */ x) => [{ x, y, id: 1 }];
  for (let i = 0; i < 3; i++) {
    await touch.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: point(x),
    });
    await touch.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: point(x + 14),
    });
    expect(await page.evaluate(() => window.GAME?.mode())).toBe('MOVING');
    await expect(slider).toHaveAttribute('aria-valuetext', 'Moving right');
    await touch.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: point(x - 14),
    });
    await expect(slider).toHaveAttribute('aria-valuetext', 'Moving left');
    await touch.send('Input.dispatchTouchEvent', {
      type: i % 2 ? 'touchEnd' : 'touchCancel',
      touchPoints: [],
    });
    expect(await page.evaluate(() => window.GAME?.mode())).toBe('READY');
    await expect(slider).toHaveAttribute('aria-valuenow', '0');
  }
  expect(await page.evaluate(() => [scrollX, scrollY])).toEqual([0, 0]);
  await touch.detach();
});

test('motor and prize music are decoded before play and use running buffer sources', async ({
  page,
}, testInfo) => {
  await page.addInitScript(() => {
    if (typeof AudioContext === 'undefined') return;
    window.arcadeAudioProbe = {
      decoded: [],
      starts: [],
      stops: 0,
      lastInputAt: 0,
    };
    for (const type of ['pointerdown', 'pointermove'])
      window.addEventListener(
        type,
        () => {
          if (window.arcadeAudioProbe)
            window.arcadeAudioProbe.lastInputAt = performance.now();
        },
        { capture: true },
      );
    const decode = AudioContext.prototype.decodeAudioData;
    AudioContext.prototype.decodeAudioData = function (
      /** @type {ArrayBuffer} */ data,
    ) {
      return decode.call(this, data).then((buffer) => {
        window.arcadeAudioProbe?.decoded.push(buffer.duration);
        return buffer;
      });
    };
    const start = AudioBufferSourceNode.prototype.start;
    AudioBufferSourceNode.prototype.start = function () {
      window.arcadeAudioProbe?.starts.push({
        duration: this.buffer?.duration || 0,
        loop: this.loop,
        state: this.context.state,
        mode: window.GAME?.mode() || '',
        at: performance.now(),
        inputDelay:
          performance.now() - (window.arcadeAudioProbe?.lastInputAt || 0),
      });
      start.call(this);
    };
    const stop = AudioBufferSourceNode.prototype.stop;
    AudioBufferSourceNode.prototype.stop = function () {
      if (this.loop && window.arcadeAudioProbe) window.arcadeAudioProbe.stops++;
      stop.call(this);
    };
  });
  const slider = await readyArcade(page);
  test.skip(
    !(await page.evaluate(() => Boolean(window.arcadeAudioProbe))),
    'This browser build has no Web Audio API; media fallback is covered separately',
  );
  await expect
    .poll(() =>
      page.evaluate(() =>
        window.arcadeAudioProbe?.decoded.some(
          (duration) => duration > 9 && duration < 10,
        ),
      ),
    )
    .toBe(true);
  const box = await slider.boundingBox();
  if (!box) throw new Error('Slider is not visible');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.8, box.y + box.height / 2);
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          window.arcadeAudioProbe?.starts.filter((source) => source.loop)
            .length,
      ),
    )
    .toBe(1);
  await page.mouse.up();
  expect(await page.evaluate(() => window.arcadeAudioProbe?.stops)).toBe(1);
  await page.locator('[data-arcade-drop]:visible').click();
  const loopsBeforeHide = await page.evaluate(
    () =>
      window.arcadeAudioProbe?.starts.filter((source) => source.loop).length,
  );
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', {
      configurable: true,
      get: () => true,
    });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  // Exercise a blur arriving after suspend: it must not restart the motor.
  await slider.dispatchEvent('blur');
  expect(
    await page.evaluate(
      () =>
        window.arcadeAudioProbe?.starts.filter((source) => source.loop).length,
    ),
  ).toBe(loopsBeforeHide);
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', {
      configurable: true,
      get: () => false,
    });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect(page.locator('#reward-modal')).toBeVisible({ timeout: 10000 });
  const probe = await page.evaluate(() => window.arcadeAudioProbe);
  expect(probe?.starts.every((source) => source.state === 'running')).toBe(
    true,
  );
  expect(probe?.starts.find((source) => source.duration > 9)?.mode).toBe(
    'OPENING',
  );
  await testInfo.attach('audio-scheduling.json', {
    body: JSON.stringify(probe),
    contentType: 'application/json',
  });
});

test('a drag still works outside the slider when pointer capture is unavailable', async ({
  page,
}) => {
  await page.addInitScript(() => {
    Element.prototype.setPointerCapture = () => {
      throw new DOMException('Capture unavailable', 'NotFoundError');
    };
  });
  const slider = await readyArcade(page);
  const box = await slider.boundingBox();
  if (!box) throw new Error('Slider is not visible');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width + 50, box.y - 20);
  expect(await page.evaluate(() => window.GAME?.mode())).toBe('MOVING');
  await page.mouse.up();
  expect(await page.evaluate(() => window.GAME?.mode())).toBe('READY');
  await expect(slider).toHaveAttribute('aria-valuenow', '0');
});

test('releasing one arrow keeps the other held direction active', async ({
  page,
}) => {
  const slider = await readyArcade(page);
  await slider.focus();
  await page.keyboard.down('ArrowLeft');
  await page.keyboard.down('ArrowRight');
  await page.keyboard.up('ArrowRight');
  expect(await page.evaluate(() => window.GAME?.mode())).toBe('MOVING');
  await expect(slider).toHaveAttribute('aria-valuetext', 'Moving left');
  await page.keyboard.up('ArrowLeft');
  expect(await page.evaluate(() => window.GAME?.mode())).toBe('READY');
});
