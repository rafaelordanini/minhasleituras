const EDGE_AUTH_URL = 'https://cahfjsfxlvvfjehdizsb.supabase.co/functions/v1/leitura-auth';
const COOKIE_NAME = 'ml_session';
const COOKIE_MAX_AGE = 7 * 24 * 60 * 60;

function parseCookies(req) {
  const header = req.headers?.cookie || '';
  return Object.fromEntries(header.split(';').map(part => part.trim()).filter(Boolean).map(part => {
    const index = part.indexOf('=');
    if (index < 0) return [part, ''];
    return [part.slice(0, index), decodeURIComponent(part.slice(index + 1))];
  }));
}

async function callAuth(action, payload = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(EDGE_AUTH_URL, {
      method: 'POST',
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify({ action, ...payload })
    });
    const raw = await response.text();
    let data = {};
    if (raw) {
      try { data = JSON.parse(raw); }
      catch { data = { error: 'Resposta inválida do serviço de autenticação.' }; }
    }
    return { ok: response.ok, status: response.status, data };
  } finally {
    clearTimeout(timeout);
  }
}

function setSessionCookie(res, token) {
  res.setHeader('Set-Cookie', `${COOKIE_NAME}=${encodeURIComponent(token)}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=${COOKIE_MAX_AGE}`);
}

function clearSessionCookie(res) {
  res.setHeader('Set-Cookie', `${COOKIE_NAME}=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0`);
}

async function validateRequestSession(req) {
  const token = parseCookies(req)[COOKIE_NAME] || '';
  if (!token) return { ok: false, token: '' };
  try {
    const result = await callAuth('session', { token });
    return { ok: result.ok && result.data?.ok === true, token, data: result.data };
  } catch {
    return { ok: false, token };
  }
}

async function requireSession(req, res) {
  const session = await validateRequestSession(req);
  if (session.ok) return session;
  clearSessionCookie(res);
  res.status(401).json({ error: 'Sessão não autenticada.' });
  return null;
}

module.exports = {
  callAuth,
  parseCookies,
  setSessionCookie,
  clearSessionCookie,
  validateRequestSession,
  requireSession,
  COOKIE_NAME
};
