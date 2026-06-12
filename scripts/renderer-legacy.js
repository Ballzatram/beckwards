// scripts/renderer.js
export class Renderer {
  constructor(canvas, loader){
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.loader = loader;
    this.scale = 1;
    this.baseW = 320;
    this.baseH = 240;
    this.crisp();
  }

  crisp(){
    this.ctx.imageSmoothingEnabled = false;
    this.ctx.webkitImageSmoothingEnabled = false;
    this.ctx.mozImageSmoothingEnabled = false;
  }

  resizeTo(width, height){
    const sx = Math.max(1, Math.floor(width / this.baseW));
    const sy = Math.max(1, Math.floor(height / this.baseH));
    const s = Math.max(1, Math.min(sx, sy));
    this.scale = s;
    this.canvas.width = this.baseW * s;
    this.canvas.height = this.baseH * s;
    this.crisp();
  }

  clear(){
    const { ctx, canvas } = this;
    ctx.fillStyle = '#111';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  drawImage(img, dx, dy, dw, dh){
    if (!img) return;
    const s = this.scale;
    const w = dw ?? img.width;
    const h = dh ?? img.height;
    this.ctx.drawImage(
      img,
      Math.floor(dx * s),
      Math.floor(dy * s),
      Math.floor(w * s),
      Math.floor(h * s)
    );
  }

  rect(x, y, w, h, color){
    const s = this.scale;
    this.ctx.fillStyle = color;
    this.ctx.fillRect(Math.floor(x * s), Math.floor(y * s), Math.floor(w * s), Math.floor(h * s));
  }

  strokeRect(x, y, w, h, color){
    const s = this.scale;
    this.ctx.strokeStyle = color;
    this.ctx.lineWidth = Math.max(1, s);
    this.ctx.strokeRect(Math.floor(x * s), Math.floor(y * s), Math.floor(w * s), Math.floor(h * s));
  }

  text(value, x, y, opts = {}){
    const s = this.scale;
    const size = opts.size ?? 8;
    const align = opts.align ?? 'left';
    const color = opts.color ?? '#fff';
    const shadow = opts.shadow ?? '#000';
    const weight = opts.weight ?? '700';
    this.ctx.save();
    this.ctx.font = `${weight} ${size * s}px "Courier New", monospace`;
    this.ctx.textAlign = align;
    this.ctx.textBaseline = 'top';
    if (shadow){
      this.ctx.fillStyle = shadow;
      this.ctx.fillText(String(value), Math.floor((x + 1) * s), Math.floor((y + 1) * s));
    }
    this.ctx.fillStyle = color;
    this.ctx.fillText(String(value), Math.floor(x * s), Math.floor(y * s));
    this.ctx.restore();
  }

  drawHud(state){
    const time = Math.ceil(state.timeLeft);
    this.rect(6, 5, 308, 21, 'rgba(0,0,0,.72)');
    this.strokeRect(6, 5, 308, 21, '#f8f4df');
    this.text(`SCORE ${state.score}`, 12, 11, { size: 7, color: '#fff36d' });
    this.text(`BEST ${state.bestScore}`, 112, 11, { size: 7, color: '#b8e6ff' });
    this.text(`TIME ${String(time).padStart(2, '0')}`, 242, 11, { size: 7, color: time <= 10 ? '#ff6961' : '#f8f4df' });

    if (state.combo > 1){
      this.rect(132, 29, 56, 13, '#d21616');
      this.strokeRect(132, 29, 56, 13, '#000');
      this.text(`COMBO x${state.combo}`, 138, 32, { size: 6, color: '#fff' });
    }
  }

  drawTarget(state){
    if (!(state.mode === 'READY' || state.mode === 'IDLE' || state.mode === 'MOVING')) return;
    const x = state.carriageX;
    this.rect(x - 1, 47, 2, 102, 'rgba(255,255,255,.25)');
    this.rect(x - 8, 146, 16, 1, '#fff36d');
    this.rect(x - 1, 139, 2, 15, '#fff36d');
  }

  drawPrizes(state){
    const prizes = [...state.prizes].sort((a, b) => a.y - b.y);
    for (const p of prizes){
      if (p.collected) continue;
      const img = this.loader.img(p.spriteId);
      const bob = p.grabbed ? 0 : Math.sin(performance.now() / 380 + p.wobble) * 1.2;
      this.drawImage(img, p.x, p.y + bob);
      if (!p.grabbed){
        this.rect(p.x + 3, p.y + p.height + 2, Math.max(12, p.width - 6), 2, 'rgba(0,0,0,.28)');
        this.text(p.value, p.x + p.width / 2, p.y - 8, { size: 5, align: 'center', color: '#fff36d' });
      }
    }
  }

  drawParticles(state){
    for (const p of state.particles || []){
      const alpha = Math.max(0, p.life / p.maxLife);
      this.rect(p.x, p.y, 2, 2, p.color.replace(')', `,${alpha})`).replace('rgb', 'rgba'));
    }
  }

  drawMessage(state){
    if (!state.message) return;
    const w = Math.max(112, Math.min(230, state.message.length * 9));
    const x = (320 - w) / 2;
    const y = state.mode === 'READY' ? 92 : 78;
    this.rect(x, y, w, state.subMessage ? 38 : 24, 'rgba(0,0,0,.78)');
    this.strokeRect(x, y, w, state.subMessage ? 38 : 24, '#fff');
    this.text(state.message, 160, y + 7, { size: 10, align: 'center', color: '#fff36d' });
    if (state.subMessage){
      this.text(state.subMessage, 160, y + 24, { size: 6, align: 'center', color: '#f8f4df', weight: '600' });
    }
  }

  drawMachine(state){
    this.drawImage(this.loader.img('rail'), 0, 0);
    const carX = state.carriageX | 0;
    const carY = 12;
    this.drawImage(this.loader.img('carriage'), carX - 20, carY);

    const cableImg = this.loader.img('cable');
    if (cableImg){
      const dropLen = Math.max(0, Math.min(132, state.dropLen | 0));
      this.ctx.save();
      this.ctx.beginPath();
      this.ctx.rect(
        Math.floor((carX - 1) * this.scale),
        Math.floor((carY + 22) * this.scale),
        Math.ceil(2 * this.scale),
        Math.ceil(dropLen * this.scale)
      );
      this.ctx.clip();
      this.drawImage(cableImg, carX - 1, carY + 22);
      this.ctx.restore();
    }

    const clawId = state.clawClosed ? 'claw_closed' : 'claw_open';
    this.drawImage(this.loader.img(clawId), carX - 20, carY + 22 + state.dropLen);
  }

  draw(state){
    this.clear();

    const shake = state.shake > 0 ? Math.round((Math.random() - 0.5) * 4) : 0;
    this.ctx.save();
    this.ctx.translate(shake * this.scale, 0);

    this.drawImage(this.loader.img('bg'), 0, 0);
    this.drawTarget(state);
    this.drawPrizes(state);
    this.drawMachine(state);
    this.drawParticles(state);
    this.drawImage(this.loader.img('chute'), 0, 192);
    this.drawImage(this.loader.img('bezel'), 0, 0);
    this.drawImage(this.loader.img('glass'), 0, 0);

    if (state.flash > 0){
      this.rect(0, 0, 320, 240, `rgba(255,243,109,${Math.min(0.18, state.flash * 0.35)})`);
    }
    this.drawHud(state);
    this.drawMessage(state);
    this.ctx.restore();
  }
}
