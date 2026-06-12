export class Renderer {
  constructor(canvas, loader){
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.loader = loader;
    this.baseW = 2560;
    this.baseH = 1440;
    this.scale = 1;
    this.ctx.imageSmoothingEnabled = true;
  }

  resizeTo(){
    this.canvas.width = this.baseW;
    this.canvas.height = this.baseH;
    this.canvas.style.width = '100%';
    this.canvas.style.height = '100%';
    this.ctx.imageSmoothingEnabled = true;
  }

  clear(){
    this.ctx.clearRect(0, 0, this.baseW, this.baseH);
  }

  drawImage(img, dx, dy, dw, dh){
    if (!img) return;
    const w = dw ?? img.width;
    const h = dh ?? img.height;
    this.ctx.drawImage(img, Math.round(dx), Math.round(dy), Math.round(w), Math.round(h));
  }

  drawImageAlpha(img, dx, dy, dw, dh, alpha = 1){
    if (!img) return;
    this.ctx.save();
    this.ctx.globalAlpha = alpha;
    this.drawImage(img, dx, dy, dw, dh);
    this.ctx.restore();
  }

  rect(x, y, w, h, color){
    this.ctx.fillStyle = color;
    this.ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
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

  drawPrizeIcon(prize, alpha = 1){
    if (prize.collected && !prize.showCollected) return;
    const img = this.loader.img(prize.spriteId);
    const bob = prize.grabbed ? 0 : Math.sin(performance.now() / 420 + prize.wobble) * 5;
    this.drawImageAlpha(img, prize.x, prize.y + bob, prize.width, prize.height, alpha);
  }

  drawPrizes(state){
    if (state.heldPrize) this.drawPrizeIcon(state.heldPrize, 0.82);
  }

  drawParticles(state){
    for (const p of state.particles || []){
      const alpha = Math.max(0, p.life / p.maxLife);
      this.rect(p.x, p.y, p.size || 6, p.size || 6, p.color.replace(')', `,${alpha})`).replace('rgb', 'rgba'));
    }
  }

  drawClaw(state){
    const x = state.carriageX;
    const drop = state.dropLen;
    const topY = 351 + drop;
    const armY = 380 + drop;
    const leftY = 570 + drop;
    const middleY = 575 + drop;
    const rightY = 558 + drop;

    this.ctx.save();
    this.ctx.globalAlpha = 0.9;
    this.ctx.filter = 'brightness(0.96) contrast(1.03)';
    this.drawImage(this.loader.img('cm_claw_arm'), x - 66, armY, 111, 243);
    this.drawImage(this.loader.img('cm_claw_base'), x - 85, topY, 170, 79);

    if (state.clawClosed){
      this.drawImage(this.loader.img('cm_claw_left'), x - 73, leftY + 6, 85, 225);
      this.drawImage(this.loader.img('cm_claw_middle'), x - 24, middleY, 54, 215);
      this.drawImage(this.loader.img('cm_claw_right'), x - 2, rightY + 6, 77, 228);
    } else {
      this.drawImage(this.loader.img('cm_claw_left'), x - 88, leftY, 85, 225);
      this.drawImage(this.loader.img('cm_claw_middle'), x - 24, middleY, 54, 215);
      this.drawImage(this.loader.img('cm_claw_right'), x - 13, rightY, 77, 228);
    }
    this.ctx.restore();
  }

  drawMessage(state){
    if (!state.message || state.mode !== 'DONE') return;
    const y = state.mode === 'READY' || state.mode === 'MOVING' ? 640 : 630;
    this.ctx.save();
    this.ctx.globalAlpha = state.mode === 'DONE' ? 0.92 : 0.72;
    this.rect(980, y - 72, 600, state.subMessage ? 132 : 86, 'rgba(0,0,0,.72)');
    this.ctx.restore();
    this.text(state.message, 1280, y - 18, { size: state.mode === 'DONE' ? 64 : 54, color: '#f20b06' });
    if (state.subMessage){
      this.text(state.subMessage, 1280, y + 42, { size: 30, color: '#f8f4df', weight: '700' });
    }
  }

  draw(state){
    this.clear();
    this.drawPrizes(state);
    this.drawClaw(state);
    this.drawParticles(state);
    if (state.flash > 0){
      this.ctx.save();
      this.ctx.globalAlpha = Math.min(0.16, state.flash * 0.28);
      this.rect(0, 0, this.baseW, this.baseH, 'rgb(255,243,109)');
      this.ctx.restore();
    }
    this.drawMessage(state);
  }
}
