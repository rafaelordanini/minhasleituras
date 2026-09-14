const { validateRequestSession, clearSessionCookie } = require('../_auth');

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Método não permitido.' });
  }
  res.setHeader('Cache-Control', 'no-store');
  const session = await validateRequestSession(req);
  if (!session.ok) {
    clearSessionCookie(res);
    return res.status(401).json({ ok: false });
  }
  return res.status(200).json({ ok: true, expiresAt: session.data?.expiresAt || null });
};
