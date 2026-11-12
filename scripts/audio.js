/** @typedef {{ volume?: number }} PlayOptions */
/** @typedef {{ stop: () => void }} Voice */

/**
 * One decoded buffer per URL, one interactive context per game. Loading never
 * resumes audio or queues effects. Only a current loop may wait for its buffer.
 * @param {{ createContext?: () => AudioContext | null, request?: typeof fetch, now?: () => number }} options
 */
export function createAudioBus(options = {}) {
  const request = options.request || globalThis.fetch.bind(globalThis);
  const now = options.now || (() => performance.now());
  const createContext =
    options.createContext ||
    (() =>
      typeof AudioContext === 'undefined'
        ? null
        : new AudioContext({ latencyHint: 'interactive' }));
  /** @type {AudioContext | null | undefined} */
  let context;
  /** @type {Promise<boolean> | null} */
  let resuming = null;
  /** @type {Map<string, AudioBuffer>} */
  const buffers = new Map();
  /** @type {Map<string, Promise<boolean>>} */
  const loading = new Map();
  /** @type {Set<Voice>} */
  const playing = new Set();
  /** @type {Map<HTMLMediaElement, Voice>} */
  const looping = new Map();

  function getContext() {
    if (context === undefined) {
      try {
        context = createContext();
      } catch (error) {
        console.warn('[audio context unavailable]', error);
        context = null;
      }
    }
    return context;
  }

  /** @param {HTMLMediaElement} element */
  function urlOf(element) {
    return (
      element.currentSrc ||
      element.src ||
      element.querySelector('source')?.src ||
      ''
    );
  }

  /** @param {HTMLMediaElement} element */
  function preload(element) {
    const ctx = getContext();
    if (!ctx) {
      try {
        element.preload = 'auto';
        element.load();
        return Promise.resolve(true);
      } catch (error) {
        console.warn('[audio preload failed]', error);
        return Promise.resolve(false);
      }
    }
    const url = urlOf(element);
    if (!url) return Promise.resolve(false);
    if (buffers.has(url)) return Promise.resolve(true);
    const pending = loading.get(url);
    if (pending) return pending;
    const controller = new AbortController();
    let expired = false;
    /** @type {ReturnType<typeof setTimeout> | undefined} */
    let timer;
    /** @type {Promise<boolean>} */
    const timeout = new Promise((resolve) => {
      timer = setTimeout(() => {
        expired = true;
        controller.abort();
        console.warn('[audio load timeout]', url);
        resolve(false);
      }, 12000);
    });
    const load = (async () => {
      try {
        const response = await request(url, { signal: controller.signal });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const buffer = await ctx.decodeAudioData(await response.arrayBuffer());
        if (expired) return false;
        buffers.set(url, buffer);
        return true;
      } catch (error) {
        if (!expired) console.warn('[audio load failed]', url, error);
        return false;
      }
    })();
    const result = Promise.race([load, timeout]).finally(() => {
      clearTimeout(timer);
      loading.delete(url);
    });
    loading.set(url, result);
    return result;
  }

  // Keep the gesture listener installed: iOS can suspend/interupt a context
  // again after a call, tab change, or device lock.
  function unlock() {
    const ctx = getContext();
    if (!ctx) return Promise.resolve(false);
    if (ctx.state === 'running') return Promise.resolve(true);
    if (resuming) return resuming;
    /** @type {ReturnType<typeof setTimeout> | undefined} */
    let timer;
    /** @type {Promise<boolean>} */
    const timeout = new Promise((resolve) => {
      timer = setTimeout(() => resolve(false), 1000);
    });
    resuming = Promise.race([
      ctx.resume().then(
        () => ctx.state === 'running',
        () => false,
      ),
      timeout,
    ]).finally(() => {
      clearTimeout(timer);
      resuming = null;
    });
    return resuming;
  }

  /** @param {HTMLMediaElement} element @param {PlayOptions} opts @param {boolean} loop */
  function voice(element, opts, loop) {
    const ctx = getContext();
    const volume = Math.max(0, Math.min(1, opts.volume ?? element.volume));
    let stopped = false;
    let sourceStarted = false;
    /** @type {AudioBufferSourceNode | null} */
    let source = null;
    /** @type {GainNode | null} */
    let gain = null;
    /** @type {HTMLMediaElement | null} */
    let media = null;
    /** @type {ReturnType<typeof setTimeout> | undefined} */
    let expiry;
    const startedAt = now();
    const handle = { stop };

    function cleanup() {
      clearTimeout(expiry);
      if (source) source.onended = null;
      if (media) media.onended = media.onerror = null;
      source?.disconnect();
      gain?.disconnect();
      playing.delete(handle);
      if (looping.get(element) === handle) looping.delete(element);
    }

    function stop() {
      if (stopped) return;
      stopped = true;
      if (sourceStarted) source?.stop();
      if (media) {
        media.pause();
        media.onended = media.onerror = null;
      }
      cleanup();
    }

    function start() {
      if (stopped) return;
      if (!loop && now() - startedAt > 150) {
        stop();
        return;
      }
      try {
        if (ctx) {
          const buffer = buffers.get(urlOf(element));
          if (!buffer || ctx.state !== 'running') {
            stop();
            return;
          }
          source = ctx.createBufferSource();
          gain = ctx.createGain();
          source.buffer = buffer;
          source.loop = loop;
          gain.gain.value = volume;
          source.connect(gain);
          gain.connect(ctx.destination);
          source.onended = () => {
            stopped = true;
            cleanup();
          };
          source.start();
          sourceStarted = true;
        } else {
          // Compatibility path only; supported game browsers use decoded buffers.
          media = /** @type {HTMLMediaElement} */ (element.cloneNode(true));
          media.volume = volume;
          media.loop = loop;
          media.onended = () => {
            stopped = true;
            cleanup();
          };
          media.onerror = stop;
          if (!loop) expiry = setTimeout(stop, 150);
          void media.play().then(() => clearTimeout(expiry), stop);
        }
        if (ctx) clearTimeout(expiry);
      } catch (error) {
        console.warn('[audio playback failed]', error);
        stop();
      }
    }

    function begin() {
      if (!ctx || ctx.state === 'running') start();
      else {
        if (!loop) expiry = setTimeout(stop, 150);
        void unlock().then((running) => {
          if (running) start();
          else stop();
        });
      }
    }

    return {
      handle,
      begin,
      startLoop: () => {
        if (!ctx || buffers.has(urlOf(element))) begin();
        else
          void preload(element).then((loaded) => {
            if (loaded && !stopped) begin();
            else stop();
          });
      },
    };
  }

  /** @param {HTMLMediaElement | undefined} element @param {PlayOptions} opts */
  function play(element, opts = {}) {
    if (!element) return;
    const ctx = getContext();
    // A missing effect is preferable to replaying an obsolete action later.
    if (ctx && !buffers.has(urlOf(element))) {
      void preload(element);
      return;
    }
    const instance = voice(element, opts, false);
    playing.add(instance.handle);
    if (playing.size > 6) playing.values().next().value?.stop();
    instance.begin();
  }

  /** @param {HTMLMediaElement | undefined} element @param {PlayOptions} opts */
  function loop(element, opts = {}) {
    if (!element || looping.has(element)) return;
    const instance = voice(element, opts, true);
    looping.set(element, instance.handle);
    instance.startLoop();
  }

  /** @param {HTMLMediaElement | undefined} element */
  function stopLoop(element) {
    if (element) looping.get(element)?.stop();
  }

  function stopAll() {
    for (const instance of looping.values()) instance.stop();
    for (const instance of playing) instance.stop();
  }

  return { preload, unlock, play, loop, stopLoop, stopAll };
}

export const AudioBus = createAudioBus();
