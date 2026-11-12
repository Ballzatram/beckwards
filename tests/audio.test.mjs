import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import { createAudioBus } from '../scripts/audio.js';

test('the four shipped arcade sounds stay within the 1 MB transfer budget', async () => {
  const manifest = JSON.parse(
    await readFile(
      new URL('../assets/data/manifest.json', import.meta.url),
      'utf8',
    ),
  );
  const ids = new Set(['motor_loop', 'ui_click', 'quarter_audio_1', 'win']);
  const sounds = manifest.audio.filter((/** @type {{ id: string }} */ sound) =>
    ids.has(sound.id),
  );
  assert.equal(sounds.length, 4);
  const sizes = await Promise.all(
    sounds.map(async (/** @type {{ src: string[] }} */ sound) => {
      assert.equal(sound.src.length, 1);
      assert.ok(sound.src[0]);
      return (await stat(new URL(`../${sound.src[0]}`, import.meta.url))).size;
    }),
  );
  assert.ok(
    sizes.reduce(
      (/** @type {number} */ sum, /** @type {number} */ size) => sum + size,
      0,
    ) <= 1_000_000,
  );
});

function setup() {
  const buffer = /** @type {AudioBuffer} */ ({});
  const sources =
    /** @type {{ buffer: AudioBuffer | null, loop: boolean, started: boolean, stopped: boolean, disconnected: boolean, onended: (() => void) | null, connect: () => void, disconnect: () => void, start: () => void, stop: () => void }[]} */ ([]);
  let reads = 0;
  let decodes = 0;
  let timestamp = 0;
  let finishResume = () => {};
  const context = {
    state: 'running',
    destination: {},
    resume: async () => {
      context.state = 'running';
    },
    decodeAudioData: async () => {
      decodes++;
      return buffer;
    },
    createGain: () => ({ gain: { value: 1 }, connect() {}, disconnect() {} }),
    createBufferSource: () => {
      const source = {
        buffer: /** @type {AudioBuffer | null} */ (null),
        loop: false,
        started: false,
        stopped: false,
        disconnected: false,
        onended: /** @type {(() => void) | null} */ (null),
        connect() {},
        disconnect() {
          source.disconnected = true;
        },
        start() {
          source.started = true;
        },
        stop() {
          source.stopped = true;
        },
      };
      sources.push(source);
      return source;
    },
  };
  const bus = createAudioBus({
    createContext: () =>
      /** @type {AudioContext} */ (/** @type {unknown} */ (context)),
    request: async () => {
      reads++;
      return new Response(new ArrayBuffer(4));
    },
    now: () => timestamp,
  });
  const element = /** @type {HTMLMediaElement} */ (
    /** @type {unknown} */ ({
      currentSrc: '',
      src: 'https://example.test/motor.wav',
      volume: 1,
      cloneNode() {
        throw new Error('Buffered playback must not clone media');
      },
    })
  );
  return {
    bus,
    element,
    sources,
    context,
    reads: () => reads,
    decodes: () => decodes,
    suspend: () => {
      context.state = 'suspended';
      context.resume = () =>
        new Promise((resolve) => {
          finishResume = () => {
            context.state = 'running';
            resolve();
          };
        });
    },
    resume: () => finishResume(),
    advance: (/** @type {number} */ ms) => {
      timestamp += ms;
    },
  };
}

test('buffers are fetched/decoded once and reused for immediate effects and loops', async () => {
  const s = setup();
  assert.deepEqual(
    await Promise.all([s.bus.preload(s.element), s.bus.preload(s.element)]),
    [true, true],
  );
  await s.bus.preload(s.element);
  assert.equal(s.reads(), 1);
  assert.equal(s.decodes(), 1);
  s.bus.play(s.element);
  s.bus.play(s.element);
  s.bus.loop(s.element);
  s.bus.loop(s.element);
  assert.equal(s.sources.length, 3);
  assert.ok(s.sources.every((source) => source.started));
  s.bus.stopLoop(s.element);
  assert.equal(s.sources[2]?.stopped, true);
  s.bus.stopAll();
  assert.ok(s.sources.every((source) => source.stopped && source.disconnected));
});

test('releasing a loop while it is still decoding prevents delayed playback', async () => {
  const s = setup();
  let finish = () => {};
  s.context.decodeAudioData = () =>
    new Promise((resolve) => {
      finish = () => resolve(/** @type {AudioBuffer} */ ({}));
    });
  s.bus.loop(s.element);
  s.bus.stopLoop(s.element);
  const pending = s.bus.preload(s.element);
  // Wait until decoding has actually been reached, rather than sleeping.
  await new Promise((resolve) => setImmediate(resolve));
  finish();
  assert.equal(await pending, true);
  assert.equal(s.sources.length, 0);
  s.bus.loop(s.element);
  assert.equal(s.sources.length, 1);
  s.bus.stopAll();
});

test('late effects are discarded and stopAll cancels a pending resume', async () => {
  const s = setup();
  await s.bus.preload(s.element);
  s.suspend();
  s.bus.play(s.element);
  s.advance(200);
  s.resume();
  await s.bus.unlock();
  assert.equal(s.sources.length, 0);
  s.suspend();
  s.bus.loop(s.element);
  s.bus.stopAll();
  s.resume();
  await s.bus.unlock();
  assert.equal(s.sources.length, 0);
});

test('effects arriving before decode are not replayed later; concurrency stays bounded', async () => {
  const s = setup();
  s.bus.play(s.element);
  await s.bus.preload(s.element);
  assert.equal(s.sources.length, 0);
  for (let i = 0; i < 10; i++) s.bus.play(s.element);
  assert.equal(
    s.sources.filter((source) => source.started && !source.stopped).length,
    6,
  );
  s.bus.stopAll();
});

test('a failed fetch can recover on the next preload', async () => {
  const s = setup();
  let calls = 0;
  const bus = createAudioBus({
    createContext: () =>
      /** @type {AudioContext} */ (/** @type {unknown} */ (s.context)),
    request: async () =>
      new Response('', { status: ++calls === 1 ? 503 : 200 }),
  });
  assert.equal(await bus.preload(s.element), false);
  assert.equal(await bus.preload(s.element), true);
  bus.play(s.element);
  assert.equal(s.sources.length, 1);
  bus.stopAll();
});

test('stalled fetching and context resuming time out and permit retry', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const s = setup();
  let aborted = false;
  const bus = createAudioBus({
    createContext: () =>
      /** @type {AudioContext} */ (/** @type {unknown} */ (s.context)),
    request: (_url, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          aborted = true;
          reject(new Error('aborted'));
        });
      }),
  });
  const loading = bus.preload(s.element);
  t.mock.timers.tick(12000);
  assert.equal(await loading, false);
  assert.equal(aborted, true);
  s.suspend();
  const pending = s.bus.unlock();
  t.mock.timers.tick(1000);
  assert.equal(await pending, false);
  s.context.resume = async () => {
    s.context.state = 'running';
  };
  assert.equal(await s.bus.unlock(), true);
});

test('an autoplay denial can recover on the next gesture and pending effects expire', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const s = setup();
  await s.bus.preload(s.element);
  s.suspend();
  s.context.resume = async () => {
    throw new Error('gesture required');
  };
  assert.equal(await s.bus.unlock(), false);
  s.suspend();
  s.bus.play(s.element);
  t.mock.timers.tick(150);
  s.resume();
  await s.bus.unlock();
  assert.equal(s.sources.length, 0);
  s.bus.loop(s.element);
  assert.equal(s.sources.length, 1);
  s.bus.stopAll();
});

test('decode failure, missing audio and source-start failure are contained', async () => {
  const s = setup();
  const decode = s.context.decodeAudioData;
  s.context.decodeAudioData = async () => {
    throw new Error('unsupported encoding');
  };
  assert.equal(await s.bus.preload(s.element), false);
  s.context.decodeAudioData = decode;
  await s.bus.preload(s.element);
  const createSource = s.context.createBufferSource;
  s.context.createBufferSource = () => {
    const source = createSource();
    source.start = () => {
      throw new Error('output unavailable');
    };
    return source;
  };
  assert.doesNotThrow(() => s.bus.play(s.element));
  assert.equal(s.sources[0]?.disconnected, true);
  s.bus.play(undefined);
  s.bus.loop(undefined);
  s.bus.stopLoop(undefined);
  s.element.src = '';
  s.element.querySelector = () => null;
  assert.equal(await s.bus.preload(s.element), false);
});

test('natural endings release voices and stopped loops can be restarted', async () => {
  const s = setup();
  await s.bus.preload(s.element);
  s.bus.play(s.element);
  s.sources[0]?.onended?.();
  assert.equal(s.sources[0]?.disconnected, true);
  s.bus.loop(s.element);
  s.bus.stopLoop(s.element);
  s.bus.loop(s.element);
  assert.equal(s.sources.length, 3);
  s.bus.stopAll();
});

test('media fallback plays, stops and contains denied playback without Web Audio', async () => {
  let loads = 0,
    pauses = 0;
  const media = {
    preload: '',
    volume: 1,
    loop: false,
    onended: null,
    onerror: null,
    load() {
      loads++;
    },
    pause() {
      pauses++;
    },
    play: async () => {},
    cloneNode() {
      return { ...media };
    },
  };
  const element = /** @type {HTMLMediaElement} */ (
    /** @type {unknown} */ (media)
  );
  const bus = createAudioBus({ createContext: () => null });
  assert.equal(await bus.preload(element), true);
  assert.equal(loads, 1);
  assert.equal(await bus.unlock(), false);
  bus.play(element);
  bus.loop(element);
  bus.stopAll();
  assert.equal(pauses, 2);
  media.play = async () => {
    throw new Error('denied');
  };
  bus.play(element);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(pauses, 3);
  media.load = () => {
    throw new Error('unavailable');
  };
  assert.equal(await bus.preload(element), false);
});

test('media fallback discards an effect whose playback startup stalls', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let pauses = 0;
  let finish = () => {};
  const media = {
    volume: 1,
    loop: false,
    onended: null,
    onerror: null,
    pause() {
      pauses++;
    },
    play: () =>
      new Promise((resolve) => {
        finish = () => resolve(undefined);
      }),
    cloneNode() {
      return { ...media };
    },
  };
  const bus = createAudioBus({ createContext: () => null });
  bus.play(/** @type {HTMLMediaElement} */ (/** @type {unknown} */ (media)));
  t.mock.timers.tick(150);
  assert.equal(pauses, 1);
  finish();
  await new Promise((resolve) => setImmediate(resolve));
  bus.stopAll();
  assert.equal(pauses, 1);
});
