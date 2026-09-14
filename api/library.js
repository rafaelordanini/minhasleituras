const { requireSession } = require('./_auth');

const LIBRARY_URL = 'https://cahfjsfxlvvfjehdizsb.supabase.co/functions/v1/leitura-library';
const TIMEOUT_MS = 20000;

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Método não permitido.' });
  }

  const session = await requireSession(req, res);
  if (!session) return;

  let body = req.body || {};
  if (typeof body === 'string') {
    try { body = JSON.parse(body); }
    catch { return res.status(400).json({ error: 'JSON inválido.' }); }
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return res.status(400).json({ error: 'Requisição inválida.' });
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(LIBRARY_URL, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({ ...body, token: session.token })
    });
    const raw = await response.text();
    res.setHeader('Cache-Control', 'no-store');
    res.status(response.status);
    if (!raw) return res.json({ ok: response.ok });
    try { return res.json(JSON.parse(raw)); }
    catch { return res.json({ error: 'Resposta inválida do serviço de sincronização.' }); }
  } catch (error) {
    const message = error?.name === 'AbortError'
      ? 'A sincronização demorou demais para responder.'
      : 'Não foi possível acessar a biblioteca em nuvem.';
    return res.status(502).json({ error: message });
  } finally {
    clearTimeout(timeout);
  }
};
