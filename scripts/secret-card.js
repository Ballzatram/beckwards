(() => {
  const page = document.querySelector('[data-secret-card-page]');
  const form = document.querySelector('[data-secret-card-form]');
  const status = document.querySelector('[data-secret-card-status]');
  if (!page || !form) return;

  const inputs = Array.from(form.querySelectorAll('[data-secret-code-input]'));
  const slots = inputs.map((input) => input.closest('.secret-card-slot'));
  const quarters = slots.map((slot) => slot?.querySelector('[data-secret-quarter]'));
  const audio = Array.from(page.querySelectorAll('[data-secret-card-audio]'));
  const unlockKey = 'beckwardsStickyNoteUnlocked';
  const validCodes = ['CMBWB301', 'CMBWB302', 'CMBWB303', 'CMBWB3014'];
  const usedCodes = new Set();
  let redirectTimer = null;

  const normalizeCode = (value) => value.toUpperCase().replace(/\s+/g, '');

  const setStatus = (message) => {
    if (status) status.textContent = message;
  };

  const playAudio = (index) => {
    const track = audio[index];
    if (!track) return;
    try {
      track.currentTime = 0;
      track.play().catch(() => {});
    } catch (_) {}
  };

  const shakeSlot = (slot, message) => {
    if (!slot) return;
    slot.classList.remove('is-shaking');
    void slot.offsetWidth;
    slot.classList.add('is-shaking');
    setStatus(message);
  };

  const completeCard = () => {
    try {
      window.sessionStorage?.setItem(unlockKey, 'true');
    } catch (_) {}
    document.body.classList.add('is-complete');
    setStatus('All four codes accepted. Opening the next page.');
    window.clearTimeout(redirectTimer);
    redirectTimer = window.setTimeout(() => {
      window.location.href = '/sticky-note';
    }, 900);
  };

  const acceptCode = (input, code) => {
    const index = inputs.indexOf(input);
    const slot = slots[index];
    const quarter = quarters[index];
    usedCodes.add(code);
    input.value = code;
    input.disabled = true;
    input.tabIndex = -1;
    slot?.classList.add('is-filled');
    if (quarter) {
      if (!quarter.src && quarter.dataset.src) quarter.src = quarter.dataset.src;
      quarter.hidden = false;
    }
    playAudio(index);

    const accepted = usedCodes.size;
    setStatus(`${accepted} of ${validCodes.length} codes accepted`);
    inputs.find((candidate) => !candidate.disabled)?.focus({ preventScroll: true });
    if (accepted >= validCodes.length) completeCard();
  };

  const validateInput = (input, force = false) => {
    const value = normalizeCode(input.value);
    const slot = input.closest('.secret-card-slot');
    if (!value) return;

    if (validCodes.includes(value)) {
      const hasLongerMatch = validCodes.some((code) => code !== value && code.startsWith(value));
      if (hasLongerMatch && !force) return;
      if (usedCodes.has(value)) {
        shakeSlot(slot, 'That code has already been used');
        input.select();
        return;
      }
      acceptCode(input, value);
      return;
    }

    const canStillMatch = validCodes.some((code) => code.startsWith(value));
    if (force || value.length >= 9 || (value.length >= 8 && !canStillMatch)) {
      shakeSlot(slot, 'Try another code');
      input.select();
    }
  };

  form.addEventListener('submit', (event) => event.preventDefault());
  inputs.forEach((input) => {
    input.addEventListener('input', () => {
      const normalized = normalizeCode(input.value);
      if (input.value !== normalized) input.value = normalized;
      validateInput(input);
    });
    input.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter') return;
      event.preventDefault();
      validateInput(input, true);
    });
    input.addEventListener('blur', () => validateInput(input, true));
  });
})();
