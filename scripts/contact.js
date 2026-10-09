(() => {
  const EMAIL = 'beckwardss@gmail.com';
  const scene = document.querySelector('.poster-scene');
  const status = document.getElementById('copy-status');
  const statusText = document.querySelector('[data-copy-status-text]');
  const copiedImage = document.querySelector('.poster-copied');
  const tabs = Array.from(document.querySelectorAll('[data-contact-tab]'));
  const tearSoundUrls = Array.from({ length: 6 }, (_, index) => `assets/contact/tear%20${index + 1}.wav`);

  const playTearSound = () => {
    const source = tearSoundUrls[Math.floor(Math.random() * tearSoundUrls.length)];
    if (!source) return;
    try {
      const sound = new Audio(source);
      sound.preload = 'none';
      sound.volume = 0.72;
      sound.play().catch(() => {});
    } catch (_) {}
  };

  const writeClipboardFallback = (text) => {
    const input = document.createElement('textarea');
    input.value = text;
    input.setAttribute('readonly', '');
    input.style.position = 'fixed';
    input.style.left = '-9999px';
    input.style.top = '0';
    document.body.appendChild(input);
    input.select();
    try {
      return document.execCommand('copy') === true;
    } catch (_) {
      return false;
    } finally {
      input.remove();
    }
  };

  const copyEmail = async (tab) => {
    if (tab.dataset.copied === 'true' || tab.dataset.copying === 'true') return;
    tab.dataset.copying = 'true';
    const shouldMoveFocus = document.activeElement === tab;
    let copied = false;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(EMAIL);
        copied = true;
      }
    } catch (_) {}
    if (!copied) copied = writeClipboardFallback(EMAIL);
    delete tab.dataset.copying;
    tab.classList.remove('is-dragging');
    status.classList.add('is-visible');
    status.classList.toggle('has-copy-error', !copied);
    if (!copied) {
      ['left', 'top', 'right', 'bottom'].forEach(property => tab.style.removeProperty(property));
      statusText.textContent = `Couldn't copy. Contact: ${EMAIL}`;
      copiedImage.style.opacity = '0';
      return;
    }

    tab.dataset.copied = 'true';
    tab.classList.remove('is-dragging');
    tab.classList.add('is-removed');
    tab.style.opacity = '0';
    tab.style.visibility = 'hidden';
    tab.style.pointerEvents = 'none';
    tab.tabIndex = -1;
    tab.setAttribute('aria-hidden', 'true');
    if (shouldMoveFocus) {
      const nextTab = tabs.find((candidate) => candidate !== tab && candidate.dataset.copied !== 'true');
      nextTab?.focus({ preventScroll:true });
    }
    playTearSound();
    statusText.textContent = 'copied';
    copiedImage.style.opacity = '1';
    copiedImage.style.transform = 'scale(1)';
  };

  const setTabPosition = (tab, x, y) => {
    const sceneRect = scene.getBoundingClientRect();
    tab.style.left = `${x - sceneRect.left}px`;
    tab.style.top = `${y - sceneRect.top}px`;
    tab.style.right = 'auto';
    tab.style.bottom = 'auto';
  };

  tabs.forEach((tab) => {
    tab.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      copyEmail(tab);
    });

    tab.addEventListener('pointerdown', (event) => {
      if (event.isPrimary === false || event.button !== 0 || tab.dataset.copying === 'true' || tab.dataset.copied === 'true') return;
      event.preventDefault();
      const pointerId = event.pointerId;
      const startX = event.clientX;
      const startY = event.clientY;
      let lastX = startX;
      let lastY = startY;
      const tabRect = tab.getBoundingClientRect();
      const offsetX = event.clientX - (tabRect.left + tabRect.width / 2);
      const offsetY = event.clientY - (tabRect.top + tabRect.height / 2);
      const threshold = window.matchMedia('(pointer: coarse)').matches ? 84 : window.matchMedia('(max-width: 640px)').matches ? 96 : 140;

      const restoreTabPosition = () => {
        if (tab.dataset.copied === 'true') return;
        ['left', 'top', 'right', 'bottom'].forEach((property) => tab.style.removeProperty(property));
      };

      tab.classList.add('is-dragging');
      tab.setPointerCapture?.(pointerId);
      setTabPosition(tab, event.clientX - offsetX, event.clientY - offsetY);

      const moveTab = (moveEvent) => {
        if (moveEvent.pointerId !== pointerId) return;
        lastX = moveEvent.clientX;
        lastY = moveEvent.clientY;
        const nextX = moveEvent.clientX - offsetX;
        const nextY = moveEvent.clientY - offsetY;
        setTabPosition(tab, nextX, nextY);

        const distance = Math.hypot(moveEvent.clientX - startX, moveEvent.clientY - startY);
        if (distance >= threshold) {
          copyEmail(tab);
        }
      };

      const endDrag = (upEvent) => {
        if (upEvent.pointerId !== pointerId) return;
        lastX = upEvent.clientX;
        lastY = upEvent.clientY;
        try { tab.releasePointerCapture?.(pointerId); } catch (_) {}
        tab.removeEventListener('pointermove', moveTab);
        tab.removeEventListener('pointerup', endDrag);
        tab.removeEventListener('pointercancel', cancelDrag);
        tab.classList.remove('is-dragging');
        const distance = Math.hypot(lastX - startX, lastY - startY);
        if (distance < 10) copyEmail(tab);
        else if (distance < threshold) restoreTabPosition();
      };

      const cancelDrag = () => {
        tab.removeEventListener('pointermove', moveTab);
        tab.removeEventListener('pointerup', endDrag);
        tab.removeEventListener('pointercancel', cancelDrag);
        tab.classList.remove('is-dragging');
        try { tab.releasePointerCapture?.(pointerId); } catch (_) {}
        restoreTabPosition();
      };

      tab.addEventListener('pointermove', moveTab);
      tab.addEventListener('pointerup', endDrag);
      tab.addEventListener('pointercancel', cancelDrag);
    });
  });
})();
