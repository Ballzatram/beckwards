# Architecture and preservation boundaries

Static music site with generated route copies, browser interactions and a claw-machine game. Existing static and Playwright tests remain authoritative.

Standards adoption adds engineering controls around the existing implementation. See README and existing architecture/product documentation for component-level details. Existing public routes, data formats, entry points, safety gates and deployments must remain compatible. Operational and full threat-model review are pending in docs/audit.md.

The homepage occupies the dynamic viewport (`100dvh`, with a `100vh` fallback), without a minimum page height. Its document is fixed and prevents panning/overscroll; pinch zoom remains available. Coin buttons retain their own `touch-action: none` so dragging cannot become a browser scroll gesture. Compact portrait rules keep the existing title, slot, status, navigation and coins visible on short screens. Other routes keep their existing scrolling behavior. Browser regressions cover viewport resizing, touch swipes, coin deposits and navigation.

Arcade input sends movement commands directly and batches knob presentation per frame, caching gate geometry until the gesture ends. Pointer ownership and window release/cancel recovery are independent of pointer-capture success. AudioBus owns one interactive AudioContext, URL-keyed decoded buffers and cancellable voices; Loader prepares sound independently of artwork/control readiness. The HTML media fallback remains for unsupported contexts. See [arcade responsiveness](arcade-responsiveness.md) for budgets, failure handling, regression evidence and measurement limits.

The moving canvas redraws from original sprite images instead of retaining hidden canvas copies. Complete clears, context-restoration redraws and foreground redraws avoid stale/empty backing surfaces. Joystick movement changes the existing image's left position without a moving drop-shadow filter. Static cabinet layers, game mechanics and UI structure remain unchanged.
