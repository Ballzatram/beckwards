// scripts/audio.js
// Simple audio wrapper with concurrency cap and safe loop helpers
export const AudioBus = (() => {
  const maxConcurrent = 6;
  const playing = new Set();

  function play(el, opts={}){
    if (!el) return;
    try {
      if (opts.volume != null) el.volume = opts.volume;
      const inst = el.cloneNode(true);
      if (opts.volume != null) inst.volume = opts.volume;
      inst.loop = false;
      inst.onended = () => playing.delete(inst);
      inst.play().catch(()=>{});
      playing.add(inst);
      // prune
      if (playing.size > maxConcurrent) {
        const first = playing.values().next().value;
        try { first.pause(); } catch {}
        playing.delete(first);
      }
    } catch {}
  }

  function loop(el, opts={}){
    if (!el) return;
    try {
      if (opts.volume != null) el.volume = opts.volume;
      el.loop = true;
      el.play().catch(()=>{});
    } catch {}
  }

  function stopLoop(el){
    try { el && el.pause && el.pause(); } catch {}
  }

  function stopAll(){
    for (const inst of Array.from(playing)) {
      try { inst.pause(); } catch {}
      playing.delete(inst);
    }
  }

  return { play, loop, stopLoop, stopAll };
})();
