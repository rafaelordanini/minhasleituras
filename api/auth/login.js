const { callAuth, setSessionCookie } = require('../_auth');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Método não permitido.' });
  }

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { body = {}; }
  }

  const challengeId = typeof body?.challengeId === 'string' ? body.challengeId : '';
  const clientPublicKey = body?.clientPublicKey;
  const iv = typeof body?.iv === 'string' ? body.iv : '';
  const ciphertext = typeof body?.ciphertext === 'string' ? body.ciphertext : '';
  if (!challengeId || !clientPublicKey || !iv || !ciphertext) {
    return res.status(400).json({ error: 'Dados de autenticação inválidos.' });
  }

  try {
    const result = await callAuth('verify', { challengeId, clientPublicKey, iv, ciphertext });
    if (!result.ok || !result.data?.ok || !result.data?.token) {
      return res.status(result.status || 401).json({ error: result.data?.error || 'Senha incorreta.' });
    }
    setSessionCookie(res, result.data.token);
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({ ok: true, expiresAt: result.data.expiresAt || null });
  } catch {
    return res.status(502).json({ error: 'Não foi possível concluir a autenticação.' });
  }
};
