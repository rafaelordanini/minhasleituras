(() => {
  const gate = document.getElementById('authGate');
  const app = document.getElementById('app');
  const enterBtn = document.getElementById('authEnterBtn');
  const form = document.getElementById('authForm');
  const input = document.getElementById('authPassword');
  const submit = document.getElementById('authSubmit');
  const message = document.getElementById('authMessage');

  function bytesToBase64(bytes) {
    let binary = '';
    const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    for (const byte of view) binary += String.fromCharCode(byte);
    return btoa(binary);
  }

  function base64ToBytes(value) {
    const binary = atob(value);
    return Uint8Array.from(binary, c => c.charCodeAt(0));
  }

  function setMessage(text = '', isError = false) {
    if (!message) return;
    message.textContent = text;
    message.classList.toggle('error', isError);
  }

  function setBusy(busy) {
    gate?.classList.toggle('auth-loading', busy);
    if (submit) submit.disabled = busy;
  }

  async function encryptedPayload(password, challenge) {
    const serverPublic = await crypto.subtle.importKey(
      'jwk',
      challenge.serverPublicKey,
      { name: 'ECDH', namedCurve: 'P-256' },
      false,
      []
    );
    const clientPair = await crypto.subtle.generateKey(
      { name: 'ECDH', namedCurve: 'P-256' },
      true,
      ['deriveBits']
    );
    const sharedSecret = await crypto.subtle.deriveBits(
      { name: 'ECDH', public: serverPublic },
      clientPair.privateKey,
      256
    );
    const aesKey = await crypto.subtle.importKey('raw', sharedSecret, { name: 'AES-GCM' }, false, ['encrypt']);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ciphertext = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      aesKey,
      new TextEncoder().encode(password)
    );
    const clientPublicKey = await crypto.subtle.exportKey('jwk', clientPair.publicKey);
    return {
      challengeId: challenge.challengeId,
      clientPublicKey,
      iv: bytesToBase64(iv),
      ciphertext: bytesToBase64(ciphertext)
    };
  }

  async function requestJson(url, options = {}) {
    const response = await fetch(url, {
      cache: 'no-store',
      credentials: 'same-origin',
      ...options,
      headers: { 'Accept': 'application/json', ...(options.headers || {}) }
    });
    const raw = await response.text();
    let data = {};
    if (raw) {
      try { data = JSON.parse(raw); }
      catch { data = { error: 'Resposta inválida do servidor.' }; }
    }
    return { response, data };
  }

  function addLogoutButton() {
    const actions = document.getElementById('readerActions');
    if (!actions || document.getElementById('logoutBtn')) return;
    const button = document.createElement('button');
    button.type = 'button';
    button.id = 'logoutBtn';
    button.className = 'logout-btn';
    button.textContent = 'Sair';
    button.addEventListener('click', async () => {
      try { await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' }); } catch {}
      location.reload();
    });
    actions.appendChild(button);
  }

  function unlock() {
    window.LEITURA_AUTHENTICATED = true;
    if (gate) gate.hidden = true;
    app?.classList.remove('auth-locked');
    app?.removeAttribute('aria-hidden');
    if (typeof window.startLeituraApp === 'function') window.startLeituraApp();
    queueMicrotask(addLogoutButton);
  }

  function showLogin() {
    window.LEITURA_AUTHENTICATED = false;
    if (gate) gate.hidden = false;
    app?.classList.add('auth-locked');
    app?.setAttribute('aria-hidden', 'true');
  }

  async function checkSession() {
    showLogin();
    try {
      const { response, data } = await requestJson('/api/auth/session');
      if (response.ok && data?.ok) {
        unlock();
        return;
      }
    } catch {}
    showLogin();
  }

  async function login() {
    const password = input?.value || '';
    if (!password) {
      setMessage('Digite a senha.', true);
      input?.focus();
      return;
    }
    if (input) input.value = '';
    setBusy(true);
    setMessage('Verificando…');
    try {
      const challengeResult = await requestJson('/api/auth/challenge');
      if (!challengeResult.response.ok) throw new Error(challengeResult.data?.error || 'Não foi possível iniciar o login.');
      const payload = await encryptedPayload(password, challengeResult.data);
      const loginResult = await requestJson('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (!loginResult.response.ok || !loginResult.data?.ok) {
        throw new Error(loginResult.data?.error || 'Senha incorreta.');
      }
      setMessage('');
      unlock();
    } catch (error) {
      setMessage(error?.message || 'Não foi possível entrar.', true);
      input?.focus();
    } finally {
      setBusy(false);
    }
  }

  enterBtn?.addEventListener('click', () => {
    enterBtn.hidden = true;
    form?.classList.add('open');
    input?.focus();
  });
  form?.addEventListener('submit', event => { event.preventDefault(); login(); });

  checkSession();
})();
