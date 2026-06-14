// scripts/game.js
import { Loader } from './loader.js';
import { Renderer } from './renderer.js';
import { AudioBus } from './audio.js';

(function(){
  const stage = document.getElementById('stage');
  const status = document.getElementById('arcade-status');
  const coinSlot = document.getElementById('coin-slot');
  const frame = document.getElementById('arcade-frame');
  const dropButton = document.getElementById('btn-drop');
  if (!stage) return;

  const BASE_W = 2560;
  const BASE_H = 1440;
  const PRIZE_TYPES = [
    { spriteId: 'prize_star', name: 'Star', value: 140, width: 96, height: 96, grip: 0.9 },
    { spriteId: 'prize_duck', name: 'Duck', value: 110, width: 116, height: 86, grip: 0.82 },
    { spriteId: 'prize_box', name: 'Mystery Box', value: 220, width: 88, height: 88, grip: 0.68 }
  ];

  const canvas = document.createElement('canvas');
  canvas.id = 'game-canvas';
  canvas.setAttribute('aria-hidden', 'true');
  stage.innerHTML = '';
  stage.appendChild(canvas);

  const loader = Loader;
  loader.setVersion?.(Date.now());
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

  function setStatus(text, done = false){
    if (!status) return;
    status.textContent = text;
    status.classList.toggle('is-done', done);
  }

  function setCoinReady(ready){
    coinReady = !!ready;
    if (!coinSlot) return;
    coinSlot.disabled = !coinReady;
    coinSlot.setAttribute('aria-disabled', String(!coinReady));
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
    const positions = [
      [430, 1004],
      [760, 1020],
      [1080, 1008],
      [1510, 1018],
      [1780, 1006],
      [2030, 1022]
    ];
    return positions.map(([x, y], index) => {
      const type = PRIZE_TYPES[index % PRIZE_TYPES.length];
      return makePrize(index, type, x, y);
    });
  }

  function makeInitialState(){
    return {
      width: BASE_W,
      height: BASE_H,
      carriageX: 1213,
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
      particles: []
    };
  }

  let state = makeInitialState();
  let closeTimer = 0;
  let openTimer = 0;
  let last = performance.now();
  let motorOn = false;
  let finished = false;
  let coinReady = false;

  function onResize(){
    renderer.resizeTo();
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
      try { AudioBus.loop ? AudioBus.loop(motor, { volume: 0.18 }) : motor.play(); } catch {}
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
    dropButton?.classList.toggle('is-pressed', !!pressed);
    dropButton?.setAttribute('aria-pressed', String(!!pressed));
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
    state = makeInitialState();
    closeTimer = 0;
    openTimer = 0;
    finished = false;
    setCoinReady(false);
    setStatus('');
    setDropButtonPressed(false);
    updateMotorByState();
  }

  function animateCoinDrop(){
    if (!frame) return;
    const coin = document.createElement('span');
    coin.className = 'arcade-coin';
    coin.setAttribute('aria-hidden', 'true');
    frame.appendChild(coin);
    window.setTimeout(() => {
      try { coin.remove(); } catch {}
    }, 900);
  }

  function insertCoin(){
    if (!coinReady) return;
    setCoinReady(false);
    setStatus('');
    animateCoinDrop();
    play('clink', 0.62);
    window.setTimeout(resetAttempt, 760);
  }

  function spawnParticles(x, y, color, count = 12){
    for (let i = 0; i < count; i++){
      const a = Math.random() * Math.PI * 2;
      const speed = 80 + Math.random() * 130;
      state.particles.push({
        x, y,
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
    },
    moveRight(){
      if (!canMove()) return;
      state.vx = 1;
      state.mode = 'MOVING';
      state.message = '';
      state.subMessage = '';
      setStatus('');
      updateMotorByState();
    },
    stopMove(){
      state.vx = 0;
      if (state.mode === 'MOVING') state.mode = 'READY';
      updateMotorByState();
    },
    drop(){
      if (finished || !(state.mode === 'READY' || state.mode === 'MOVING')) return;
      state.mode = 'DROPPING';
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
      updateMotorByState();
    },
    insertCoin
  };
  window.GAME = CTRL;

  function chooseDropDepth(){
    const reachable = state.prizes
      .filter(p => !p.grabbed && !p.collected)
      .map(p => ({ p, dx: Math.abs((p.x + p.width / 2) - state.carriageX) }))
      .filter(hit => hit.dx < cfg.grip.grabRadius + 42)
      .sort((a, b) => a.dx - b.dx);

    if (!reachable.length) return cfg.drop.maxDropLen;
    const prize = reachable[0].p;
    return clamp(prize.y - 642, 170, cfg.drop.maxDropLen);
  }

  function tryGrabPrize(){
    let target = null;
    let bestScore = -Infinity;
    for (const prize of state.prizes){
      if (prize.grabbed || prize.collected) continue;
      const centerX = prize.x + prize.width / 2;
      const centerY = prize.y + prize.height / 2;
      const clawX = state.carriageX;
      const clawY = 650 + state.dropLen;
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
    prize.showCollected = true;
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
    for (const p of state.particles){
      p.life -= dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 220 * dt;
    }
    state.particles = state.particles.filter(p => p.life > 0);
  }

  function updateHeldPrize(){
    if (!state.heldPrize) return;
    const p = state.heldPrize;
    const sway = Math.sin(performance.now() / 120) * cfg.speeds.carriedSway;
    p.x = state.carriageX - p.width / 2 + sway;
    p.y = 760 + state.dropLen;
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

  function step(t){
    const dt = Math.min(0.05, (t - last) / 1000);
    last = t;
    updateTimers(dt);

    if (canMove()){
      state.carriageX += state.vx * cfg.speeds.move * dt;
      state.carriageX = clamp(state.carriageX, cfg.bounds.left, cfg.bounds.right);
    }

    if (state.mode === 'DROPPING'){
      state.dropLen += cfg.speeds.descend * dt;
      if (state.dropLen >= state.targetY){
        state.dropLen = state.targetY;
        state.mode = 'CLOSING';
        closeTimer = cfg.drop.closeDelayMs / 1000;
        state.clawClosed = false;
        state.clawGrip = 0;
        state.grabResolved = false;
        updateMotorByState();
      }
    } else if (state.mode === 'CLOSING'){
      closeTimer -= dt;
      const closeDuration = cfg.drop.closeDelayMs / 1000;
      const closeProgress = clamp(1 - closeTimer / closeDuration, 0, 1);
      state.clawGrip = closeProgress;
      state.clawClosed = closeProgress >= 0.82;
      if (!state.grabResolved && closeProgress >= 0.72){
        state.grabResolved = true;
        tryGrabPrize();
      }
      if (closeTimer <= 0){
        state.mode = 'RETURNING';
        state.clawGrip = 1;
        state.clawClosed = true;
        setDropButtonPressed(false);
        setStatus('');
        updateMotorByState();
      }
    } else if (state.mode === 'RETURNING'){
      state.dropLen -= cfg.speeds.return * dt;
      if (state.dropLen <= 0){
        state.dropLen = 0;
        if (state.heldPrize){
          state.mode = 'DELIVERING';
          state.clawClosed = true;
          state.clawGrip = 1;
          setStatus('GOT IT');
        } else {
          finishAttempt('MISSED', 'INSERT COIN TO RETRY');
        }
        updateMotorByState();
      }
    } else if (state.mode === 'DELIVERING'){
      const dir = Math.sign(cfg.chute.x - state.carriageX);
      state.carriageX += dir * cfg.speeds.return * dt;
      if (Math.abs(cfg.chute.x - state.carriageX) < 4){
        state.carriageX = cfg.chute.x;
        state.mode = 'OPENING';
        state.clawClosed = true;
        state.clawGrip = 1;
        state.prizeDelivered = false;
        openTimer = cfg.drop.openDelayMs / 1000;
        updateMotorByState();
      }
    } else if (state.mode === 'OPENING'){
      openTimer -= dt;
      const openDuration = cfg.drop.openDelayMs / 1000;
      const openProgress = clamp(1 - openTimer / openDuration, 0, 1);
      state.clawGrip = 1 - openProgress;
      state.clawClosed = state.clawGrip > 0.2;
      if (!state.prizeDelivered && openProgress >= 0.45){
        state.prizeDelivered = true;
        deliverPrize();
      }
      if (openTimer <= 0){
        state.clawGrip = 0;
        state.clawClosed = false;
        finishAttempt('GOT IT', 'NICE GRAB');
      }
    }

    updateHeldPrize();
    updateDropButtonByState();
    renderer.draw(state);
    requestAnimationFrame(step);
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
  stage.style.position='absolute';
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
    ['pointerdown','touchstart','keydown'].forEach(ev=>window.removeEventListener(ev, unlockOnce, true));
  }
  ['pointerdown','touchstart','keydown'].forEach(ev=>window.addEventListener(ev, unlockOnce, { capture:true }));

  coinSlot?.addEventListener('pointerdown', (event) => {
    if (!coinReady) return;
    event.preventDefault();
    insertCoin();
  }, { passive:false });

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
      if (coinReady) {
        insertCoin();
        return;
      }
      const button = document.getElementById('btn-drop');
      button?.classList.add('is-pressed');
      CTRL.drop();
    }
  });

  window.addEventListener('keyup', (e)=>{
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight' || e.key.toLowerCase() === 'a' || e.key.toLowerCase() === 'd'){
      e.preventDefault();
      CTRL.stopMove();
    }
  });

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
    setStatus('');
    setCoinReady(false);
    requestAnimationFrame((t)=>{ last = t; step(t); });
  }

  init();
})();
