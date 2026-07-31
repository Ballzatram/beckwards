// scripts/loader.js
// Robust asset loader that reads assets/data/manifest.json and preloads images + audio.
// API:
//   await Loader.loadManifest()       // reads JSON
//   await Loader.loadAll(cb)          // preloads and calls cb(progress 0..1)
//   const img = Loader.img('id')
//   const snd = Loader.snd('id')

export const Loader = {
  images: new Map(),
  audio: new Map(),
  manifest: null,
  _version: '',     // optional cache-busting, set via setVersion('123')

  setVersion(v){ this._version = v ? String(v) : ''; },

  async loadManifest(path = 'assets/data/manifest.json') {
    const url = this._withV(path);
    let res;
    try {
      res = await fetch(url, { cache: 'default' });
    } catch (e) {
      throw new Error(`Manifest request failed (${url}). Check the path and that it's being served.\n` + e);
    }
    if (!res.ok) {
      throw new Error(`Manifest load failed (${res.status}) at ${url}`);
    }
    try {
      this.manifest = await res.json();
    } catch (e) {
      throw new Error(`Manifest JSON parse failed at ${url}\n` + e);
    }
    return this.manifest;
  },

  async loadAll(onProgress = ()=>{}, options = {}) {
    if (!this.manifest) throw new Error('Call loadManifest() first');

    const imageIds = options.imageIds ? new Set(options.imageIds) : null;
    const audioIds = options.audioIds ? new Set(options.audioIds) : null;
    const filter = typeof options.filter === 'function' ? options.filter : null;
    const allow = (item) => {
      if (filter) return filter(item);
      if (item.kind === 'image' && imageIds) return imageIds.has(item.id);
      if (item.kind === 'audio' && audioIds) return audioIds.has(item.id);
      if (imageIds || audioIds) return false;
      return true;
    };

    const items = [
      ...(this.manifest.images || []).map(i => ({ kind: 'image', ...i })),
      ...(this.manifest.audio  || []).map(a => ({ kind: 'audio', ...a })),
    ].filter(allow);

    // Nothing to load — still call progress so UI can advance to 100%
    if (items.length === 0) { onProgress(1); return; }

    let done = 0, total = items.length;
    const tick = () => { done = Math.min(done + 1, total); onProgress(done / total); };

    const loadImage = (item) => new Promise((resolve) => {
      const img = new Image();
      let finished = false;
      const finish = (loaded) => {
        if (finished) return;
        finished = true;
        window.clearTimeout(timeoutId);
        if (loaded) this.images.set(item.id, img);
        tick();
        resolve();
      };
      const timeoutId = window.setTimeout(() => {
        console.warn('[image load timeout]', item.id, this._withV(item.src));
        finish(false);
      }, 6000);

      img.onload = () => {
        // Start decoding, but never let a browser-specific decode stall block
        // the complete arcade from becoming interactive.
        try { img.decode?.().catch(() => {}); } catch {}
        finish(true);
      };
      img.onerror = () => {
        console.warn('[image missing]', item.id, this._withV(item.src));
        finish(false); // soft-fail
      };
      img.src = this._withV(item.src);
    });

    const loadAudio = (item) => new Promise((resolve) => {
      try {
        const el = new Audio();
        el.preload = 'auto';
        el.loop = !!item.loop;

        const sources = Array.isArray(item.src) ? item.src : [item.src];
        if (!sources.length) {
          console.warn('[audio missing src]', item.id);
          tick(); return resolve();
        }

        sources.forEach(src => {
          const s = document.createElement('source');
          s.src = this._withV(src);
          el.appendChild(s);
        });

        // Consider audio ready once metadata is available or after small timeout.
        let finished = false;
        const finish = () => {
          if (finished) return;
          finished = true;
          this.audio.set(item.id, el);
          tick(); resolve();
        };
        el.oncanplaythrough = finish;
        el.onloadedmetadata = finish;
        // Safety fallback so we never hang
        setTimeout(finish, 800);
        el.load();
      } catch (e) {
        console.warn('[audio load error]', item.id, e);
        tick(); resolve(); // soft-fail
      }
    });

    // A small worker pool avoids serial network/decode waits without flooding
    // lower-memory mobile browsers with every asset at once.
    const workerCount = Math.min(Math.max(1, options.concurrency || 6), items.length);
    let nextIndex = 0;
    const worker = async () => {
      while (nextIndex < items.length) {
        const item = items[nextIndex++];
        if (item.kind === 'image') await loadImage(item);
        else if (item.kind === 'audio') await loadAudio(item);
        else { console.warn('[unknown asset kind]', item); tick(); }
      }
    };
    await Promise.all(Array.from({ length:workerCount }, worker));
  },

  img(id){ return this.images.get(id); },
  snd(id){ return this.audio.get(id); },

  _withV(src){
    if (!this._version) return src;
    return src + (src.includes('?') ? '&' : '?') + 'v=' + encodeURIComponent(this._version);
  }
};
