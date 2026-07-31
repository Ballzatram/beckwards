// scripts/game.js
import { Loader } from './loader.js';
import { Renderer } from './renderer.js';
import { AudioBus } from './audio.js';
import { CLAW_GEOMETRY } from './claw-geometry.js';

(function(){
  const stage = document.getElementById('stage');
  const status = document.getElementById('arcade-status');
  const coinSlot = document.getElementById('coin-slot');
  const coinMouth = document.getElementById('coin-mouth');
  const frame = document.getElementById('arcade-frame');
  const dropButton = document.getElementById('btn-drop');
  const rewardModal = document.getElementById('reward-modal');
  const rewardPanel = document.getElementById('reward-panel');
  const rewardLink = document.getElementById('reward-link');
  const rewardImage = document.getElementById('reward-image');
  const rewardDownload = document.getElementById('reward-download');
  const rewardCloseButtons = Array.from(document.querySelectorAll('[data-reward-close]'));
  const rewardCoinLayers = Array.from(document.querySelectorAll('.reward-modal__coin-layer'));
  if (!stage) return;

  const BASE_W = CLAW_GEOMETRY.BASE_W;
  const BASE_H = CLAW_GEOMETRY.BASE_H;
  const CLAW_TIP_Y = CLAW_GEOMETRY.TIP_Y;
  const ACTIVE_MODES = new Set(['MOVING', 'DROPPING', 'CLOSING', 'RETURNING', 'DELIVERING', 'OPENING']);
  const PRIZE_TYPES = Array.from({ length: 27 }, (_, index) => ({
    spriteId: `cm_prize_${index + 1}`,
    name: `Prize ${index + 1}`,
    value: 100 + ((index % 5) * 20),
    width: 86,
    height: 86,
    grip: 0.72 + ((index % 4) * 0.04)
  }));
  const PRIZE_ROWS = [
    { y: 950, count: 7, xStart: 320, xEnd: 2145, jitterX: 40, jitterY: 6 },
    { y: 980, count: 8, xStart: 295, xEnd: 2180, jitterX: 46, jitterY: 6 },
    { y: 1008, count: 7, xStart: 355, xEnd: 2120, jitterX: 42, jitterY: 6 }
  ];
  const ARCADE_IMAGE_IDS = [
    'cm_claw_open_v2',
    'cm_claw_closed_v2',
    'quarter_1',
    ...PRIZE_TYPES.map(type => type.spriteId)
  ];
  const ARCADE_AUDIO_IDS = [
    'motor_loop',
    'ui_click',
    'quarter_audio_1',
    'claw_open_sfx',
    'claw_close_sfx',
    'fail',
    'prize_drop'
  ];
  const REWARD_ID_PATTERN = /^cm_reward_/;
  const REWARD_QUARTER_SRCS = [
    'assets/home-page/assets/quarter%201.webp',
    'assets/home-page/assets/quarter%202.webp',
    'assets/home-page/assets/quarter%203.webp',
    'assets/home-page/assets/quarter%204.webp'
  ];

  const canvas = document.createElement('canvas');
  canvas.id = 'game-canvas';
  canvas.setAttribute('aria-hidden', 'true');
  stage.innerHTML = '';
  stage.appendChild(canvas);

  const loader = Loader;
  const renderer = new Renderer(canvas, loader);

  const cfg = {
    bounds: { left: 410, right: 2140 },
    speeds: { move: 640, return: 920, descend: 740, carriedSway: 12 },
    drop: { maxDropLen: 410, closeDelayMs: 260, openDelayMs: 310 },
    grip: { perfectRadius: 34, grabRadius: 94, maxDepthError: 84 },
    chute: { x: 1264, y: 1168, w: 180, h: 130 }
  };

  function clamp(n, min, max){
    return Math.max(min, Math.min(max, n));
  }

  function easeInOut(t){
    return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
  }

  function durationFromSpeed(from, to, speed){
    return Math.max(1, Math.abs(to - from) / speed * 1000);
  }

  function phaseValue(phase, rawProgress){
    const progress = phase.easing === 'linear' ? rawProgress : easeInOut(rawProgress);
    return phase.from + ((phase.to - phase.from) * progress);
  }

  function randomInt(min, max){
    return Math.floor(min + Math.random() * (max - min + 1));
  }

  function shuffle(items){
    const copy = [...items];
    for (let i = copy.length - 1; i > 0; i--){
      const j = Math.floor(Math.random() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  }

  function getManifestRewardItems(){
    return (loader.manifest?.images || [])
      .filter(item => item?.id && item?.src && REWARD_ID_PATTERN.test(item.id))
      .sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric:true }));
  }

  function nextRewardItem(){
    if (!rewardItems.length) return null;
    if (!rewardBag.length) rewardBag = shuffle(rewardItems);
    return rewardBag.pop();
  }

  function fileNameFromPath(src, fallback){
    const clean = String(src || '').split('#')[0].split('?')[0];
    const fileName = clean.split('/').pop() || fallback;
    try {
      return decodeURIComponent(fileName);
    } catch (_) {
      return fileName;
    }
  }

  function makePrize(index, type, x, y){
    const scale = 0.92 + Math.random() * 0.2;
    return {
      id: `p-${index}-${Math.random().toString(16).slice(2)}`,
      type: type.name,
      spriteId: type.spriteId,
      value: type.value,
      grip: type.grip,
      width: Math.round(type.width * scale),
      height: Math.round(type.height * scale),
      x,
      y,
      baseY: y,
      rotation: (Math.random() - 0.5) * 0.34,
      scale,
      grabbed: false,
      collected: false,
      wobble: Math.random() * Math.PI * 2
    };
  }

  function makePrizeField(){
    const slots = PRIZE_ROWS.flatMap((row) => {
      const span = row.xEnd - row.xStart;
      return Array.from({ length: row.count }, (_, index) => {
        const ratio = row.count === 1 ? 0.5 : index / (row.count - 1);
        return {
          x: row.xStart + (span * ratio) + ((Math.random() - 0.5) * row.jitterX),
          y: row.y + ((Math.random() - 0.5) * row.jitterY)
        };
      });
    });
    const count = randomInt(6, Math.min(9, PRIZE_TYPES.length, slots.length));
    const types = shuffle(PRIZE_TYPES).slice(0, count);
    return shuffle(slots).slice(0, count).map((slot, index) => makePrize(index, types[index], slot.x, slot.y));
  }

  function makeInitialState(){
    return {
      width: BASE_W,
      height: BASE_H,
      carriageX: 1085,
      vx: 0,
      dropLen: 0,
      targetY: 0,
      clawClosed: false,
      clawGrip: 0,
      mode: 'READY',
      heldPrize: null,
      prizes: makePrizeField(),
      attempts: 0,
      catches: 0,
      message: '',
      subMessage: '',
      noticeTimer: 0,
      shake: 0,
      flash: 0,
      grabResolved: false,
      prizeDelivered: false,
      particles: [],
      now: performance.now()
    };
  }

  let state = makeInitialState();
  let phase = null;
  let last = performance.now();
  let rafId = 0;
  let motorOn = false;
  let finished = false;
  let coinReady = null;
  let statusText = null;
  let statusDone = null;
  let dropPressed = null;
  let rewardItems = [];
  let rewardBag = [];
  let previousRewardFocus = null;
  let rewardCoinCleanupTimer = null;
  let winAudioRequested = false;

  function prepareWinAudio(){
    if (winAudioRequested) return;
    winAudioRequested = true;
    loader.loadAll(() => {}, { audioIds:['win'], concurrency:1 }).catch(() => {});
  }

  function wake(resetClock = true){
    if (rafId) return;
    if (resetClock) last = performance.now();
    rafId = requestAnimationFrame(step);
  }

  function drawOnce(){
    state.now = performance.now();
    renderer.draw(state);
  }

  function startPhase(mode, prop, from, to, duration, startedAt = performance.now(), easing = 'easeInOut', schedule = true){
    phase = { mode, prop, from, to, duration:Math.max(1, duration), startedAt, easing };
    state.mode = mode;
    if (prop) state[prop] = from;
    if (schedule) wake(false);
  }

  function startDropPhase(startedAt = performance.now(), schedule = true){
    startPhase(
      'DROPPING',
      'dropLen',
      state.dropLen,
      state.targetY,
      durationFromSpeed(state.dropLen, state.targetY, cfg.speeds.descend),
      startedAt,
      'easeInOut',
      schedule
    );
  }

  function startClosingPhase(startedAt, schedule = true){
    state.clawClosed = false;
    state.clawGrip = 0;
    state.grabResolved = false;
    startPhase('CLOSING', 'clawGrip', 0, 1, cfg.drop.closeDelayMs, startedAt, 'easeInOut', schedule);
    updateMotorByState();
  }

  function startReturnPhase(startedAt, schedule = true){
    state.clawGrip = 1;
    state.clawClosed = true;
    setDropButtonPressed(false);
    setStatus('');
    startPhase(
      'RETURNING',
      'dropLen',
      state.dropLen,
      0,
      durationFromSpeed(state.dropLen, 0, cfg.speeds.return),
      startedAt,
      'easeInOut',
      schedule
    );
    updateMotorByState();
  }

  function startDeliverPhase(startedAt, schedule = true){
    state.clawClosed = true;
    state.clawGrip = 1;
    setStatus('GOT IT');
    startPhase(
      'DELIVERING',
      'carriageX',
      state.carriageX,
      cfg.chute.x,
      durationFromSpeed(state.carriageX, cfg.chute.x, cfg.speeds.return),
      startedAt,
      'easeInOut',
      schedule
    );
    updateMotorByState();
  }

  function startOpeningPhase(startedAt, schedule = true){
    state.clawClosed = true;
    state.clawGrip = 1;
    state.prizeDelivered = false;
    startPhase('OPENING', 'clawGrip', 1, 0, cfg.drop.openDelayMs, startedAt, 'easeInOut', schedule);
    updateMotorByState();
  }

  function setStatus(text, done = false){
    if (!status) return;
    const nextText = String(text || '');
    const nextDone = !!done;
    if (statusText === nextText && statusDone === nextDone) return;
    statusText = nextText;
    statusDone = nextDone;
    status.textContent = nextText;
    status.classList.toggle('is-done', nextDone);
  }

  function setCoinReady(ready){
    const nextReady = !!ready;
    if (coinReady === nextReady) return;
    coinReady = nextReady;
    if (!coinSlot) return;
    coinSlot.disabled = !nextReady;
    coinSlot.setAttribute('aria-disabled', String(!nextReady));
  }

  function play(id, volume = 0.5){
    AudioBus.play(loader.snd(id) || loader.snd('ui_click'), { volume });
  }

  function isRewardOpen(){
    return !!rewardModal && !rewardModal.hidden;
  }

  function clearRewardCoins(){
    window.clearTimeout(rewardCoinCleanupTimer);
    rewardCoinCleanupTimer = null;
    rewardCoinLayers.forEach((layer) => {
      layer.textContent = '';
    });
  }

  function rewardQuarterSrc(index){
    const loaded = loader.img('quarter_1');
    if (loaded && index % REWARD_QUARTER_SRCS.length === 0) {
      return loaded.currentSrc || loaded.src || REWARD_QUARTER_SRCS[0];
    }
    return REWARD_QUARTER_SRCS[index % REWARD_QUARTER_SRCS.length];
  }

  function spawnRewardCoins(){
    clearRewardCoins();
    if (!rewardCoinLayers.length || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const isMobile = window.matchMedia('(max-width: 620px)').matches;
    const viewportW = window.innerWidth;
    const coinMaxW = isMobile ? 54 : 82;
    const coinCount = isMobile ? 42 : 72;
    const maxX = Math.max(0, viewportW - coinMaxW);
    const minDrift = isMobile ? -44 : -110;
    const maxDrift = isMobile ? 44 : 110;
    rewardCoinLayers.forEach((layer) => {
      const fragment = document.createDocumentFragment();
      for (let i = 0; i < coinCount; i++){
        const coin = document.createElement('img');
        coin.className = 'reward-modal__coin';
        coin.src = rewardQuarterSrc(i);
        coin.alt = '';
        coin.decoding = 'async';
        coin.loading = 'eager';
        coin.setAttribute('aria-hidden', 'true');
        coin.style.setProperty('--coin-x', `${randomInt(0, maxX)}px`);
        coin.style.setProperty('--coin-delay', `${(-1.1 + (i % 44) * 0.045 + Math.random() * 0.72).toFixed(2)}s`);
        coin.style.setProperty('--coin-duration', `${(2.05 + Math.random() * 1.55).toFixed(2)}s`);
        coin.style.setProperty('--coin-drift', `${randomInt(minDrift, maxDrift)}px`);
        coin.style.setProperty('--coin-rotate', `${randomInt(-960, 960)}deg`);
        coin.style.setProperty('--coin-scale', `${(0.74 + Math.random() * 0.72).toFixed(2)}`);
        fragment.appendChild(coin);
      }
      layer.appendChild(fragment);
    });

    rewardCoinCleanupTimer = window.setTimeout(clearRewardCoins, 6200);
  }

  function closeRewardModal(restoreFocus = true){
    if (!isRewardOpen()) return;
    rewardModal.hidden = true;
    rewardModal.classList.remove('is-open');
    document.body.classList.remove('reward-modal-open');
    clearRewardCoins();
    if (restoreFocus && previousRewardFocus && document.contains(previousRewardFocus)) {
      previousRewardFocus.focus?.({ preventScroll:true });
    }
    previousRewardFocus = null;
  }

  function showRewardModal(){
    if (!rewardModal || !rewardPanel || !rewardImage || !rewardDownload) return;

    const reward = nextRewardItem();
    previousRewardFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;

    if (reward) {
      const src = loader._withV(reward.src);
      const href = typeof reward.href === 'string' ? reward.href.trim() : '';
      rewardImage.src = src;
      rewardImage.hidden = false;
      if (rewardLink) {
        if (href) {
          rewardLink.href = href;
          rewardLink.setAttribute('aria-label', 'Open hidden Infinite Jest page');
          rewardLink.title = 'Open hidden Infinite Jest page';
        } else {
          rewardLink.removeAttribute('href');
          rewardLink.removeAttribute('aria-label');
          rewardLink.removeAttribute('title');
        }
      }
      rewardDownload.href = src;
      rewardDownload.download = fileNameFromPath(reward.src, `${reward.id}.png`);
      rewardDownload.hidden = false;
      rewardDownload.removeAttribute('aria-disabled');
    } else {
      rewardImage.hidden = true;
      rewardImage.removeAttribute('src');
      if (rewardLink) {
        rewardLink.removeAttribute('href');
        rewardLink.removeAttribute('aria-label');
        rewardLink.removeAttribute('title');
      }
      rewardDownload.hidden = true;
      rewardDownload.removeAttribute('href');
      rewardDownload.setAttribute('aria-disabled', 'true');
    }

    rewardModal.hidden = false;
    rewardModal.classList.add('is-open');
    document.body.classList.add('reward-modal-open');
    spawnRewardCoins();
    window.setTimeout(() => {
      rewardPanel.focus?.({ preventScroll:true });
    }, 0);
  }

  function trapRewardFocus(event){
    if (!isRewardOpen() || event.key !== 'Tab' || !rewardModal) return false;
    const focusable = Array.from(rewardModal.querySelectorAll('a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])'))
      .filter(el => !el.hidden && el.offsetParent !== null);
    if (!focusable.length) {
      event.preventDefault();
      rewardPanel?.focus?.({ preventScroll:true });
      return true;
    }

    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
      return true;
    }
    if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
      return true;
    }
    return false;
  }

  function setMotor(on){
    const motor = loader.snd('motor_loop');
    if (!motor) return;
    if (on && !motorOn){
      motorOn = true;
      try { AudioBus.loop(motor, { volume: 0.18 }); } catch {}
    } else if (!on && motorOn){
      motorOn = false;
      try { motor.pause(); motor.currentTime = 0; } catch {}
    }
  }

  function updateMotorByState(){
    const moving = state.vx !== 0 && !finished;
    const mechActive = ['DROPPING', 'CLOSING', 'RETURNING', 'DELIVERING', 'OPENING'].includes(state.mode);
    setMotor(moving || mechActive);
  }

  function setDropButtonPressed(pressed){
    const nextPressed = !!pressed;
    if (dropPressed === nextPressed) return;
    dropPressed = nextPressed;
    dropButton?.classList.toggle('is-pressed', nextPressed);
    dropButton?.setAttribute('aria-pressed', String(nextPressed));
  }

  function updateDropButtonByState(){
    setDropButtonPressed(state.mode === 'DROPPING' || state.mode === 'CLOSING');
  }

  function announce(message, subMessage = '', seconds = 1.2){
    state.message = message;
    state.subMessage = subMessage;
    state.noticeTimer = seconds;
  }

  function finishAttempt(message, subMessage){
    finished = true;
    phase = null;
    state.mode = 'DONE';
    state.vx = 0;
    state.clawClosed = false;
    state.clawGrip = 0;
    state.heldPrize = null;
    state.dropLen = 0;
    state.message = message;
    state.subMessage = subMessage;
    state.noticeTimer = 9999;
    setStatus('INSERT COIN', true);
    setDropButtonPressed(false);
    setCoinReady(true);
    updateMotorByState();
  }

  function resetAttempt(){
    closeRewardModal(false);
    state = makeInitialState();
    phase = null;
    finished = false;
    setCoinReady(false);
    setStatus('');
    setDropButtonPressed(false);
    updateMotorByState();
    wake();
  }

  function animateCoinDrop(){
    if (!frame) return;
    const source = loader.img('quarter_1');
    const coin = document.createElement('img');
    coin.className = 'arcade-coin';
    coin.src = source?.currentSrc || source?.src || 'assets/home-page/assets/quarter%201.webp';
    coin.alt = '';
    coin.setAttribute('aria-hidden', 'true');
    coin.decoding = 'async';
    const target = coinMouth || coinSlot;
    const targetRect = target?.getBoundingClientRect();
    const frameRect = frame.getBoundingClientRect();
    if (targetRect && frameRect.width && frameRect.height){
      coin.style.left = `${targetRect.left + targetRect.width / 2 - frameRect.left}px`;
      coin.style.top = `${targetRect.top + targetRect.height / 2 - frameRect.top}px`;
    }
    frame.appendChild(coin);
    window.setTimeout(() => {
      try { coin.remove(); } catch {}
    }, 560);
  }

  function insertCoin(){
    if (!coinReady) return;
    setCoinReady(false);
    setStatus('');
    animateCoinDrop();
    play('quarter_audio_1', 0.7);
    window.setTimeout(resetAttempt, 760);
  }

  function spawnParticles(x, y, color, count = 12){
    for (let i = 0; i < count; i++){
      const a = Math.random() * Math.PI * 2;
      const speed = 80 + Math.random() * 130;
      state.particles.push({
        x,
        y,
        vx: Math.cos(a) * speed,
        vy: Math.sin(a) * speed - 50,
        life: 0.45 + Math.random() * 0.45,
        maxLife: 0.9,
        color,
        size: 5 + Math.random() * 6
      });
    }
  }

  function canMove(){
    return !finished && (state.mode === 'READY' || state.mode === 'MOVING');
  }

  const CTRL = {
    mode(){
      return state.mode;
    },
    moveLeft(){
      if (!canMove()) return;
      state.vx = -1;
      state.mode = 'MOVING';
      state.message = '';
      state.subMessage = '';
      setStatus('');
      updateMotorByState();
      wake();
    },
    moveRight(){
      if (!canMove()) return;
      state.vx = 1;
      state.mode = 'MOVING';
      state.message = '';
      state.subMessage = '';
      setStatus('');
      updateMotorByState();
      wake();
    },
    stopMove(){
      state.vx = 0;
      if (state.mode === 'MOVING') state.mode = 'READY';
      updateMotorByState();
      wake();
    },
    drop(){
      if (finished || !(state.mode === 'READY' || state.mode === 'MOVING')) return;
      prepareWinAudio();
      phase = null;
      state.vx = 0;
      state.clawClosed = false;
      state.clawGrip = 0;
      state.grabResolved = false;
      state.prizeDelivered = false;
      state.targetY = chooseDropDepth();
      state.attempts += 1;
      state.message = '';
      state.subMessage = '';
      setStatus('');
      play('ui_click', 0.55);
      play('claw_open_sfx', 0.45);
      setDropButtonPressed(true);
      startDropPhase();
      updateMotorByState();
    },
    insertCoin
  };
  window.GAME = CTRL;

  function chooseDropDepth(){
    let closest = null;
    let closestDx = Infinity;
    for (const prize of state.prizes){
      if (prize.grabbed || prize.collected) continue;
      const dx = Math.abs((prize.x + prize.width / 2) - state.carriageX);
      if (dx < cfg.grip.grabRadius + 42 && dx < closestDx){
        closest = prize;
        closestDx = dx;
      }
    }

    if (!closest) return cfg.drop.maxDropLen;
    return clamp(closest.y + closest.height * 0.52 - CLAW_TIP_Y, 150, cfg.drop.maxDropLen);
  }

  function tryGrabPrize(){
    let target = null;
    let bestScore = -Infinity;
    const clawX = state.carriageX;
    const clawY = CLAW_TIP_Y + state.dropLen;
    for (const prize of state.prizes){
      if (prize.grabbed || prize.collected) continue;
      const centerX = prize.x + prize.width / 2;
      const centerY = prize.y + prize.height / 2;
      const dx = Math.abs(centerX - clawX);
      const dy = Math.abs(centerY - clawY);
      if (dx > cfg.grip.grabRadius || dy > cfg.grip.maxDepthError) continue;

      const accuracy = 1 - clamp(dx / cfg.grip.grabRadius, 0, 1);
      const depth = 1 - clamp(dy / cfg.grip.maxDepthError, 0, 1);
      const pickup = accuracy * 0.7 + depth * 0.3 + prize.grip * 0.2;
      if (pickup > bestScore){
        bestScore = pickup;
        target = prize;
      }
    }

    if (!target || bestScore < 0.48){
      state.shake = 0.18;
      play('fail', 0.35);
      announce('MISSED', 'WAIT FOR THE CLAW', 0.8);
      return;
    }

    target.grabbed = true;
    state.heldPrize = target;
    play('claw_close_sfx', 0.58);
    spawnParticles(target.x + target.width / 2, target.y + target.height / 2, 'rgb(249,244,216)', 10);
  }

  function deliverPrize(){
    if (!state.heldPrize) return;
    const prize = state.heldPrize;
    prize.collected = true;
    prize.grabbed = false;
    prize.x = cfg.chute.x + 16;
    prize.y = cfg.chute.y - 54;
    state.heldPrize = null;
    state.catches += 1;
    state.flash = 0.35;
    play('prize_drop', 0.55);
    play('win', 0.35);
    spawnParticles(cfg.chute.x + 90, cfg.chute.y - 26, 'rgb(255,243,109)', 22);
  }

  function updateParticles(dt){
    const particles = state.particles;
    let writeIndex = 0;
    for (let i = 0; i < particles.length; i++){
      const p = particles[i];
      p.life -= dt;
      if (p.life <= 0) continue;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 220 * dt;
      particles[writeIndex++] = p;
    }
    particles.length = writeIndex;
  }

  function updateHeldPrize(now){
    if (!state.heldPrize) return;
    const p = state.heldPrize;
    const sway = Math.sin(now / 120) * cfg.speeds.carriedSway;
    p.x = state.carriageX - p.width / 2 + sway;
    p.y = CLAW_TIP_Y - 42 + state.dropLen;
  }

  function updateTimers(dt){
    if (state.noticeTimer > 0 && state.noticeTimer < 9999){
      state.noticeTimer = Math.max(0, state.noticeTimer - dt);
      if (state.noticeTimer === 0 && state.mode !== 'DONE'){
        state.message = '';
        state.subMessage = '';
      }
    }

    state.shake = Math.max(0, state.shake - dt);
    state.flash = Math.max(0, state.flash - dt);
    updateParticles(dt);
  }

  function hasActiveAnimation(){
    return !!phase || ACTIVE_MODES.has(state.mode) || state.flash > 0 || state.particles.length > 0;
  }

  function applyPhaseProgress(rawProgress){
    const progress = clamp(rawProgress, 0, 1);
    if (!phase) return;
    if (phase.prop) state[phase.prop] = phaseValue(phase, progress);

    if (phase.mode === 'CLOSING'){
      state.clawClosed = state.clawGrip >= 0.82;
      if (!state.grabResolved && progress >= 0.72){
        state.grabResolved = true;
        tryGrabPrize();
      }
    } else if (phase.mode === 'OPENING'){
      state.clawClosed = state.clawGrip > 0.2;
      if (!state.prizeDelivered && progress >= 0.45){
        state.prizeDelivered = true;
        deliverPrize();
      }
    }
  }

  function completePhase(completed, endedAt){
    const mode = completed.mode;
    if (completed.prop) state[completed.prop] = completed.to;

    if (mode === 'DROPPING'){
      startClosingPhase(endedAt, false);
    } else if (mode === 'CLOSING'){
      state.clawGrip = 1;
      state.clawClosed = true;
      startReturnPhase(endedAt, false);
    } else if (mode === 'RETURNING'){
      state.dropLen = 0;
      if (state.heldPrize) startDeliverPhase(endedAt, false);
      else finishAttempt('MISSED', 'INSERT COIN TO RETRY');
      updateMotorByState();
    } else if (mode === 'DELIVERING'){
      state.carriageX = cfg.chute.x;
      startOpeningPhase(endedAt, false);
    } else if (mode === 'OPENING'){
      state.clawGrip = 0;
      state.clawClosed = false;
      finishAttempt('GOT IT', 'NICE GRAB');
      showRewardModal();
    }
  }

  function updatePhase(t){
    let guard = 0;
    while (phase && guard < 10){
      guard += 1;
      const current = phase;
      const rawProgress = (t - current.startedAt) / current.duration;
      applyPhaseProgress(rawProgress);
      if (rawProgress < 1) return;

      const endedAt = current.startedAt + current.duration;
      phase = null;
      completePhase(current, endedAt);
    }
  }

  function step(t){
    rafId = 0;
    const dt = Math.max(0, (t - last) / 1000);
    const timerDt = Math.min(0.05, dt);
    last = t;
    state.now = t;
    updateTimers(timerDt);

    if (canMove() && state.vx !== 0){
      const prevX = state.carriageX;
      const manualDelta = clamp(state.vx * cfg.speeds.move * dt, -52, 52);
      state.carriageX = clamp(state.carriageX + manualDelta, cfg.bounds.left, cfg.bounds.right);
      if (prevX === state.carriageX && (state.carriageX === cfg.bounds.left || state.carriageX === cfg.bounds.right)){
        state.vx = 0;
        state.mode = 'READY';
        updateMotorByState();
      }
    }

    updatePhase(t);

    updateHeldPrize(t);
    updateDropButtonByState();
    renderer.draw(state);

    if (hasActiveAnimation()){
      rafId = requestAnimationFrame(step);
    }
  }

  const label = document.createElement('div');
  Object.assign(label.style, {
    position:'absolute',
    inset:'0',
    display:'grid',
    placeItems:'center',
    fontFamily:'monospace',
    fontSize:'12px',
    color:'#f20b06',
    textShadow:'1px 1px 0 #000',
    textAlign:'center',
    padding:'8px',
    zIndex:'3'
  });
  label.textContent = 'Loading... 0%';
  stage.style.position = 'absolute';
  stage.appendChild(label);
  const progress = (p)=>{
    label.textContent = `Loading... ${Math.round(p * 100)}%`;
    if (p >= 1) label.remove();
  };

  let unlocked = false;
  function unlockOnce(){
    if (unlocked) return;
    unlocked = true;
    const click = loader.snd('ui_click');
    if (click) AudioBus.play(click, { volume: 0.01 });
    ['pointerdown','touchstart','keydown'].forEach(ev => window.removeEventListener(ev, unlockOnce, true));
  }
  ['pointerdown','touchstart','keydown'].forEach(ev => window.addEventListener(ev, unlockOnce, { capture:true }));

  coinSlot?.addEventListener('pointerdown', (event) => {
    if (!coinReady) return;
    event.preventDefault();
    insertCoin();
  }, { passive:false });

  rewardCloseButtons.forEach((button) => {
    button.addEventListener('click', () => closeRewardModal());
  });

  document.addEventListener('visibilitychange', ()=>{
    if (document.hidden) {
      setMotor(false);
    } else {
      updateMotorByState();
      if (hasActiveAnimation()) wake();
    }
  });

  window.addEventListener('keydown', (e)=>{
    if (e.repeat) return;
    if (isRewardOpen()){
      if (e.key === 'Escape') {
        e.preventDefault();
        closeRewardModal();
      } else {
        trapRewardFocus(e);
      }
      return;
    }
    const key = e.key.toLowerCase();
    if (e.key === 'ArrowLeft' || key === 'a'){
      e.preventDefault();
      CTRL.moveLeft();
    } else if (e.key === 'ArrowRight' || key === 'd'){
      e.preventDefault();
      CTRL.moveRight();
    } else if (e.key === ' ' || e.key === 'Enter' || key === 's'){
      e.preventDefault();
      if (coinReady) {
        insertCoin();
        return;
      }
      setDropButtonPressed(true);
      CTRL.drop();
    }
  });

  window.addEventListener('keyup', (e)=>{
    const key = e.key.toLowerCase();
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight' || key === 'a' || key === 'd'){
      e.preventDefault();
      CTRL.stopMove();
    }
  });

  function onResize(){
    renderer.resizeTo();
    drawOnce();
  }
  window.addEventListener('resize', onResize);

  async function init(){
    const base = window.location.pathname.replace(/[^/]+$/, '');
    const candidates = [
      'assets/data/manifest.json',
      './assets/data/manifest.json',
      base + 'assets/data/manifest.json',
      '/beckwards/assets/data/manifest.json'
    ];
    let ok = false;
    let lastErr;
    for (const url of candidates){
      try {
        await loader.loadManifest(url);
        ok = true;
        break;
      } catch(e) {
        lastErr = e;
      }
    }
    if (!ok){
      label.innerHTML = 'Error: manifest not found.';
      console.error(lastErr);
      return;
    }

    loader.setVersion?.(loader.manifest?.meta?.version || '');
    rewardItems = getManifestRewardItems();
    try {
      await loader.loadAll(progress, {
        imageIds: ARCADE_IMAGE_IDS,
        audioIds: ARCADE_AUDIO_IDS,
        concurrency: 6
      });
    } catch(e) {
      console.error('[loader] unexpected error', e);
    }

    onResize();
    setStatus('');
    setCoinReady(false);
    setDropButtonPressed(false);
    drawOnce();
  }

  init();
})();
