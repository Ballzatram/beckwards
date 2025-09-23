// scripts/game.js
import { Loader } from './loader.js';
import { Renderer } from './renderer.js';
import { AudioBus } from './audio.js';

(function(){
  const stage = document.getElementById('stage');
  if (!stage) return;

  // Canvas
  const canvas = document.createElement('canvas');
  canvas.id = 'game-canvas';
  canvas.style.width = '100%';
  canvas.style.height = '100%';
  stage.innerHTML = '';
  stage.appendChild(canvas);

  const loader = Loader;
  loader.setVersion?.(Date.now()); // dev cache-bust

  // Base geometry/state
  const BASE_W = 320, BASE_H = 240;

  function makeInitialState(){
    return {
      width: BASE_W, height: BASE_H,
      carriageX: 160, vx: 0,
      dropLen: 0, clawClosed: false,
      mode: 'IDLE', // IDLE, MOVING, DROPPING, CLOSING, RETURNING, PAUSE
      heldPrize: null,
      prizes: [
        { spriteId: 'prize_star', x: 40,  y: 160, grabbed:false },
        { spriteId: 'prize_duck', x: 140, y: 170, grabbed:false },
        { spriteId: 'prize_box',  x: 220, y: 164, grabbed:false }
      ]
    };
  }
  let state = makeInitialState();

  const cfg = {
    bounds: { left: 16, right: BASE_W - 16 },
    speeds: { move: 140, return: 220, descend: 180 },
    drop: { maxDropLen: 110, closeDelayMs: 240 },
    grabRadius: 18
  };

  // Renderer + responsive sizing
  const renderer = new Renderer(canvas, loader);
  function onResize(){
    const rect = stage.getBoundingClientRect();
    renderer.resizeTo(rect.width, rect.height);
  }
  window.addEventListener('resize', onResize);

  /* ========== Motor loop: play only when moving/descending/returning ========== */
  let motorOn = false;
  function setMotor(on){
    const motor = loader.snd('motor_loop');
    if (!motor) return;
    if (on && !motorOn){
      motorOn = true;
      try { AudioBus.loop ? AudioBus.loop(motor, { volume: 0.22 }) : motor.play(); } catch {}
    } else if (!on && motorOn){
      motorOn = false;
      try { motor.pause(); motor.currentTime = 0; } catch {}
    }
  }
  function updateMotorByState(){
    const moving = state.vx !== 0;
    const mechActive = (state.mode === 'DROPPING' || state.mode === 'RETURNING');
    setMotor(moving || mechActive);
  }

  /* ========== Controls (wired by arcade.html) ========== */
  const CTRL = {
    moveLeft(){ if (state.mode==='PAUSE') return;
      state.vx = -1; if (state.mode==='IDLE') state.mode='MOVING'; updateMotorByState(); },
    moveRight(){ if (state.mode==='PAUSE') return;
      state.vx =  1; if (state.mode==='IDLE') state.mode='MOVING'; updateMotorByState(); },
    stopMove(){ state.vx = 0; if (state.mode==='MOVING') state.mode='IDLE'; updateMotorByState(); },
    drop(){
      if (state.mode==='IDLE' || state.mode==='MOVING'){
        AudioBus.play(loader.snd('ui_click'), { volume: 0.6 });
        state.mode='DROPPING';
        state.clawClosed = false;
        AudioBus.play(loader.snd('claw_open_sfx'), { volume: 0.5 });
        updateMotorByState();
      }
    }
  };
  window.GAME = CTRL;

  /* ========== Prize grab ========== */
  function tryGrabPrize(){
    let target = null, bestDx = Infinity;
    for (const p of state.prizes){
      if (p.grabbed) continue;
      const dx = Math.abs(p.x - state.carriageX);
      if (dx < cfg.grabRadius && dx < bestDx){ bestDx = dx; target = p; }
    }
    if (target){
      target.grabbed = true;
      state.heldPrize = target;
      target.x = state.carriageX;
      target.y = 52 + state.dropLen;
    }
  }

  /* ========== Loop ========== */
  let last = performance.now();
  function step(t){
    const dt = Math.min(0.05, (t - last)/1000);
    last = t;

    if (state.mode==='IDLE' || state.mode==='MOVING'){
      state.carriageX += state.vx * cfg.speeds.move * dt;
      state.carriageX = Math.max(cfg.bounds.left, Math.min(cfg.bounds.right, state.carriageX));
    }

    if (state.mode==='DROPPING'){
      state.dropLen += cfg.speeds.descend * dt;
      if (state.dropLen >= cfg.drop.maxDropLen){
        state.dropLen = cfg.drop.maxDropLen;
        state.mode='CLOSING';
        state.clawClosed = true;
        AudioBus.play(loader.snd('claw_close_sfx'), { volume: 0.6 });
        tryGrabPrize();
        setTimeout(()=>{ state.mode='RETURNING'; updateMotorByState(); }, cfg.drop.closeDelayMs);
      }
    } else if (state.mode==='RETURNING'){
      state.dropLen -= cfg.speeds.return * dt;
      if (state.dropLen <= 0){
        state.dropLen = 0;
        state.clawClosed = false;
        // resolve round
        if (state.heldPrize){
          AudioBus.play(loader.snd('prize_drop'), { volume: 0.55 });
          state.mode = 'PAUSE';
          unlockCoinSlot(true);
          showRoundOverlay('win');
        } else {
          AudioBus.play(loader.snd('fail') || loader.snd('ui_click'), { volume: 0.4 });
          state.mode = 'PAUSE';
          unlockCoinSlot(true);
          showRoundOverlay('lose');
        }
        updateMotorByState(); // stop motor
      }
    }

    if (state.heldPrize){ // keep held prize aligned to claw
      state.heldPrize.x = state.carriageX;
      state.heldPrize.y = 52 + state.dropLen;
    }

    renderer.draw(state);
    requestAnimationFrame(step);
  }

  /* ========== Loading overlay ========== */
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

  /* ========== Audio unlock ========== */
  let unlocked = false;
  function unlockOnce(){
    if (unlocked) return; unlocked = true;
    const click = loader.snd('ui_click'); if (click) AudioBus.play(click, { volume: 0.01 });
    ['pointerdown','touchstart','keydown'].forEach(ev=>window.removeEventListener(ev, unlockOnce, true));
  }
  ['pointerdown','touchstart','keydown'].forEach(ev=>window.addEventListener(ev, unlockOnce, { capture:true }));

  document.addEventListener('visibilitychange', ()=>{
    if (document.hidden) setMotor(false);
    else updateMotorByState();
  });

  /* ========== Permanent console coin slot (right side) ========== */
  const slotEl = document.getElementById('play-slot');
  const slotHotspot = slotEl?.querySelector('.console-coin-slot__hotspot');
  const slotBadge = slotEl?.querySelector('.console-coin-slot__badge');
  let coinEnabled = false;

  function unlockCoinSlot(enable){
    coinEnabled = !!enable;
    if (!slotEl) return;
    slotEl.classList.toggle('disabled', !coinEnabled);
    slotEl.setAttribute('aria-disabled', String(!coinEnabled));
    if (slotBadge) slotBadge.textContent = coinEnabled ? 'DROP A COIN' : 'INSERT COIN';
  }

  function spawnFallingCoinAtSlot(){
    if (!slotEl || !slotHotspot) return;
    const rSlot = slotEl.getBoundingClientRect();
    const rMouth = slotHotspot.getBoundingClientRect();

    // Place coin just above the slot
    const coin = document.createElement('div');
    coin.className = 'coin coin--into';
    const startTop = rSlot.top - 56; // start a bit above
    const startLeft = rMouth.left + rMouth.width/2 - 24; // center (48px coin)
    const dropY = (rMouth.top - startTop) + 'px';

    Object.assign(coin.style, {
      position:'fixed',
      top: startTop + 'px',
      left: startLeft + 'px'
    });
    coin.style.setProperty('--dropY', dropY);
    document.body.appendChild(coin);

    // Coin clink near the end
    const clink = loader.snd('clink') || loader.snd('ui_click');
    setTimeout(()=>{ if (clink) AudioBus.play(clink, { volume: 0.6 }); }, 700);

    // After animation, restart + relock
    setTimeout(()=>{
      try{ coin.remove(); }catch{}
      if (overlayEl) { try{ overlayEl.remove(); }catch{} }
      restartRound();
    }, 920);
  }

  slotEl?.addEventListener('pointerdown', (e)=>{
    if (!coinEnabled) return;
    e.preventDefault();
    spawnFallingCoinAtSlot();
  }, { passive:false });

  /* ========== Round overlay ========== */
  let overlayEl = null;
  function showRoundOverlay(kind){
    overlayEl = document.createElement('div');
    overlayEl.className = 'arcade-overlay';
    overlayEl.innerHTML = `
      <div class="arcade-card">
        <h2>${kind==='win' ? 'Congrats!' : 'Try again'}</h2>
        <p>${kind==='win' ? 'You snagged a prize.' : 'No luck this time.'}</p>
        <p style="margin-top:8px"><em>Drop a coin in the slot to play again.</em></p>
      </div>
    `;
    document.body.appendChild(overlayEl);
  }

  function restartRound(){
    state = makeInitialState();
    unlockCoinSlot(false); // relock until round ends again
    updateMotorByState();
  }

  /* ========== Init (robust manifest resolution) ========== */
  async function init(){
    const base = window.location.pathname.replace(/[^/]+$/, '');
    const candidates = [
      'assets/data/manifest.json',
      './assets/data/manifest.json',
      base + 'assets/data/manifest.json',
      '/beckwards/assets/data/manifest.json'
    ];
    let ok = false, lastErr;
    for (const url of candidates){
      try { await loader.loadManifest(url); ok = true; break; }
      catch(e){ lastErr = e; }
    }
    if (!ok){ label.innerHTML = 'Error: manifest not found.'; console.error(lastErr); return; }

    try{ await loader.loadAll(progress); }catch(e){ console.error('[loader] unexpected error', e); }

    onResize();
    requestAnimationFrame((t)=>{ last=t; step(t); });

    // Ensure coin starts locked
    unlockCoinSlot(false);
  }

  init();
})();
