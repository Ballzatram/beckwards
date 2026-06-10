// scripts/game.js
import { Loader } from './loader.js';
import { Renderer } from './renderer.js';
import { AudioBus } from './audio.js';

(function(){
  const stage = document.getElementById('stage');
  if (!stage) return;

  const BASE_W = 320;
  const BASE_H = 240;
  const STORAGE_KEY = 'beckwards-claw-best';
  const ROUND_TIME = 45;
  const PRIZE_TYPES = [
    { spriteId: 'prize_star', name: 'Star', value: 140, width: 40, height: 40, grip: 0.9 },
    { spriteId: 'prize_duck', name: 'Duck', value: 110, width: 48, height: 36, grip: 0.82 },
    { spriteId: 'prize_box', name: 'Mystery Box', value: 220, width: 36, height: 36, grip: 0.68 }
  ];

  const canvas = document.createElement('canvas');
  canvas.id = 'game-canvas';
  canvas.style.width = '100%';
  canvas.style.height = '100%';
  stage.innerHTML = '';
  stage.appendChild(canvas);

  const loader = Loader;
  loader.setVersion?.(Date.now());
  const renderer = new Renderer(canvas, loader);

  const cfg = {
    bounds: { left: 24, right: BASE_W - 24 },
    speeds: { move: 150, return: 230, descend: 185, carriedSway: 2.4 },
    drop: { maxDropLen: 118, closeDelayMs: 220, openDelayMs: 260 },
    grip: { perfectRadius: 7, grabRadius: 24, maxDepthError: 28 },
    chute: { x: 274, y: 186, w: 36, h: 34 }
  };

  function clamp(n, min, max){
    return Math.max(min, Math.min(max, n));
  }

  function makePrize(index, type, x, y){
    return {
      id: `p-${Date.now()}-${index}-${Math.random().toString(16).slice(2)}`,
      type: type.name,
      spriteId: type.spriteId,
      value: type.value,
      grip: type.grip,
      width: type.width,
      height: type.height,
      x,
      y,
      baseY: y,
      grabbed: false,
      collected: false,
      wobble: Math.random() * Math.PI * 2
    };
  }

  function makePrizeField(){
    const xs = [26, 72, 118, 166, 214, 254];
    return xs.map((x, index) => {
      const type = PRIZE_TYPES[(index + Math.floor(Math.random() * PRIZE_TYPES.length)) % PRIZE_TYPES.length];
      return makePrize(index, type, x + Math.random() * 14 - 7, 156 + Math.random() * 24);
    });
  }

  function readBestScore(){
    try { return Number(localStorage.getItem(STORAGE_KEY)) || 0; }
    catch { return 0; }
  }

  function writeBestScore(score){
    try { localStorage.setItem(STORAGE_KEY, String(score)); }
    catch {}
  }

  function makeInitialState(){
    return {
      width: BASE_W,
      height: BASE_H,
      carriageX: 160,
      vx: 0,
      dropLen: 0,
      targetY: 0,
      clawClosed: false,
      mode: 'READY',
      heldPrize: null,
      prizes: makePrizeField(),
      score: 0,
      bestScore: readBestScore(),
      catches: 0,
      drops: 0,
      combo: 0,
      timeLeft: ROUND_TIME,
      message: 'DROP TO PLAY',
      subMessage: 'Catch prizes before time runs out',
      noticeTimer: 0,
      shake: 0,
      flash: 0,
      particles: []
    };
  }

  let state = makeInitialState();
  let closeTimer = 0;
  let openTimer = 0;
  let last = performance.now();
  let roundActive = false;
  let motorOn = false;

  function onResize(){
    const rect = stage.getBoundingClientRect();
    renderer.resizeTo(rect.width, rect.height);
  }
  window.addEventListener('resize', onResize);

  function play(id, volume = 0.5){
    AudioBus.play(loader.snd(id) || loader.snd('ui_click'), { volume });
  }

  function setMotor(on){
    const motor = loader.snd('motor_loop');
    if (!motor) return;
    if (on && !motorOn){
      motorOn = true;
      try { AudioBus.loop ? AudioBus.loop(motor, { volume: 0.2 }) : motor.play(); } catch {}
    } else if (!on && motorOn){
      motorOn = false;
      try { motor.pause(); motor.currentTime = 0; } catch {}
    }
  }

  function updateMotorByState(){
    const moving = state.vx !== 0;
    const mechActive = state.mode === 'DROPPING' || state.mode === 'RETURNING' || state.mode === 'DELIVERING';
    setMotor(moving || mechActive);
  }

  function announce(message, subMessage = '', seconds = 1.35){
    state.message = message;
    state.subMessage = subMessage;
    state.noticeTimer = seconds;
  }

  function spawnParticles(x, y, color, count = 12){
    for (let i = 0; i < count; i++){
      const a = Math.random() * Math.PI * 2;
      const speed = 20 + Math.random() * 45;
      state.particles.push({
        x, y,
        vx: Math.cos(a) * speed,
        vy: Math.sin(a) * speed - 20,
        life: 0.45 + Math.random() * 0.35,
        maxLife: 0.8,
        color
      });
    }
  }

  function startRound(){
    roundActive = true;
    state.mode = 'IDLE';
    state.message = '';
    state.subMessage = '';
    state.noticeTimer = 0;
    unlockCoinSlot(false);
  }

  function endRound(message, subMessage){
    roundActive = false;
    state.mode = 'PAUSE';
    state.vx = 0;
    state.clawClosed = false;
    state.heldPrize = null;
    state.dropLen = 0;
    if (state.score > state.bestScore){
      state.bestScore = state.score;
      writeBestScore(state.score);
      subMessage = `New best: ${state.bestScore}`;
      play('win', 0.55);
      spawnParticles(160, 98, '#fff36d', 28);
    }
    unlockCoinSlot(true);
    showRoundOverlay(message, subMessage);
    updateMotorByState();
  }

  function restartRound(){
    state = makeInitialState();
    closeTimer = 0;
    openTimer = 0;
    roundActive = false;
    unlockCoinSlot(false);
    updateMotorByState();
  }

  function canMove(){
    return state.mode === 'READY' || state.mode === 'IDLE' || state.mode === 'MOVING';
  }

  const CTRL = {
    moveLeft(){
      if (!canMove()) return;
      state.vx = -1;
      if (state.mode === 'IDLE' || state.mode === 'READY') state.mode = 'MOVING';
      updateMotorByState();
    },
    moveRight(){
      if (!canMove()) return;
      state.vx = 1;
      if (state.mode === 'IDLE' || state.mode === 'READY') state.mode = 'MOVING';
      updateMotorByState();
    },
    stopMove(){
      state.vx = 0;
      if (state.mode === 'MOVING') state.mode = roundActive ? 'IDLE' : 'READY';
      updateMotorByState();
    },
    drop(){
      if (!(state.mode === 'READY' || state.mode === 'IDLE' || state.mode === 'MOVING')) return;
      if (!roundActive) startRound();
      state.mode = 'DROPPING';
      state.vx = 0;
      state.clawClosed = false;
      state.targetY = chooseDropDepth();
      state.drops += 1;
      play('ui_click', 0.55);
      play('claw_open_sfx', 0.45);
      updateMotorByState();
    },
    restartRound
  };
  window.GAME = CTRL;

  function chooseDropDepth(){
    const reachable = state.prizes
      .filter(p => !p.grabbed && !p.collected)
      .map(p => ({ p, dx: Math.abs((p.x + p.width / 2) - state.carriageX) }))
      .filter(hit => hit.dx < cfg.grip.grabRadius + 18)
      .sort((a, b) => a.dx - b.dx);

    if (!reachable.length) return cfg.drop.maxDropLen;
    const prize = reachable[0].p;
    return clamp(prize.y - 44, 72, cfg.drop.maxDropLen);
  }

  function tryGrabPrize(){
    let target = null;
    let bestScore = -Infinity;
    for (const prize of state.prizes){
      if (prize.grabbed || prize.collected) continue;
      const centerX = prize.x + prize.width / 2;
      const centerY = prize.y + prize.height / 2;
      const clawX = state.carriageX;
      const clawY = 44 + state.dropLen;
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

    if (!target || bestScore < 0.45){
      state.shake = 0.18;
      play('fail', 0.35);
      announce('MISSED', 'Line up the claw over a prize', 0.8);
      return;
    }

    target.grabbed = true;
    state.heldPrize = target;
    play('claw_close_sfx', 0.58);
    spawnParticles(target.x + target.width / 2, target.y + target.height / 2, '#f9f4d8', 10);
  }

  function deliverPrize(){
    if (!state.heldPrize) return;
    const prize = state.heldPrize;
    prize.collected = true;
    prize.grabbed = false;
    prize.x = cfg.chute.x + 6;
    prize.y = cfg.chute.y - 8;
    state.heldPrize = null;
    state.catches += 1;
    state.combo += 1;

    const timeBonus = Math.max(0, Math.ceil(state.timeLeft * 2));
    const comboBonus = Math.max(0, (state.combo - 1) * 40);
    const points = prize.value + timeBonus + comboBonus;
    state.score += points;
    state.bestScore = Math.max(state.bestScore, state.score);
    state.flash = 0.35;
    play('prize_drop', 0.55);
    if (state.combo > 1) play('win', 0.35);
    announce(`+${points}`, `${prize.type}${state.combo > 1 ? ` combo x${state.combo}` : ''}`, 1.05);
    spawnParticles(cfg.chute.x + 18, cfg.chute.y - 6, '#fff36d', 18);

    if (state.prizes.every(p => p.collected)){
      state.prizes = makePrizeField();
      announce('RESTOCKED', 'Fresh prizes loaded', 1.1);
    }
  }

  function dropHeldPrize(){
    if (!state.heldPrize) return;
    const prize = state.heldPrize;
    prize.grabbed = false;
    prize.x = clamp(state.carriageX - prize.width / 2, 16, BASE_W - prize.width - 12);
    prize.y = clamp(164 + Math.random() * 24, 150, 190);
    prize.baseY = prize.y;
    state.heldPrize = null;
    state.combo = 0;
    state.shake = 0.2;
    play('glass_bonk', 0.4);
    announce('DROPPED', 'Keep it steady to the chute', 0.9);
  }

  function updateParticles(dt){
    for (const p of state.particles){
      p.life -= dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 95 * dt;
    }
    state.particles = state.particles.filter(p => p.life > 0);
  }

  function updateHeldPrize(dt){
    if (!state.heldPrize) return;
    const p = state.heldPrize;
    const sway = Math.sin(performance.now() / 120) * cfg.speeds.carriedSway;
    p.x = state.carriageX - p.width / 2 + sway;
    p.y = 52 + state.dropLen;

    if (state.mode === 'DELIVERING' && state.dropLen < 10 && state.carriageX < cfg.chute.x - 12){
      const distance = cfg.chute.x - state.carriageX;
      const slipChance = clamp((distance - 28) / 220, 0, 0.0028) * dt * 60;
      if (Math.random() < slipChance) dropHeldPrize();
    }
  }

  function updateRound(dt){
    if (roundActive && !['PAUSE', 'READY'].includes(state.mode)){
      state.timeLeft = Math.max(0, state.timeLeft - dt);
      if (state.timeLeft <= 0 && state.mode !== 'DROPPING' && state.mode !== 'RETURNING' && state.mode !== 'DELIVERING'){
        endRound('Time!', state.score ? `Final score: ${state.score}` : 'No prizes this run.');
      }
    }

    if (state.noticeTimer > 0){
      state.noticeTimer = Math.max(0, state.noticeTimer - dt);
      if (state.noticeTimer === 0 && state.mode !== 'PAUSE'){
        state.message = '';
        state.subMessage = '';
      }
    }

    state.shake = Math.max(0, state.shake - dt);
    state.flash = Math.max(0, state.flash - dt);
    updateParticles(dt);
  }

  function step(t){
    const dt = Math.min(0.05, (t - last) / 1000);
    last = t;
    updateRound(dt);

    if (state.mode === 'READY' || state.mode === 'IDLE' || state.mode === 'MOVING'){
      state.carriageX += state.vx * cfg.speeds.move * dt;
      state.carriageX = clamp(state.carriageX, cfg.bounds.left, cfg.bounds.right);
    }

    if (state.mode === 'DROPPING'){
      state.dropLen += cfg.speeds.descend * dt;
      if (state.dropLen >= state.targetY){
        state.dropLen = state.targetY;
        state.mode = 'CLOSING';
        state.clawClosed = true;
        closeTimer = cfg.drop.closeDelayMs / 1000;
        tryGrabPrize();
        updateMotorByState();
      }
    } else if (state.mode === 'CLOSING'){
      closeTimer -= dt;
      if (closeTimer <= 0){
        state.mode = 'RETURNING';
        updateMotorByState();
      }
    } else if (state.mode === 'RETURNING'){
      state.dropLen -= cfg.speeds.return * dt;
      if (state.dropLen <= 0){
        state.dropLen = 0;
        if (state.heldPrize){
          state.mode = 'DELIVERING';
          state.clawClosed = true;
        } else {
          state.clawClosed = false;
          state.mode = state.timeLeft <= 0 ? 'PAUSE' : 'IDLE';
          if (state.timeLeft <= 0) endRound('Time!', state.score ? `Final score: ${state.score}` : 'No prizes this run.');
          updateMotorByState();
        }
      }
    } else if (state.mode === 'DELIVERING'){
      const dir = Math.sign(cfg.chute.x - state.carriageX);
      state.carriageX += dir * cfg.speeds.return * dt;
      if (Math.abs(cfg.chute.x - state.carriageX) < 3){
        state.carriageX = cfg.chute.x;
        state.mode = 'OPENING';
        state.clawClosed = false;
        openTimer = cfg.drop.openDelayMs / 1000;
        deliverPrize();
        updateMotorByState();
      }
    } else if (state.mode === 'OPENING'){
      openTimer -= dt;
      if (openTimer <= 0){
        state.mode = state.timeLeft <= 0 ? 'PAUSE' : 'IDLE';
        if (state.timeLeft <= 0) endRound('Time!', state.score ? `Final score: ${state.score}` : 'No prizes this run.');
      }
    }

    updateHeldPrize(dt);
    renderer.draw(state);
    requestAnimationFrame(step);
  }

  const label = document.createElement('div');
  Object.assign(label.style, {
    position:'absolute', inset:'0', display:'grid', placeItems:'center',
    fontFamily:'monospace', fontSize:'12px', color:'#fff', textShadow:'1px 1px 0 #000',
    textAlign:'center', padding:'8px'
  });
  label.textContent = 'Loading... 0%';
  stage.style.position='relative';
  stage.appendChild(label);
  const progress = (p)=>{ label.textContent = `Loading... ${Math.round(p*100)}%`; if (p>=1) label.remove(); };

  let unlocked = false;
  function unlockOnce(){
    if (unlocked) return;
    unlocked = true;
    const click = loader.snd('ui_click');
    if (click) AudioBus.play(click, { volume: 0.01 });
    ['pointerdown','touchstart','keydown'].forEach(ev=>window.removeEventListener(ev, unlockOnce, true));
  }
  ['pointerdown','touchstart','keydown'].forEach(ev=>window.addEventListener(ev, unlockOnce, { capture:true }));

  document.addEventListener('visibilitychange', ()=>{
    if (document.hidden) setMotor(false);
    else updateMotorByState();
  });

  window.addEventListener('keydown', (e)=>{
    if (e.repeat) return;
    if (e.key === 'ArrowLeft' || e.key.toLowerCase() === 'a'){
      e.preventDefault();
      CTRL.moveLeft();
    } else if (e.key === 'ArrowRight' || e.key.toLowerCase() === 'd'){
      e.preventDefault();
      CTRL.moveRight();
    } else if (e.key === ' ' || e.key === 'Enter' || e.key.toLowerCase() === 's'){
      e.preventDefault();
      CTRL.drop();
    }
  });

  window.addEventListener('keyup', (e)=>{
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight' || e.key.toLowerCase() === 'a' || e.key.toLowerCase() === 'd'){
      e.preventDefault();
      CTRL.stopMove();
    }
  });

  const slotEl = document.getElementById('play-slot');
  const slotHotspot = slotEl?.querySelector('.console-coin-slot__hotspot');
  const slotBadge = slotEl?.querySelector('.console-coin-slot__badge');
  let coinEnabled = false;

  function unlockCoinSlot(enable){
    coinEnabled = !!enable;
    if (!slotEl) return;
    slotEl.classList.toggle('disabled', !coinEnabled);
    slotEl.setAttribute('aria-disabled', String(!coinEnabled));
    slotEl.title = coinEnabled ? 'Insert coin to play again' : 'Finish the round to unlock replay';
    if (slotBadge) slotBadge.textContent = coinEnabled ? 'PLAY AGAIN' : 'LOCKED';
  }

  function spawnFallingCoinAtSlot(){
    if (!slotEl || !slotHotspot || !coinEnabled) return;
    coinEnabled = false;
    const rSlot = slotEl.getBoundingClientRect();
    const rMouth = slotHotspot.getBoundingClientRect();
    const coin = document.createElement('div');
    coin.className = 'coin coin--into';
    const startTop = rSlot.top - 56;
    const startLeft = rMouth.left + rMouth.width / 2 - 24;
    const dropY = (rMouth.top - startTop) + 'px';

    Object.assign(coin.style, {
      position:'fixed',
      top: startTop + 'px',
      left: startLeft + 'px'
    });
    coin.style.setProperty('--dropY', dropY);
    document.body.appendChild(coin);

    setTimeout(()=> play('clink', 0.6), 650);
    setTimeout(()=>{
      try { coin.remove(); } catch {}
      if (overlayEl) { try { overlayEl.remove(); } catch {} }
      restartRound();
    }, 920);
  }

  slotEl?.addEventListener('pointerdown', (e)=>{
    if (!coinEnabled) return;
    e.preventDefault();
    spawnFallingCoinAtSlot();
  }, { passive:false });

  let overlayEl = null;
  function showRoundOverlay(title, body){
    if (overlayEl) overlayEl.remove();
    overlayEl = document.createElement('div');
    overlayEl.className = 'arcade-overlay';
    overlayEl.innerHTML = `
      <div class="arcade-card">
        <h2>${title}</h2>
        <p>${body}</p>
        <p class="arcade-card__meta">Score ${state.score} · Catches ${state.catches} · Best ${state.bestScore}</p>
        <p><em>Drop a coin in the slot to play again.</em></p>
      </div>
    `;
    document.body.appendChild(overlayEl);
  }

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

    try { await loader.loadAll(progress); }
    catch(e) { console.error('[loader] unexpected error', e); }

    onResize();
    unlockCoinSlot(false);
    requestAnimationFrame((t)=>{ last = t; step(t); });
  }

  init();
})();
