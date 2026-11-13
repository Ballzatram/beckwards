# Arcade responsiveness verification

Owner: Ballzatram. Updated: 2026-11-12. Browsers: desktop Chromium, Pixel 7 Chromium emulation, iPhone 13 WebKit emulation. Physical iPhone/Android devices and speaker/Bluetooth output latency have not been measured.

## Input and rendering

The joystick engages at 12% travel rather than 34%, with a 6% release threshold to avoid motor chatter near center. Movement commands run in the input event; visual knob/ARIA updates share one animation frame. Gate geometry is measured once per gesture. Window move/up/cancel listeners recover when pointer capture is unavailable, and only the active pointer can control a drag. Release, lost capture, blur, hiding and resizing reset input. Overlapping arrow keys and A/D keys preserve the remaining held direction.

Regression evidence: the original implementation failed the small-deflection, capture-failure and overlapping-arrow tests. The fixed implementation moves the rendered claw in both directions at 15% deflection within 34ms of simulated 60Hz time. The clock is explicitly paused between measurements; `clock.install()` alone was insufficient and produced a false reversal failure. These are deterministic rendering checks, not physical input-to-display latency measurements.

Budgets enforced by tests: one layout measurement for a 60-event gesture burst; movement changes during the input event; visible movement/reversal within two simulated frames; centered controls and stopped movement immediately after release/cancel. Native Android touch-protocol checks cover repeated grabs, reversals, cancellation and zero page scroll. Desktop mouse, keyboard and iPhone WebKit pointer checks cover the same critical control behavior. The DPR cap and idle animation-frame shutdown remain in place. The moving canvas now clears completely and draws directly from original images; game speeds, claw geometry and prize rules are preserved.

The mobile cabinet also moved 50px when the browser brought the slider into focus, despite the document itself staying at scrollY=0. The scene now uses overflow clipping (with the existing hidden fallback), preventing internal focus scrolling. A regression checks both the scene scroll offset and unchanged control bounds on a 390×664 viewport; all visible controls still fit the viewport.

The browser behavior of hidden versus clipped overflow is documented in [MDN's overflow reference](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/overflow).

The older `arcade-legacy.html` entry retains the loader's original 800ms optional-sound deadline, while Web Audio decoding continues independently. A stalled-audio regression reproduced a ten-second loading failure before this compatibility fix. The legacy entry also uses the same versioned audio imports and persistent gesture unlock; its game rules and controls are preserved.

The stalled-audio test waits for DOM readiness rather than the full load event: Linux WebKit keeps that event pending for the intentionally held media requests. Its ten-second loading assertion and visible-canvas checks remain unchanged. This test setup failure was diagnosed from both CI runs; no test retry or product deadline increase was added.

## Audio

The loader starts asynchronous fetch/decode of the motor, click, quarter and victory sounds during initialization, independently of artwork/control readiness. The shared AudioContext requests interactive latency and resumes from user gestures, including later gestures after interruptions. Buffered sources reuse decoded data instead of creating media players for each action. Loop ownership is idempotent; stopping a loop or hiding the page cancels pending playback as well as active sources. A late blur cannot restart a hidden game's motor. Effects missing their buffer are not replayed after the event; pending effects expire after 150ms. Fetch/decode waits are bounded at 12 seconds and resume waits at one second. Unsupported Web Audio environments retain a bounded media-element fallback.

The [interactive latency hint](https://developer.mozilla.org/en-US/docs/Web/API/AudioContext/AudioContext) is a browser request, not a guarantee of hardware output latency.

Victory audio starts in its own preload job during initialization and is checked again on Drop to recover an earlier failure. It cannot queue behind stalled motor/click/quarter requests. A paused-clock regression holds every other sound indefinitely and verifies that victory loading still starts before controls become ready.

The preload probe observes the independent victory request while time is paused, then resumes time before requiring artwork readiness. A post-merge Linux WebKit run exposed an intermittent LOADING result with the clock frozen throughout image completion, despite the independent Pages run passing the same source. The probe retains both assertions and their deadlines; no automatic retry was enabled.

A required claw image is explicitly held until the victory request is observed, and the game must still report LOADING at that point. The image is then released, time resumed and READY required. This verifies startup ordering without relying on artwork completing at a particular wall-clock speed.

The victory clip now uses a 192kbps stereo MP3: **238,464 bytes**, down from **2,848,778 bytes** (91.6% smaller). The original WAV is retained. The four initial audio assets total **990,224 bytes** and have an enforced **1,000,000-byte** transfer budget. MP3 encoding adds normal codec frame padding; the decoded clip measured 9.936s versus the 9.891s source. No music, volume, page copy or page elements were added.

Source SHA-256: `d8452cf03b549cd2f4d9fe44bbe83046f0736cad9188378e2a63d6376508b66c`. MP3 SHA-256: `4ee4b5dfb60953015e8c8b6c0a1d18e4ecefefefb7164ca68033542cc38a01df`. Encoding used the official PyPI `lameenc==1.9.0` Windows wheel in an ignored, local tooling directory: 48kHz stereo, 24-bit PCM converted to signed 16-bit little endian, bitrate 192, quality 2. The encoder is not an application/build dependency.

Browser probes verify victory decoding before Drop, independent victory loading, a running audio context for motor/effects, motor cancellation, and victory source scheduling in the existing OPENING phase. This measures software scheduling, not audible speaker onset. Windows Playwright WebKit does not expose AudioContext: the two Web Audio probes are explicitly skipped there; fallback error/stop behavior is unit tested. Linux CI exercises Web Audio where available. Native touch protocol cases are skipped on non-Chromium/desktop projects. Hardware audio and assistive-technology review remain explicit limits.

## Checks

Run `npm run check:homepage`, `npm run check:arcade`, `npm run test:static`, `npm test`, `npm run check:pages`, the structural audit and dependency/secret scans. The arcade quality gate enforces formatting, ESLint and strict checkJs for the rewritten audio/input modules and their new tests. `npm run test:audio` includes the shipped audio module and enforces 90% line, branch and function coverage. Measured module coverage: 94.93% lines, 92.52% branches, 93.55% functions. These scoped results do not resolve the repository-wide legacy typing/coverage gaps in [the audit](audit.md).

No runtime dependencies, deployment permissions or security gates changed. The removed mobile INSERT COIN prompt stays removed; existing Drop, Retry and reward journeys remain regression requirements.

Changed runtime modules use release query versions. The rendering correction versions the game, renderer and manifest together; unchanged audio, loader and input modules retain their existing compatible versions. This prevents a cached old renderer from surviving the correction without downloading unchanged sound assets again.

## Rendering correction after the iPhone report

The owner's screenshot showed repeated joystick images and a rod without its claw. Earlier checks sampled a row through the rod and verified input state; that did not prove the complete claw or clean compositing. The physical iPhone GPU failure was not reproduced directly in the available desktop engines.

The replacement removes hidden canvas sprite copies and crops the original claw images directly. Every active frame clears the entire moving canvas, with static cabinet art remaining in the DOM. Returning from background or a restored drawing context redraws even an idle claw. The moving joystick image uses its layout position, without a transform or CSS drop-shadow filter; image size, travel, controls and copy remain unchanged. Canvas paint containment is removed so it does not constrain repaint invalidation.

Related historical WebKit reports document [canvas-to-canvas failures](https://bugs.webkit.org/show_bug.cgi?id=207128) and [drop-shadow repaint trails](https://bugs.webkit.org/show_bug.cgi?id=202472). These explain the paths avoided here; they do not establish the exact bug/version on the owner's phone.

New checks inspect both the head and arms, excluding the rod. They simulate unavailable intermediate canvas surfaces, restored main-canvas pixels and background pixel loss. All three failed before the correction. Eight left/right sweeps must return the joystick to the same resting bitmap after each release; a viewport resize must keep the full claw visible. Screenshots are attached to the browser results. These are visual/resource-recovery regressions, not a claim of physical iPhone verification.
