import { CLAW_GEOMETRY } from './claw-geometry.js';

export class Renderer {
  constructor(canvas, loader){
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha:true });
    this.loader = loader;
    this.baseW = CLAW_GEOMETRY.BASE_W;
    this.baseH = CLAW_GEOMETRY.BASE_H;
    this.scaleX = 1;
    this.scaleY = 1;
    this.previousBounds = null;
    this.needsFullClear = true;
    this.clawParts = new Map();
    this.ctx.imageSmoothingEnabled = true;
  }

  resizeTo(){
    const rect = this.canvas.getBoundingClientRect();
    const cssW = Math.max(1, rect.width || this.baseW);
    const cssH = Math.max(1, rect.height || this.baseH);
    const dpr = Math.min(window.devicePixelRatio || 1, CLAW_GEOMETRY.DPR_CAP);
    const pixelW = Math.max(1, Math.round(cssW * dpr));
    const pixelH = Math.max(1, Math.round(cssH * dpr));

    if (this.canvas.width !== pixelW) this.canvas.width = pixelW;
    if (this.canvas.height !== pixelH) this.canvas.height = pixelH;
    this.canvas.style.width = '100%';
    this.canvas.style.height = '100%';
    this.scaleX = pixelW / this.baseW;
    this.scaleY = pixelH / this.baseH;
    this.ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.ctx.imageSmoothingEnabled = true;
    this.previousBounds = null;
    this.needsFullClear = true;
  }

  setBaseTransform(){
    this.ctx.setTransform(this.scaleX, 0, 0, this.scaleY, 0, 0);
  }

  clearDeviceRect(bounds){
    this.ctx.save();
    this.ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (this.needsFullClear || !bounds){
      this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
      this.needsFullClear = false;
    } else {
      const x = Math.floor(bounds.x * this.scaleX);
      const y = Math.floor(bounds.y * this.scaleY);
      const w = Math.ceil(bounds.w * this.scaleX);
      const h = Math.ceil(bounds.h * this.scaleY);
      this.ctx.clearRect(x, y, w, h);
    }
    this.ctx.restore();
  }

  rect(x, y, w, h, color){
    this.ctx.fillStyle = color;
    this.ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
  }

  makeSlice(img, sx, sy, sw, sh){
    const canvas = document.createElement('canvas');
    canvas.width = sw;
    canvas.height = sh;
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
    return canvas;
  }

  getClawParts(meta){
    const img = this.loader.img(meta.id);
    if (!img) return null;
    const cacheKey = `${meta.cacheKey}:${img.naturalWidth || img.width}x${img.naturalHeight || img.height}`;
    if (this.clawParts.has(cacheKey)) return this.clawParts.get(cacheKey);

    const head = this.makeSlice(img, 0, 0, meta.width, CLAW_GEOMETRY.HEAD_CUT_Y);
    const bodyH = meta.height - CLAW_GEOMETRY.BODY_CUT_Y;
    const body = this.makeSlice(img, 0, CLAW_GEOMETRY.BODY_CUT_Y, meta.width, bodyH);
    const parts = { head, body, bodyH };
    this.clawParts.set(cacheKey, parts);
    return parts;
  }

  drawPrizeToContext(ctx, prize, alpha = 1, bob = 0, rotation = prize.rotation || 0){
    const img = this.loader.img(prize.spriteId);
    if (!img || alpha <= 0) return;
    ctx.save();
    ctx.globalAlpha *= alpha;
    ctx.translate(Math.round(prize.x + prize.width / 2), Math.round(prize.y + prize.height / 2 + bob));
    ctx.rotate(rotation);
    ctx.drawImage(img, Math.round(-prize.width / 2), Math.round(-prize.height / 2), Math.round(prize.width), Math.round(prize.height));
    ctx.restore();
  }

  drawHeldPrize(state){
    const prize = state.heldPrize;
    if (!prize) return;
    const now = state.now || performance.now();
    const bob = Math.sin(now / 130 + prize.wobble) * 4;
    const rotation = Math.sin(now / 180 + prize.wobble) * 0.08;
    this.drawPrizeToContext(this.ctx, prize, 0.96, bob, rotation);
  }

  drawRod(x, drop){
    const top = CLAW_GEOMETRY.TOP_Y + CLAW_GEOMETRY.HEAD_CUT_Y - CLAW_GEOMETRY.ROD_TOP_OVERLAP;
    const bodyTop = CLAW_GEOMETRY.TOP_Y + CLAW_GEOMETRY.BODY_CUT_Y + drop;
    const bottom = bodyTop + CLAW_GEOMETRY.ROD_BODY_OVERLAP;
    const h = Math.max(1, bottom - top);
    const left = x - CLAW_GEOMETRY.ROD_WIDTH / 2;

    this.ctx.save();
    this.ctx.shadowColor = 'rgba(0,0,0,.38)';
    this.ctx.shadowBlur = 2;
    this.ctx.fillStyle = 'rgba(52,54,50,.86)';
    this.ctx.fillRect(Math.round(left - 1), Math.round(top), 2, Math.round(h));
    this.ctx.fillStyle = 'rgba(178,181,170,.96)';
    this.ctx.fillRect(Math.round(left + 1), Math.round(top), 5, Math.round(h));
    this.ctx.fillStyle = 'rgba(246,246,230,.74)';
    this.ctx.fillRect(Math.round(x - 1), Math.round(top + 2), 2, Math.max(1, Math.round(h - 5)));
    this.ctx.fillStyle = 'rgba(62,64,60,.72)';
    this.ctx.fillRect(Math.round(left + 6), Math.round(top), 2, Math.round(h));
    this.ctx.restore();
  }

  drawClawSlice(meta, gripAlpha, x, drop){
    if (gripAlpha <= 0) return;
    const parts = this.getClawParts(meta);
    if (!parts) return;
    const dx = x - meta.anchorX;
    const topY = CLAW_GEOMETRY.TOP_Y;
    const bodyY = CLAW_GEOMETRY.TOP_Y + CLAW_GEOMETRY.BODY_CUT_Y + drop;

    this.ctx.save();
    this.ctx.globalAlpha *= gripAlpha;
    this.ctx.drawImage(parts.head, Math.round(dx), Math.round(topY));
    this.ctx.drawImage(parts.body, Math.round(dx), Math.round(bodyY));
    this.ctx.restore();
  }

  drawClaw(state){
    const x = state.carriageX;
    const drop = Math.max(0, state.dropLen || 0);
    const grip = Math.max(0, Math.min(1, state.clawGrip ?? (state.clawClosed ? 1 : 0)));

    this.drawRod(x, drop);
    this.drawClawSlice(CLAW_GEOMETRY.OPEN, 1 - grip, x, drop);
    this.drawClawSlice(CLAW_GEOMETRY.CLOSED, grip, x, drop);
  }

  drawParticles(state){
    for (const p of state.particles || []){
      const alpha = Math.max(0, Math.min(1, p.life / p.maxLife));
      const color = p.color.replace(')', `,${alpha})`).replace('rgb', 'rgba');
      this.rect(p.x, p.y, p.size || 6, p.size || 6, color);
    }
  }

  text(value, x, y, opts = {}){
    const size = opts.size ?? 42;
    const align = opts.align ?? 'center';
    const color = opts.color ?? '#f20b06';
    const shadow = opts.shadow ?? '#000';
    const weight = opts.weight ?? '900';
    this.ctx.save();
    this.ctx.font = `${weight} ${size}px "Courier New", monospace`;
    this.ctx.textAlign = align;
    this.ctx.textBaseline = 'middle';
    if (shadow){
      this.ctx.fillStyle = shadow;
      this.ctx.fillText(String(value), Math.round(x + 4), Math.round(y + 4));
    }
    this.ctx.fillStyle = color;
    this.ctx.fillText(String(value), Math.round(x), Math.round(y));
    this.ctx.restore();
  }

  drawMessage(state){
    if (!state.message || state.mode !== 'DONE') return;
    const y = 630;
    this.ctx.save();
    this.ctx.globalAlpha = 0.92;
    this.rect(980, y - 72, 600, state.subMessage ? 132 : 86, 'rgba(0,0,0,.72)');
    this.ctx.restore();
    this.text(state.message, 1280, y - 18, { size:64, color:'#f20b06' });
    if (state.subMessage){
      this.text(state.subMessage, 1280, y + 42, { size:30, color:'#f8f4df', weight:'700' });
    }
  }

  prizeBounds(prize){
    if (!prize) return null;
    return {
      x: prize.x - 20,
      y: prize.y - 20,
      w: prize.width + 40,
      h: prize.height + 40
    };
  }

  clawBounds(state){
    const drop = Math.max(0, state.dropLen || 0);
    const maxWidth = Math.max(CLAW_GEOMETRY.OPEN.width, CLAW_GEOMETRY.CLOSED.width);
    const maxBodyH = Math.max(
      CLAW_GEOMETRY.OPEN.height - CLAW_GEOMETRY.BODY_CUT_Y,
      CLAW_GEOMETRY.CLOSED.height - CLAW_GEOMETRY.BODY_CUT_Y
    );
    return {
      x: state.carriageX - Math.max(CLAW_GEOMETRY.OPEN.anchorX, CLAW_GEOMETRY.CLOSED.anchorX) - 34,
      y: CLAW_GEOMETRY.TOP_Y - 28,
      w: maxWidth + 68,
      h: CLAW_GEOMETRY.BODY_CUT_Y + drop + maxBodyH + 60
    };
  }

  particleBounds(state){
    const particles = state.particles || [];
    if (!particles.length) return null;
    let left = Infinity;
    let top = Infinity;
    let right = -Infinity;
    let bottom = -Infinity;
    for (const p of particles){
      const size = p.size || 6;
      left = Math.min(left, p.x - 10);
      top = Math.min(top, p.y - 10);
      right = Math.max(right, p.x + size + 10);
      bottom = Math.max(bottom, p.y + size + 10);
    }
    return { x:left, y:top, w:right - left, h:bottom - top };
  }

  messageBounds(state){
    if (!state.message || state.mode !== 'DONE') return null;
    return { x:940, y:540, w:680, h:180 };
  }

  unionBounds(bounds){
    const valid = bounds.filter(Boolean);
    if (!valid.length) return null;
    let left = Infinity;
    let top = Infinity;
    let right = -Infinity;
    let bottom = -Infinity;
    for (const b of valid){
      left = Math.min(left, b.x);
      top = Math.min(top, b.y);
      right = Math.max(right, b.x + b.w);
      bottom = Math.max(bottom, b.y + b.h);
    }
    const pad = 28;
    left = Math.max(0, Math.floor(left - pad));
    top = Math.max(0, Math.floor(top - pad));
    right = Math.min(this.baseW, Math.ceil(right + pad));
    bottom = Math.min(this.baseH, Math.ceil(bottom + pad));
    return { x:left, y:top, w:right - left, h:bottom - top };
  }

  currentBounds(state){
    if (state.flash > 0) return { x:0, y:0, w:this.baseW, h:this.baseH };
    return this.unionBounds([
      this.clawBounds(state),
      this.prizeBounds(state.heldPrize),
      this.particleBounds(state),
      this.messageBounds(state)
    ]);
  }

  draw(state){
    const nextBounds = this.currentBounds(state);
    const dirtyBounds = this.unionBounds([this.previousBounds, nextBounds]);
    this.clearDeviceRect(dirtyBounds);
    this.setBaseTransform();
    this.drawHeldPrize(state);
    this.drawClaw(state);
    this.drawParticles(state);
    if (state.flash > 0){
      this.ctx.save();
      this.ctx.globalAlpha = Math.min(0.16, state.flash * 0.28);
      this.rect(0, 0, this.baseW, this.baseH, 'rgb(255,243,109)');
      this.ctx.restore();
    }
    this.drawMessage(state);
    this.ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.previousBounds = nextBounds;
  }
}
