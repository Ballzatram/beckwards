(() => {
  const scene = document.querySelector('.home-scene');
  if (!scene) return;
  const slot = document.querySelector('.home-slot');
  const hotspot = document.querySelector('.home-slot__hotspot');
  const status = document.getElementById('coin-status');
  const coins = Array.from(document.querySelectorAll('.home-coin'));
  const audio = Array.from(document.querySelectorAll('.home-coin-audio'));
  const fallbackAudio = document.getElementById('coin-fallback-sfx');
  const totalCoins = coins.length;
  let deposited = 0;
  let redirectTimer = null;
  const primedAudio = new WeakSet();

  const primeCoinAudio = () => {
    const track = audio[deposited] || fallbackAudio;
    if (!track || primedAudio.has(track)) return;
    primedAudio.add(track);
    try {
      track.load();
      // Playback starts on the deposit gesture. A pending priming play()
      // must not pause that playback when its promise resolves later.
    } catch (_) {}
  };

  const playDepositAudio = () => {
    const track = audio[deposited] || fallbackAudio;
    if (!track) return;
    try {
      track.muted = false;
      track.currentTime = 0;
      track.play().catch(() => {
        if (track !== fallbackAudio && fallbackAudio) {
          fallbackAudio.muted = false;
          fallbackAudio.currentTime = 0;
          fallbackAudio.play().catch(() => {});
        }
      });
    } catch (_) {
      try {
        fallbackAudio.muted = false;
        fallbackAudio.currentTime = 0;
        fallbackAudio.play().catch(() => {});
      } catch (_) {}
    }
  };

  const updateStatus = () => {
    if (!status) return;
    status.textContent = deposited >= totalCoins ? 'READY' : `${deposited}/${totalCoins}`;
  };

  const rectsOverlap = (a, b) => (
    a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top
  );

  const getDropTarget = () => {
    const target = hotspot || slot;
    return target?.getBoundingClientRect();
  };

  const setCoinCenter = (coin, x, y) => {
    const sceneRect = scene.getBoundingClientRect();
    coin.style.left = `${x - sceneRect.left}px`;
    coin.style.top = `${y - sceneRect.top}px`;
  };

  const resetCoin = (coin) => {
    coin.classList.remove('is-dragging');
    document.body.classList.remove('is-dragging-coin');
    coin.style.left = '';
    coin.style.top = '';
  };

  const depositCoin = (coin) => {
    if (coin.dataset.deposited === 'true') return;
    // Give taps and keyboard activation the same visible trip into the slot.
    const coinRect = coin.getBoundingClientRect();
    setCoinCenter(coin, coinRect.left + coinRect.width / 2, coinRect.top + coinRect.height / 2);
    coin.getBoundingClientRect();
    playDepositAudio();
    coin.dataset.deposited = 'true';
    coin.classList.remove('is-dragging');
    document.body.classList.remove('is-dragging-coin');
    coin.classList.add('is-deposited');
    const targetRect = getDropTarget();
    if (targetRect) setCoinCenter(coin, targetRect.left + targetRect.width / 2, targetRect.top + targetRect.height / 2);
    coin.setAttribute('aria-hidden', 'true');
    coin.tabIndex = -1;
    deposited += 1;
    updateStatus();

    if (deposited >= totalCoins) {
      window.clearTimeout(redirectTimer);
      redirectTimer = window.setTimeout(() => {
        window.location.href = '/arcade';
      }, 900);
    }
  };

  coins.forEach((coin) => {
    let activePointer = null;
    const startDrag = (event) => {
      if (coin.dataset.deposited === 'true' || activePointer !== null || event.isPrimary === false || event.button !== 0) return;
      event.preventDefault();
      primeCoinAudio();
      const pointerId = event.pointerId;
      activePointer = pointerId;
      const coinRect = coin.getBoundingClientRect();
      const offsetX = event.clientX - (coinRect.left + coinRect.width / 2);
      const offsetY = event.clientY - (coinRect.top + coinRect.height / 2);
      const startX = event.clientX;
      const startY = event.clientY;
      let moved = false;

      coin.classList.add('is-dragging');
      document.body.classList.add('is-dragging-coin');
      try { coin.setPointerCapture?.(pointerId); } catch (_) {}
      setCoinCenter(coin, event.clientX - offsetX, event.clientY - offsetY);

      const moveCoin = (moveEvent) => {
        if (moveEvent.pointerId !== pointerId) return;
        moved ||= Math.hypot(moveEvent.clientX - startX, moveEvent.clientY - startY) > 8;
        setCoinCenter(coin, moveEvent.clientX - offsetX, moveEvent.clientY - offsetY);
      };

      const endDrag = (upEvent) => {
        if (upEvent.pointerId !== pointerId) return;
        // A quick finger swipe may finish before its last pointermove arrives.
        setCoinCenter(coin, upEvent.clientX - offsetX, upEvent.clientY - offsetY);
        moved ||= Math.hypot(upEvent.clientX - startX, upEvent.clientY - startY) > 8;
        cleanup();

        const targetRect = getDropTarget();
        const coinRectAfter = coin.getBoundingClientRect();
        if (!moved || (targetRect && rectsOverlap(coinRectAfter, targetRect))) {
          depositCoin(coin);
        } else {
          resetCoin(coin);
        }
      };

      const cleanup = () => {
        activePointer = null;
        window.removeEventListener('pointermove', moveCoin);
        window.removeEventListener('pointerup', endDrag);
        window.removeEventListener('pointercancel', cancelDrag);
        coin.removeEventListener('lostpointercapture', cancelDrag);
        window.removeEventListener('blur', cancelDrag);
        document.removeEventListener('visibilitychange', cancelWhenHidden);
        try { coin.releasePointerCapture?.(pointerId); } catch (_) {}
      };

      const cancelDrag = (event) => {
        if (event?.pointerId !== undefined && event.pointerId !== pointerId) return;
        cleanup();
        resetCoin(coin);
      };
      const cancelWhenHidden = () => {
        if (document.hidden) cancelDrag();
      };

      window.addEventListener('pointermove', moveCoin);
      window.addEventListener('pointerup', endDrag);
      window.addEventListener('pointercancel', cancelDrag);
      coin.addEventListener('lostpointercapture', cancelDrag);
      window.addEventListener('blur', cancelDrag);
      document.addEventListener('visibilitychange', cancelWhenHidden);
    };

    coin.addEventListener('pointerdown', startDrag);
    coin.addEventListener('dragstart', event => event.preventDefault());
    coin.addEventListener('click', (event) => {
      // Pointer gestures are handled on release; detail=0 covers keyboard/AT.
      if (event.detail !== 0) return;
      primeCoinAudio();
      depositCoin(coin);
    });
  });

  updateStatus();
})();
