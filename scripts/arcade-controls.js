// scripts/arcade-controls.js

(() => {
  const knob = document.getElementById('joy');
  const gate = document.getElementById('gate');
  const button = document.getElementById('btn-drop');
  if (!knob || !gate || !button) return;

  const JOY_CENTER = 0.58;
  const JOY_LEFT_TRAVEL = 0.10;
  const JOY_RIGHT_TRAVEL = 0.22;
  const MOVE_THRESHOLD = 0.18;

  let dragging = false;
  let lastDir = 0;
  let activePointer = null;

  function clamp(n, min, max){
    return Math.max(min, Math.min(max, n));
  }

  function dirFromRatio(ratio){
    if (ratio <= -MOVE_THRESHOLD) return -1;
    if (ratio >= MOVE_THRESHOLD) return 1;
    return 0;
  }

  function applyDirection(ratio){
    const dir = dirFromRatio(ratio);
    if (dir === lastDir) return;

    if (dir < 0) window.GAME?.moveLeft();
    else if (dir > 0) window.GAME?.moveRight();
    else window.GAME?.stopMove();
    lastDir = dir;
  }

  function setKnob(clientX){
    const rect = gate.getBoundingClientRect();
    const leftLimit = Math.max(6, rect.width * JOY_LEFT_TRAVEL);
    const rightLimit = Math.max(6, rect.width * JOY_RIGHT_TRAVEL);
    const centerX = rect.left + (rect.width * JOY_CENTER);
    const clamped = clamp(clientX - centerX, -leftLimit, rightLimit);
    const ratio = clamped < 0 ? clamped / leftLimit : clamped / rightLimit;

    gate.style.setProperty('--joy-x', `${clamped.toFixed(2)}px`);
    knob.setAttribute('aria-valuenow', ratio.toFixed(2));
    return ratio;
  }

  function resetKnob(){
    gate.style.setProperty('--joy-x', '0px');
    knob.setAttribute('aria-valuenow', '0');
  }

  function move(event){
    if (!dragging || event.pointerId !== activePointer) return;
    event.preventDefault();
    applyDirection(setKnob(event.clientX));
  }

  function stop(event){
    if (activePointer != null && event.pointerId !== activePointer) return;
    dragging = false;
    activePointer = null;
    resetKnob();
    window.GAME?.stopMove();
    lastDir = 0;
    try { gate.releasePointerCapture(event.pointerId); } catch {}
  }

  function start(event){
    event.preventDefault();
    dragging = true;
    activePointer = event.pointerId;
    try { gate.setPointerCapture(event.pointerId); } catch {}
    move(event);
  }

  function pressDrop(event){
    event.preventDefault();
    button.classList.add('is-pressed');
    button.setAttribute('aria-pressed', 'true');
    window.GAME?.drop();
  }

  function releaseDrop(){
    if (['DROPPING', 'CLOSING'].includes(window.GAME?.mode?.() || '')) return;
    button.classList.remove('is-pressed');
    button.setAttribute('aria-pressed', 'false');
  }

  gate.addEventListener('pointerdown', start, { passive:false });
  gate.addEventListener('pointermove', move, { passive:false });
  gate.addEventListener('pointerup', stop, { passive:false });
  gate.addEventListener('pointercancel', stop, { passive:false });
  gate.addEventListener('lostpointercapture', () => {
    if (!dragging) return;
    dragging = false;
    activePointer = null;
    resetKnob();
    window.GAME?.stopMove();
    lastDir = 0;
  });

  button.addEventListener('pointerdown', pressDrop, { passive:false });
  button.addEventListener('pointerup', releaseDrop);
  button.addEventListener('pointerleave', releaseDrop);
  button.addEventListener('pointercancel', releaseDrop);
})();
