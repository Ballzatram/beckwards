(() => {
  const form = document.querySelector('[data-sticky-note-form]');
  const messageInput = document.querySelector('[data-sticky-note-message]');
  const honeyInput = document.querySelector('[data-sticky-note-honey]');
  const count = document.querySelector('[data-sticky-note-count]');
  const status = document.querySelector('[data-sticky-note-status]');
  const submitButton = document.querySelector('[data-sticky-note-submit]');
  const submitLabel = document.querySelector('[data-sticky-note-submit-label]');
  if (!form || !messageInput) return;

  const maxWords = 45;
  const email = 'beckwardss@gmail.com';
  const subject = 'Custom sticky note request';
  const endpoint = `https://formsubmit.co/ajax/${email}`;
  let useEmailFallback = false;
  let sending = false;

  const getWords = (value) => value.trim().split(/\s+/).filter(Boolean);

  const setStatus = (message) => {
    if (status) status.textContent = message;
  };

  const setEmailFallback = (enabled) => {
    useEmailFallback = enabled;
    form.classList.toggle('has-email-fallback', enabled);
    if (submitLabel) submitLabel.textContent = enabled ? 'OPEN EMAIL' : 'SEND NOTE';
  };

  const getEmailComposeUrl = (message) => {
    const body = [
      'Custom sticky note request:',
      '',
      message
    ].join('\n');
    const params = new URLSearchParams({
      view: 'cm',
      fs: '1',
      to: email,
      su: subject,
      body
    });
    return `https://mail.google.com/mail/?${params.toString()}`;
  };

  const updateCount = () => {
    const words = getWords(messageInput.value);
    if (words.length > maxWords) {
      messageInput.value = words.slice(0, maxWords).join(' ');
    }
    const current = getWords(messageInput.value).length;
    form.classList.toggle('has-copy', Boolean(messageInput.value.trim()));
    form.classList.remove('is-invalid');
    if (count) count.textContent = `${current}/${maxWords} WORDS`;
    if (current > 0) setStatus('');
  };

  messageInput.addEventListener('input', updateCount);
  updateCount();

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (sending) return;
    const message = messageInput.value.trim();
    if (!message) {
      setStatus('TYPE A QUESTION FIRST.');
      form.classList.remove('is-invalid');
      void form.offsetWidth;
      form.classList.add('is-invalid');
      messageInput.focus();
      return;
    }

    if (useEmailFallback) {
      window.open(getEmailComposeUrl(message), '_blank', 'noopener,noreferrer');
      setStatus('EMAIL OPENED IN A NEW TAB.');
      return;
    }

    sending = true;
    messageInput.readOnly = true;
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 12000);
    if (submitButton) {
      submitButton.disabled = true;
      submitButton.setAttribute('aria-busy', 'true');
    }
    setStatus('SENDING YOUR NOTE...');

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json'
        },
        body: JSON.stringify({
          _subject: subject,
          _template: 'table',
          _captcha: 'false',
          _honey: honeyInput?.value || '',
          message,
          page: window.location.href
        })
      });
      const result = await response.json().catch(() => ({}));
      const confirmed = result.success === true || result.success === 'true';
      if (!response.ok || !confirmed) throw new Error(result.message || 'Submission not confirmed');

      form.reset();
      updateCount();
      messageInput.blur();
      submitButton?.blur();
      setEmailFallback(false);
      setStatus('NOTE SENT. THANK YOU.');
    } catch (_) {
      setEmailFallback(true);
      setStatus('SEND NOT CONFIRMED. YOUR NOTE IS STILL HERE. TAP SEND TO OPEN EMAIL.');
    } finally {
      window.clearTimeout(timeout);
      sending = false;
      messageInput.readOnly = false;
      if (submitButton) {
        submitButton.disabled = false;
        submitButton.removeAttribute('aria-busy');
      }
    }
  });
})();
