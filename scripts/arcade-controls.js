// scripts/arcade-controls.js

(() => {
  const gates = Array.from(document.querySelectorAll('[data-arcade-joystick]'));
  const buttons = Array.from(document.querySelectorAll('[data-arcade-drop]'));
  if (!gates.length || !buttons.length) return;

  const MOVE_THRESHOLD = 0.34;

  function clamp(number, min, max){
    return Math.max(min, Math.min(max, number));
  }

  function directionFromRatio(ratio){
    if (ratio <= -MOVE_THRESHOLD) return -1;
    if (ratio >= MOVE_THRESHOLD) return 1;
    return 0;
  }

  function applyGameDirection(direction){
    if (direction < 0) window.GAME?.moveLeft();
    else if (direction > 0) window.GAME?.moveRight();
    else window.GAME?.stopMove();
  }

  function setupGate(gate){
    const knob = gate.querySelector('[data-arcade-knob]');
    if (!knob) return;

    let dragging = false;
    let activePointer = null;
    let lastDirection = 0;

    const setAriaValue = (ratio) => {
      const rounded = Number(ratio.toFixed(2));
      gate.setAttribute('aria-valuenow', String(rounded));
      gate.setAttribute('aria-valuetext', rounded < 0 ? 'Moving left' : rounded > 0 ? 'Moving right' : 'Centered');
    };

    const applyDirection = (ratio) => {
      const direction = directionFromRatio(ratio);
      if (direction === lastDirection) return;
      applyGameDirection(direction);
      lastDirection = direction;
    };

    const setRatio = (ratio) => {
      const rect = gate.getBoundingClientRect();
      const leftTravel = Math.max(18, rect.width * (gate.classList.contains('arcade-mobile-gate') ? 0.32 : 0.14));
      const rightTravel = Math.max(24, rect.width * (gate.classList.contains('arcade-mobile-gate') ? 0.32 : 0.22));
      const clampedRatio = clamp(ratio, -1, 1);
      const travel = clampedRatio < 0 ? leftTravel : rightTravel;
      gate.style.setProperty('--joy-x', `${(clampedRatio * travel).toFixed(2)}px`);
      setAriaValue(clampedRatio);
      return clampedRatio;
    };

    const setKnob = (clientX) => {
      const rect = gate.getBoundingClientRect();
      const leftTravel = Math.max(18, rect.width * (gate.classList.contains('arcade-mobile-gate') ? 0.32 : 0.14));
      const rightTravel = Math.max(24, rect.width * (gate.classList.contains('arcade-mobile-gate') ? 0.32 : 0.22));
      const centerRatio = gate.classList.contains('arcade-mobile-gate') ? 0.5 : 0.58;
      const centerX = rect.left + (rect.width * centerRatio);
      const offset = clamp(clientX - centerX, -leftTravel, rightTravel);
      const ratio = offset < 0 ? offset / leftTravel : offset / rightTravel;

      gate.style.setProperty('--joy-x', `${offset.toFixed(2)}px`);
      setAriaValue(ratio);
      return ratio;
    };

    const reset = () => {
      dragging = false;
      activePointer = null;
      lastDirection = 0;
      setRatio(0);
      window.GAME?.stopMove();
    };

    const move = (event) => {
      if (!dragging || event.pointerId !== activePointer) return;
      event.preventDefault();
      applyDirection(setKnob(event.clientX));
    };

    const stop = (event) => {
      if (activePointer != null && event.pointerId !== activePointer) return;
      try { gate.releasePointerCapture(event.pointerId); } catch (_) {}
      reset();
    };

    const start = (event) => {
      if (event.isPrimary === false || (event.button !== undefined && event.button !== 0)) return;
      event.preventDefault();
      dragging = true;
      activePointer = event.pointerId;
      gate.focus?.({ preventScroll:true });
      try { gate.setPointerCapture(event.pointerId); } catch (_) {}
      move(event);
    };

    gate.addEventListener('pointerdown', start, { passive:false });
    gate.addEventListener('pointermove', move, { passive:false });
    gate.addEventListener('pointerup', stop, { passive:false });
    gate.addEventListener('pointercancel', stop, { passive:false });
    gate.addEventListener('lostpointercapture', () => {
      if (dragging) reset();
    });
    gate.addEventListener('keydown', (event) => {
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
      event.preventDefault();
      event.stopPropagation();
      const ratio = event.key === 'ArrowLeft' ? -1 : 1;
      setRatio(ratio);
      applyDirection(ratio);
    });
    gate.addEventListener('keyup', (event) => {
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
      event.preventDefault();
      event.stopPropagation();
      reset();
    });
    gate.addEventListener('blur', reset);
  }

  function activateGameControl(){
    if (window.GAME?.mode?.() === 'DONE') {
      window.GAME?.insertCoin();
      return;
    }
    window.GAME?.drop();
  }

  function setupDropButton(button){
    const press = (event) => {
      if (event.isPrimary === false || (event.button !== undefined && event.button !== 0)) return;
      button.classList.add('is-pressed');
      button.setAttribute('aria-pressed', 'true');
    };

    const release = () => {
      if (['DROPPING', 'CLOSING'].includes(window.GAME?.mode?.() || '')) return;
      button.classList.remove('is-pressed');
      button.setAttribute('aria-pressed', 'false');
    };

    button.addEventListener('pointerdown', press);
    button.addEventListener('pointerup', release);
    button.addEventListener('pointerleave', release);
    button.addEventListener('pointercancel', release);
    button.addEventListener('click', activateGameControl);
  }

  gates.forEach(setupGate);
  buttons.forEach(setupDropButton);
})();
