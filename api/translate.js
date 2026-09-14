const MAX_CHARS = 3000;
const TIMEOUT_MS = 9000;

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Método não permitido.' });
  }

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { body = {}; }
  }

  const text = typeof body?.text === 'string' ? body.text.trim() : '';
  if (!text) return res.status(400).json({ error: 'Selecione um trecho para traduzir.' });
  if (text.length > MAX_CHARS) {
    return res.status(413).json({ error: `O trecho é longo demais. Selecione até ${MAX_CHARS} caracteres por vez.` });
  }

  const endpoint = new URL('https://translate.googleapis.com/translate_a/single');
  endpoint.searchParams.set('client', 'gtx');
  endpoint.searchParams.set('sl', 'auto');
  endpoint.searchParams.set('tl', 'pt');
  endpoint.searchParams.set('dt', 't');
  endpoint.searchParams.set('q', text);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch(endpoint, {
      signal: controller.signal,
      headers: {
        'Accept': 'application/json,text/plain,*/*',
        'User-Agent': 'MinhasLeituras/0.3'
      }
    });

    if (!response.ok) {
      return res.status(502).json({ error: 'O serviço de tradução não respondeu corretamente.' });
    }

    const data = await response.json();
    const translatedText = Array.isArray(data?.[0])
      ? data[0].map(part => Array.isArray(part) ? (part[0] || '') : '').join('').trim()
      : '';

    if (!translatedText) {
      return res.status(502).json({ error: 'Não foi possível traduzir esse trecho.' });
    }

    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({
      translatedText,
      detectedLanguage: typeof data?.[2] === 'string' ? data[2] : '',
      targetLanguage: 'pt-BR'
    });
  } catch (error) {
    if (error?.name === 'AbortError') {
      return res.status(504).json({ error: 'A tradução demorou demais para responder.' });
    }
    console.error('translate error', error);
    return res.status(500).json({ error: 'Não foi possível traduzir esse trecho agora.' });
  } finally {
    clearTimeout(timeout);
  }
};
