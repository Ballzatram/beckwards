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
      res = await fetch(url, { cache: 'no-store' });
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

  async loadAll(onProgress = ()=>{}) {
    if (!this.manifest) throw new Error('Call loadManifest() first');

    const items = [
      ...(this.manifest.images || []).map(i => ({ kind: 'image', ...i })),
      ...(this.manifest.audio  || []).map(a => ({ kind: 'audio', ...a })),
    ];

    // Nothing to load — still call progress so UI can advance to 100%
    if (items.length === 0) { onProgress(1); return; }

    let done = 0, total = items.length;
    const tick = () => { done = Math.min(done + 1, total); onProgress(done / total); };

    const loadImage = (item) => new Promise((resolve) => {
      const img = new Image();
      // If decode is supported, prefer it for better error surfacing
      img.onload = async () => {
        try { await img.decode?.(); } catch {}
        this.images.set(item.id, img);
        tick(); resolve();
      };
      img.onerror = () => {
        console.warn('[image missing]', item.id, this._withV(item.src));
        tick(); resolve(); // soft-fail
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

    // Sequential keeps memory low and surfaces logs in order.
    for (const it of items) {
      if (it.kind === 'image') await loadImage(it);
      else if (it.kind === 'audio') await loadAudio(it);
      else { console.warn('[unknown asset kind]', it); tick(); }
    }
  },

  img(id){ return this.images.get(id); },
  snd(id){ return this.audio.get(id); },

  _withV(src){
    if (!this._version) return src;
    return src + (src.includes('?') ? '&' : '?') + 'v=' + encodeURIComponent(this._version);
  }
};
