// Input updates the game immediately; knob/ARIA writes are batched per frame.
(() => {
  const gates = document.querySelectorAll('[data-arcade-joystick]');
  const buttons = document.querySelectorAll('[data-arcade-drop]');
  const ENGAGE = 0.12;
  const RELEASE = 0.06;

  /** @param {number} number @param {number} min @param {number} max */
  function clamp(number, min, max) {
    return Math.max(min, Math.min(max, number));
  }

  /** @param {HTMLElement} gate */
  function setupGate(gate) {
    if (!gate.querySelector('[data-arcade-knob]')) return;
    const mobile = gate.classList.contains('arcade-mobile-gate');
    /** @type {number | null} */
    let pointer = null;
    /** @type {{ center: number, left: number, right: number } | null} */
    let geometry = null;
    let ratio = 0;
    let direction = 0;
    let paint = 0;
    /** @type {Set<string>} */
    const keys = new Set();

    function measure() {
      const rect = gate.getBoundingClientRect();
      return {
        center: rect.left + rect.width * (mobile ? 0.5 : 0.58),
        left: Math.max(18, rect.width * (mobile ? 0.32 : 0.14)),
        right: Math.max(24, rect.width * (mobile ? 0.32 : 0.22)),
      };
    }

    function render() {
      paint = 0;
      const travel = geometry
        ? ratio < 0
          ? geometry.left
          : geometry.right
        : 0;
      gate.style.setProperty('--joy-x', `${(ratio * travel).toFixed(2)}px`);
      gate.setAttribute('aria-valuenow', String(Number(ratio.toFixed(2))));
      gate.setAttribute(
        'aria-valuetext',
        direction < 0
          ? 'Moving left'
          : direction > 0
            ? 'Moving right'
            : 'Centered',
      );
    }

    /** @param {number} value */
    function apply(value) {
      ratio = clamp(value, -1, 1);
      const next =
        ratio >= ENGAGE
          ? 1
          : ratio <= -ENGAGE
            ? -1
            : direction === 1 && ratio > RELEASE
              ? 1
              : direction === -1 && ratio < -RELEASE
                ? -1
                : 0;
      const game = window.GAME;
      // A boundary, loading phase or drop can reject movement. Do not latch it.
      if (next !== direction || (next && game?.mode() === 'READY')) {
        if (next < 0) game?.moveLeft();
        else if (next > 0) game?.moveRight();
        else game?.stopMove();
      }
      direction = game?.mode() === 'MOVING' ? next : 0;
      if (!paint) paint = requestAnimationFrame(render);
    }

    function reset() {
      const previous = pointer;
      pointer = null;
      keys.clear();
      ratio = direction = 0;
      if (paint) cancelAnimationFrame(paint);
      render();
      geometry = null;
      window.GAME?.stopMove();
      if (previous !== null && gate.hasPointerCapture(previous))
        gate.releasePointerCapture(previous);
    }

    /** @param {PointerEvent} event */
    function move(event) {
      if (event.pointerId !== pointer || !geometry) return;
      event.preventDefault();
      const offset = event.clientX - geometry.center;
      apply(offset / (offset < 0 ? geometry.left : geometry.right));
    }

    gate.addEventListener(
      'pointerdown',
      (event) => {
        if (pointer !== null || event.isPrimary === false || event.button !== 0)
          return;
        if (!['READY', 'MOVING'].includes(window.GAME?.mode() || '')) return;
        event.preventDefault();
        keys.clear();
        geometry = measure();
        pointer = event.pointerId;
        gate.focus({ preventScroll: true });
        try {
          gate.setPointerCapture(pointer);
        } catch (error) {
          // Window listeners below also cover browsers losing capture mid-gesture.
          if (!(
            error instanceof DOMException && error.name === 'NotFoundError'
          ))
            console.warn('[joystick capture]', error);
        }
        move(event);
      },
      { passive: false },
    );

    window.addEventListener('pointermove', move, { passive: false });
    for (const type of /** @type {const} */ (['pointerup', 'pointercancel'])) {
      window.addEventListener(type, (event) => {
        if (pointer === event.pointerId) reset();
      });
    }
    gate.addEventListener('lostpointercapture', (event) => {
      if (pointer === event.pointerId) reset();
    });

    /** @param {KeyboardEvent} event @param {boolean} down */
    function key(event, down) {
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
      event.preventDefault();
      event.stopPropagation();
      if (pointer !== null || (down && event.repeat)) return;
      if (down) keys.add(event.key);
      else keys.delete(event.key);
      const last = Array.from(keys).at(-1);
      geometry ||= measure();
      apply(last === 'ArrowLeft' ? -1 : last === 'ArrowRight' ? 1 : 0);
    }
    gate.addEventListener('keydown', (event) => key(event, true));
    gate.addEventListener('keyup', (event) => key(event, false));
    gate.addEventListener('blur', reset);
    window.addEventListener('blur', reset);
    window.addEventListener('resize', reset);
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) reset();
    });
  }

  function activateGameControl() {
    if (window.GAME?.mode() === 'DONE') window.GAME.insertCoin();
    else window.GAME?.drop();
  }

  /** @param {HTMLButtonElement} button */
  function setupDropButton(button) {
    const release = () => {
      if (['DROPPING', 'CLOSING'].includes(window.GAME?.mode() || '')) return;
      button.classList.remove('is-pressed');
      button.setAttribute('aria-pressed', 'false');
    };
    button.addEventListener('pointerdown', (event) => {
      if (button.disabled || event.button !== 0) return;
      button.classList.add('is-pressed');
      button.setAttribute('aria-pressed', 'true');
    });
    window.addEventListener('pointerup', release);
    window.addEventListener('pointercancel', release);
    window.addEventListener('blur', release);
    button.addEventListener('click', activateGameControl);
  }

  gates.forEach((gate) => {
    if (gate instanceof HTMLElement) setupGate(gate);
  });
  buttons.forEach((button) => {
    if (button instanceof HTMLButtonElement) setupDropButton(button);
  });
})();
