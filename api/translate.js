const MAX_CHARS = 3000;
const GOOGLE_TIMEOUT_MS = 5000;
const MYMEMORY_TIMEOUT_MS = 6500;
const MYMEMORY_MAX_BYTES = 450;

const LANGUAGE_WORDS = {
  es: ['el','la','los','las','de','del','que','y','en','por','para','con','una','un','se','es','como','pero','más','al','su','sus','ya','hay','porque','cuando','donde','desde','sino','todo','esta','este','muy'],
  pt: ['o','a','os','as','de','do','da','dos','das','que','e','em','por','para','com','uma','um','se','é','como','mas','mais','ao','aos','sua','seu','não','quando','onde','desde','isso','esta','este','muito'],
  en: ['the','and','of','to','in','a','is','that','for','with','as','on','by','from','it','this','are','be','was','were','but','not','you','your','his','her'],
  fr: ['le','la','les','de','des','et','en','pour','avec','une','un','est','que','qui','dans','pas','plus','au','aux','ce','cette','mais','sur','par','comme','très'],
  it: ['il','lo','la','gli','le','di','del','che','e','in','per','con','una','un','è','come','ma','più','al','nel','non','questo','questa'],
  de: ['der','die','das','den','dem','des','und','von','zu','in','mit','für','ist','dass','ein','eine','nicht','auf','als','auch','aber','aus']
};

function normalizeForDetection(text) {
  return ` ${String(text || '').toLowerCase().normalize('NFKC').replace(/[^\p{L}\p{N}]+/gu, ' ').replace(/\s+/g, ' ').trim()} `;
}

function detectLanguage(text) {
  const normalized = normalizeForDetection(text);
  if (!normalized.trim()) return '';
  const scores = Object.fromEntries(Object.keys(LANGUAGE_WORDS).map(lang => [lang, 0]));

  for (const [lang, words] of Object.entries(LANGUAGE_WORDS)) {
    for (const word of words) {
      const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const matches = normalized.match(new RegExp(` ${escaped} `, 'g'));
      if (matches) scores[lang] += matches.length;
    }
  }

  const raw = String(text || '').toLowerCase();
  if (/[¿¡ñ]/.test(raw)) scores.es += 4;
  if (/\b(qué|cómo|dónde|también|sólo|sino|usted|ustedes|ellos|ellas)\b/u.test(raw)) scores.es += 3;
  if (/\b(não|também|você|vocês|eles|elas|então|ação|ções)\b/u.test(raw)) scores.pt += 4;
  if (/[àâçéèêëîïôùûüÿœæ]/.test(raw)) scores.fr += 2;
  if (/\b(avec|dans|pour|mais|être|avoir|nous|vous|ils|elles)\b/u.test(raw)) scores.fr += 3;
  if (/\b(the|this|that|with|from|have|has|would|could|should)\b/u.test(raw)) scores.en += 3;
  if (/\b(che|gli|della|delle|sono|questo|questa|anche)\b/u.test(raw)) scores.it += 3;
  if (/\b(der|die|das|und|nicht|ein|eine|ist|sind|auch)\b/u.test(raw)) scores.de += 3;

  const ranked = Object.entries(scores).sort((a,b) => b[1] - a[1]);
  if (!ranked[0] || ranked[0][1] < 2) return '';
  if (ranked[1] && ranked[0][1] === ranked[1][1]) return '';
  return ranked[0][0];
}

function utf8Bytes(text) {
  return Buffer.byteLength(text, 'utf8');
}

function splitByUtf8Bytes(text, maxBytes = MYMEMORY_MAX_BYTES) {
  const input = String(text || '').trim();
  if (!input) return [];
  if (utf8Bytes(input) <= maxBytes) return [input];

  const chunks = [];
  let current = '';
  const tokens = input.split(/(\s+)/);

  const pushCurrent = () => {
    const value = current.trim();
    if (value) chunks.push(value);
    current = '';
  };

  for (const token of tokens) {
    if (!token) continue;
    if (utf8Bytes(current + token) <= maxBytes) {
      current += token;
      continue;
    }

    pushCurrent();
    if (utf8Bytes(token) <= maxBytes) {
      current = token;
      continue;
    }

    let piece = '';
    for (const char of token) {
      if (utf8Bytes(piece + char) > maxBytes) {
        if (piece) chunks.push(piece);
        piece = char;
      } else {
        piece += char;
      }
    }
    current = piece;
  }

  pushCurrent();
  return chunks;
}

function decodeEntities(text) {
  return String(text || '')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

async function fetchWithTimeout(url, options, timeoutMs) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

async function translateWithGoogle(text) {
  const endpoint = new URL('https://translate.googleapis.com/translate_a/single');
  endpoint.searchParams.set('client', 'gtx');
  endpoint.searchParams.set('sl', 'auto');
  endpoint.searchParams.set('tl', 'pt');
  endpoint.searchParams.set('dt', 't');
  endpoint.searchParams.set('ie', 'UTF-8');
  endpoint.searchParams.set('oe', 'UTF-8');
  endpoint.searchParams.set('q', text);

  const response = await fetchWithTimeout(endpoint, {
    headers: {
      'Accept': 'application/json,text/plain,*/*',
      'Accept-Language': 'pt-BR,pt;q=0.9,es;q=0.8,en;q=0.7',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/152.0 Safari/537.36'
    }
  }, GOOGLE_TIMEOUT_MS);

  if (!response.ok) throw new Error(`Google Translate respondeu ${response.status}.`);
  const raw = await response.text();
  let data;
  try { data = JSON.parse(raw); }
  catch { throw new Error('Google Translate devolveu uma resposta inválida.'); }

  const translatedText = Array.isArray(data?.[0])
    ? data[0].map(part => Array.isArray(part) ? (part[0] || '') : '').join('').trim()
    : '';
  if (!translatedText) throw new Error('Google Translate não devolveu tradução.');

  return {
    translatedText,
    detectedLanguage: typeof data?.[2] === 'string' ? data[2] : '',
    provider: 'google'
  };
}

async function translateMyMemoryChunk(text, sourceLanguage) {
  const endpoint = new URL('https://api.mymemory.translated.net/get');
  endpoint.searchParams.set('q', text);
  endpoint.searchParams.set('langpair', `${sourceLanguage}|pt-BR`);
  endpoint.searchParams.set('mt', '1');

  const response = await fetchWithTimeout(endpoint, {
    headers: {
      'Accept': 'application/json',
      'User-Agent': 'MinhasLeituras/0.8'
    }
  }, MYMEMORY_TIMEOUT_MS);
  if (!response.ok) throw new Error(`MyMemory respondeu ${response.status}.`);

  const data = await response.json();
  const status = Number(data?.responseStatus || response.status);
  const translatedText = decodeEntities(data?.responseData?.translatedText || '').trim();
  if (status >= 400 || !translatedText) throw new Error('MyMemory não devolveu tradução.');
  const match = Number(data?.responseData?.match ?? data?.matches?.[0]?.match ?? 0) || 0;
  return { translatedText, match };
}

async function translateWithMyMemoryForLanguage(text, sourceLanguage) {
  const chunks = splitByUtf8Bytes(text);
  const results = [];
  for (const chunk of chunks) results.push(await translateMyMemoryChunk(chunk, sourceLanguage));
  return {
    translatedText: results.map(item => item.translatedText).join(' ').replace(/\s+/g, ' ').trim(),
    detectedLanguage: sourceLanguage,
    provider: 'mymemory',
    match: results.length ? results.reduce((sum,item) => sum + item.match, 0) / results.length : 0
  };
}

async function translateWithMyMemory(text, detectedLanguage) {
  if (detectedLanguage === 'pt') {
    return { translatedText: text, detectedLanguage: 'pt', provider: 'identity', match: 1 };
  }

  if (detectedLanguage) return translateWithMyMemoryForLanguage(text, detectedLanguage);

  // Para seleções curtas (por exemplo, uma única palavra) não há contexto suficiente
  // para detectar o idioma com segurança. Testamos os idiomas mais comuns em paralelo
  // e escolhemos a resposta com melhor match que realmente altere o texto.
  const candidates = ['es','en','fr','it','de'];
  const settled = await Promise.allSettled(candidates.map(lang => translateWithMyMemoryForLanguage(text, lang)));
  const original = text.trim().toLocaleLowerCase('pt-BR');
  const successful = settled
    .filter(item => item.status === 'fulfilled')
    .map(item => item.value)
    .filter(item => item.translatedText && item.translatedText.trim().toLocaleLowerCase('pt-BR') !== original)
    .sort((a,b) => (b.match || 0) - (a.match || 0));

  if (!successful.length) throw new Error('Não foi possível determinar o idioma da seleção.');
  return successful[0];
}

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

  let googleError = null;
  try {
    const result = await translateWithGoogle(text);
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({ ...result, targetLanguage: 'pt-BR' });
  } catch (error) {
    googleError = error;
    console.warn('translate-google-fallback', error?.message || error);
  }

  try {
    const detectedLanguage = detectLanguage(text);
    const result = await translateWithMyMemory(text, detectedLanguage);
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({ ...result, targetLanguage: 'pt-BR' });
  } catch (error) {
    console.error('translate-all-providers-failed', {
      google: googleError?.message || String(googleError || ''),
      fallback: error?.message || String(error || '')
    });
    const timedOut = googleError?.name === 'AbortError' || error?.name === 'AbortError';
    return res.status(timedOut ? 504 : 502).json({
      error: timedOut
        ? 'Os serviços de tradução demoraram demais para responder. Tente novamente.'
        : 'Não foi possível traduzir esse trecho agora. Tente novamente em alguns instantes.'
    });
  }
};
