const { callAuth, parseCookies, clearSessionCookie, COOKIE_NAME } = require('../_auth');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Método não permitido.' });
  }
  const token = parseCookies(req)[COOKIE_NAME] || '';
  try {
    if (token) await callAuth('logout', { token });
  } catch {}
  clearSessionCookie(res);
  res.setHeader('Cache-Control', 'no-store');
  return res.status(200).json({ ok: true });
};
