const { callAuth } = require('../_auth');

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Método não permitido.' });
  }
  try {
    const result = await callAuth('challenge');
    res.setHeader('Cache-Control', 'no-store');
    return res.status(result.status).json(result.data);
  } catch {
    return res.status(502).json({ error: 'Não foi possível iniciar a autenticação.' });
  }
};
