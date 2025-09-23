// scripts/renderer.js
// Canvas 2D renderer for the claw scene
export class Renderer {
  constructor(canvas, loader){
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.loader = loader;
    this.scale = 1;

    // Make pixel art crisp in all browsers
    this.ctx.imageSmoothingEnabled = false;
    this.ctx.webkitImageSmoothingEnabled = false;
    this.ctx.mozImageSmoothingEnabled = false;
  }

  resizeTo(width, height){
    // Pixel-perfect upscale to fit container (keep 320x240 base)
    const baseW = 320, baseH = 240;
    const sx = Math.max(1, Math.floor(width / baseW));
    const sy = Math.max(1, Math.floor(height / baseH));
    const s = Math.max(1, Math.min(sx, sy));
    this.scale = s;
    this.canvas.width = baseW * s;
    this.canvas.height = baseH * s;

    // Re-assert no smoothing on resize (some browsers reset it)
    this.ctx.imageSmoothingEnabled = false;
    this.ctx.webkitImageSmoothingEnabled = false;
    this.ctx.mozImageSmoothingEnabled = false;
  }

  clear(){
    const {ctx, canvas} = this;
    ctx.fillStyle = '#111';
    ctx.fillRect(0,0,canvas.width,canvas.height);
  }

  drawImage(img, dx, dy){
    if (!img) return;
    const s = this.scale;
    this.ctx.drawImage(
      img,
      Math.floor(dx*s), Math.floor(dy*s),
      Math.floor(img.width*s), Math.floor(img.height*s)
    );
  }

  draw(state){
    this.clear();

    // Background
    this.drawImage(this.loader.img('bg'), 0, 0);

    // Prizes
    for (const p of state.prizes){
      const img = this.loader.img(p.spriteId);
      if (!img) continue;
      this.drawImage(img, p.x, p.y);
    }

    // Rail
    this.drawImage(this.loader.img('rail'), 0, 0);

    // Carriage + cable + claw
    const carX = state.carriageX|0;
    const carY = 12; // below rail
    this.drawImage(this.loader.img('carriage'), carX-20, carY);

    // Cable
    const cableImg = this.loader.img('cable');
    if (cableImg){
      const dropLen = Math.max(0, Math.min(120, state.dropLen|0));
      this.ctx.save();
      this.ctx.beginPath();
      // clip a 2px vertical strip for the visible cable length
      this.ctx.rect(
        Math.floor((carX-1)*this.scale),
        Math.floor((carY+22)*this.scale),
        Math.ceil(2*this.scale),
        Math.ceil(dropLen*this.scale)
      );
      this.ctx.clip();
      this.drawImage(cableImg, carX-1, carY+22);
      this.ctx.restore();
    }

    // Claw (open/closed)
    const clawId = state.clawClosed ? 'claw_closed' : 'claw_open';
    this.drawImage(this.loader.img(clawId), carX-20, carY+22+state.dropLen);

    // Foreground overlays
    this.drawImage(this.loader.img('chute'), 0, 192);  // chute strip at bottom
    this.drawImage(this.loader.img('bezel'), 0, 0);    // cabinet bezel frame

    // Optional: faint glass streaks (comment out to remove completely)
    this.drawImage(this.loader.img('glass'), 0, 0);
  }
}
