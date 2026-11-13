import { CLAW_GEOMETRY } from './claw-geometry.js';

/** @typedef {{ spriteId: string, x: number, y: number, width: number, height: number, rotation?: number, wobble: number }} RenderPrize */
/** @typedef {{ x: number, y: number, life: number, maxLife: number, color: string, size?: number }} RenderParticle */
/** @typedef {{ carriageX: number, dropLen: number, clawClosed: boolean, clawGrip?: number, heldPrize: RenderPrize | null, now: number, particles: RenderParticle[], flash: number, message: string, subMessage: string, mode: string, width: number, height: number }} RenderState */
/** @typedef {{ id: string, width: number, height: number, anchorX: number }} ClawSprite */

export class Renderer {
  /** @param {HTMLCanvasElement} canvas @param {{ img: (id: string) => HTMLImageElement | undefined }} loader */
  constructor(canvas, loader) {
    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) throw new Error('Canvas 2D rendering is unavailable');
    this.canvas = canvas;
    this.ctx = ctx;
    this.loader = loader;
    this.baseW = CLAW_GEOMETRY.BASE_W;
    this.baseH = CLAW_GEOMETRY.BASE_H;
    this.scaleX = 1;
    this.scaleY = 1;
    this.ctx.imageSmoothingEnabled = true;
  }

  resizeTo() {
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
  }

  /** @param {number} x @param {number} y @param {number} w @param {number} h @param {string} color */
  rect(x, y, w, h, color) {
    this.ctx.fillStyle = color;
    this.ctx.fillRect(
      Math.round(x),
      Math.round(y),
      Math.round(w),
      Math.round(h),
    );
  }

  /** @param {CanvasRenderingContext2D} ctx @param {RenderPrize} prize @param {number} alpha @param {number} bob @param {number} rotation */
  drawPrizeToContext(
    ctx,
    prize,
    alpha = 1,
    bob = 0,
    rotation = prize.rotation || 0,
  ) {
    const img = this.loader.img(prize.spriteId);
    if (!img || alpha <= 0) return;
    ctx.save();
    ctx.globalAlpha *= alpha;
    ctx.translate(
      Math.round(prize.x + prize.width / 2),
      Math.round(prize.y + prize.height / 2 + bob),
    );
    ctx.rotate(rotation);
    ctx.drawImage(
      img,
      Math.round(-prize.width / 2),
      Math.round(-prize.height / 2),
      Math.round(prize.width),
      Math.round(prize.height),
    );
    ctx.restore();
  }

  /** @param {RenderState} state */
  drawHeldPrize(state) {
    const prize = state.heldPrize;
    if (!prize) return;
    const now = state.now || performance.now();
    const bob = Math.sin(now / 130 + prize.wobble) * 4;
    const rotation = Math.sin(now / 180 + prize.wobble) * 0.08;
    this.drawPrizeToContext(this.ctx, prize, 0.96, bob, rotation);
  }

  /** @param {number} x @param {number} drop */
  drawRod(x, drop) {
    const top =
      CLAW_GEOMETRY.TOP_Y +
      CLAW_GEOMETRY.HEAD_CUT_Y -
      CLAW_GEOMETRY.ROD_TOP_OVERLAP;
    const bodyTop = CLAW_GEOMETRY.TOP_Y + CLAW_GEOMETRY.BODY_CUT_Y + drop;
    const h = Math.max(1, bodyTop + CLAW_GEOMETRY.ROD_BODY_OVERLAP - top);
    const left = x - CLAW_GEOMETRY.ROD_WIDTH / 2;
    this.ctx.save();
    this.ctx.shadowColor = 'rgba(0,0,0,.38)';
    this.ctx.shadowBlur = 2;
    this.ctx.fillStyle = 'rgba(52,54,50,.86)';
    this.ctx.fillRect(Math.round(left - 1), Math.round(top), 2, Math.round(h));
    this.ctx.fillStyle = 'rgba(178,181,170,.96)';
    this.ctx.fillRect(Math.round(left + 1), Math.round(top), 5, Math.round(h));
    this.ctx.fillStyle = 'rgba(246,246,230,.74)';
    this.ctx.fillRect(
      Math.round(x - 1),
      Math.round(top + 2),
      2,
      Math.max(1, Math.round(h - 5)),
    );
    this.ctx.fillStyle = 'rgba(62,64,60,.72)';
    this.ctx.fillRect(Math.round(left + 6), Math.round(top), 2, Math.round(h));
    this.ctx.restore();
  }

  /** @param {ClawSprite} meta @param {number} gripAlpha @param {number} x @param {number} drop */
  drawClawSlice(meta, gripAlpha, x, drop) {
    if (gripAlpha <= 0) return;
    const img = this.loader.img(meta.id);
    if (!img) return;
    const dx = Math.round(x - meta.anchorX);
    const topY = CLAW_GEOMETRY.TOP_Y;
    const bodyCut = CLAW_GEOMETRY.BODY_CUT_Y;
    const bodyH = meta.height - bodyCut;
    this.ctx.save();
    this.ctx.globalAlpha *= gripAlpha;
    // Draw from the original image. Hidden canvas copies can lose their backing
    // stores on mobile, leaving a rod with no claw until the page is reloaded.
    this.ctx.drawImage(
      img,
      0,
      0,
      meta.width,
      CLAW_GEOMETRY.HEAD_CUT_Y,
      dx,
      topY,
      meta.width,
      CLAW_GEOMETRY.HEAD_CUT_Y,
    );
    this.ctx.drawImage(
      img,
      0,
      bodyCut,
      meta.width,
      bodyH,
      dx,
      Math.round(topY + bodyCut + drop),
      meta.width,
      bodyH,
    );
    this.ctx.restore();
  }

  /** @param {RenderState} state */
  drawClaw(state) {
    const drop = Math.max(0, state.dropLen || 0);
    const grip = Math.max(
      0,
      Math.min(1, state.clawGrip ?? (state.clawClosed ? 1 : 0)),
    );
    this.drawRod(state.carriageX, drop);
    this.drawClawSlice(CLAW_GEOMETRY.OPEN, 1 - grip, state.carriageX, drop);
    this.drawClawSlice(CLAW_GEOMETRY.CLOSED, grip, state.carriageX, drop);
  }

  /** @param {RenderState} state */
  drawParticles(state) {
    for (const p of state.particles || []) {
      const alpha = Math.max(0, Math.min(1, p.life / p.maxLife));
      const color = p.color.replace(')', `,${alpha})`).replace('rgb', 'rgba');
      this.rect(p.x, p.y, p.size || 6, p.size || 6, color);
    }
  }

  /** @param {string} value @param {number} x @param {number} y @param {{ size?: number, align?: CanvasTextAlign, color?: string, shadow?: string | null, weight?: string }} opts */
  text(value, x, y, opts = {}) {
    const size = opts.size ?? 42;
    this.ctx.save();
    this.ctx.font = `${opts.weight ?? '900'} ${size}px "Courier New", monospace`;
    this.ctx.textAlign = opts.align ?? 'center';
    this.ctx.textBaseline = 'middle';
    const shadow = opts.shadow ?? '#000';
    if (shadow) {
      this.ctx.fillStyle = shadow;
      this.ctx.fillText(String(value), Math.round(x + 4), Math.round(y + 4));
    }
    this.ctx.fillStyle = opts.color ?? '#f20b06';
    this.ctx.fillText(String(value), Math.round(x), Math.round(y));
    this.ctx.restore();
  }

  /** @param {RenderState} state */
  drawMessage(state) {
    if (!state.message || state.mode !== 'DONE') return;
    const y = 630;
    this.ctx.save();
    this.ctx.globalAlpha = 0.92;
    this.rect(980, y - 72, 600, state.subMessage ? 132 : 86, 'rgba(0,0,0,.72)');
    this.ctx.restore();
    this.text(state.message, 1280, y - 18, { size: 64, color: '#f20b06' });
    if (state.subMessage)
      this.text(state.subMessage, 1280, y + 42, {
        size: 30,
        color: '#f8f4df',
        weight: '700',
      });
  }

  /** @param {RenderState} state */
  draw(state) {
    if (this.ctx.isContextLost?.()) return;
    // Invalidate the complete moving layer, including the previous sprite's
    // pixels. The static cabinet remains in the DOM and is not redrawn here.
    this.ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.ctx.globalAlpha = 1;
    this.ctx.globalCompositeOperation = 'source-over';
    this.ctx.setTransform(this.scaleX, 0, 0, this.scaleY, 0, 0);
    this.drawHeldPrize(state);
    this.drawClaw(state);
    this.drawParticles(state);
    if (state.flash > 0) {
      this.ctx.save();
      this.ctx.globalAlpha = Math.min(0.16, state.flash * 0.28);
      this.rect(0, 0, this.baseW, this.baseH, 'rgb(255,243,109)');
      this.ctx.restore();
    }
    this.drawMessage(state);
    this.ctx.setTransform(1, 0, 0, 1, 0, 0);
  }
}
