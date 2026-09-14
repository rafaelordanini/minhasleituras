const dns = require('node:dns').promises;
const net = require('node:net');
const { JSDOM } = require('jsdom');
const { Readability } = require('@mozilla/readability');
const sanitizeHtml = require('sanitize-html');

const MAX_BYTES = 4 * 1024 * 1024;
const MAX_REDIRECTS = 4;
const FETCH_TIMEOUT_MS = 9000;

function isPrivateIpv4(ip) {
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some(n => Number.isNaN(n) || n < 0 || n > 255)) return true;
  const [a, b] = parts;
  return (
    a === 0 || a === 10 || a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 192 && b === 0) ||
    (a === 192 && b === 2) ||
    (a === 198 && (b === 18 || b === 19)) ||
    (a === 198 && b === 51) ||
    (a === 203 && b === 0) ||
    a >= 224
  );
}

function isPrivateIpv6(ip) {
  const normalized = ip.toLowerCase();
  if (normalized === '::' || normalized === '::1') return true;
  if (normalized.startsWith('fc') || normalized.startsWith('fd')) return true;
  if (/^fe[89ab]/.test(normalized)) return true;
  if (normalized.startsWith('::ffff:')) {
    const mapped = normalized.slice(7);
    return net.isIP(mapped) === 4 ? isPrivateIpv4(mapped) : true;
  }
  return false;
}

function isPrivateIp(ip) {
  const version = net.isIP(ip);
  if (version === 4) return isPrivateIpv4(ip);
  if (version === 6) return isPrivateIpv6(ip);
  return true;
}

async function assertPublicUrl(rawUrl) {
  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error('URL inválida.');
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error('Apenas links HTTP e HTTPS podem ser importados.');
  }

  const hostname = parsed.hostname.toLowerCase().replace(/\.$/, '');
  if (
    !hostname ||
    hostname === 'localhost' ||
    hostname.endsWith('.localhost') ||
    hostname.endsWith('.local') ||
    hostname.endsWith('.internal')
  ) {
    throw new Error('Esse endereço não pode ser importado.');
  }

  if (net.isIP(hostname)) {
    if (isPrivateIp(hostname)) throw new Error('Esse endereço não pode ser importado.');
    return parsed;
  }

  let records;
  try {
    records = await dns.lookup(hostname, { all: true, verbatim: true });
  } catch {
    throw new Error('Não foi possível localizar esse site.');
  }

  if (!records.length || records.some(record => isPrivateIp(record.address))) {
    throw new Error('Esse endereço não pode ser importado.');
  }

  return parsed;
}

async function fetchPage(initialUrl) {
  let currentUrl = initialUrl;

  for (let redirectCount = 0; redirectCount <= MAX_REDIRECTS; redirectCount += 1) {
    const parsed = await assertPublicUrl(currentUrl);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    let response;
    try {
      response = await fetch(parsed.toString(), {
        redirect: 'manual',
        signal: controller.signal,
        headers: {
          'User-Agent': 'MinhasLeituras/0.2 (+reader import; contact via GitHub)',
          'Accept': 'text/html,application/xhtml+xml,text/plain;q=0.8,*/*;q=0.2',
          'Accept-Language': 'pt-BR,pt;q=0.9,es;q=0.8,en;q=0.7'
        }
      });
    } catch (error) {
      if (error && error.name === 'AbortError') throw new Error('O site demorou demais para responder.');
      throw new Error('Não foi possível acessar esse site.');
    } finally {
      clearTimeout(timeout);
    }

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location');
      if (!location) throw new Error('O site respondeu com um redirecionamento inválido.');
      currentUrl = new URL(location, parsed).toString();
      continue;
    }

    if (!response.ok) {
      throw new Error(`O site respondeu com status ${response.status}.`);
    }

    const contentType = (response.headers.get('content-type') || '').toLowerCase();
    if (contentType && !contentType.includes('text/html') && !contentType.includes('application/xhtml+xml') && !contentType.includes('text/plain')) {
      throw new Error('O link não parece apontar para uma página de texto.');
    }

    const declaredLength = Number(response.headers.get('content-length') || 0);
    if (declaredLength > MAX_BYTES) throw new Error('A página é grande demais para importar.');

    if (!response.body) throw new Error('O site não retornou conteúdo legível.');

    const reader = response.body.getReader();
    const chunks = [];
    let total = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_BYTES) {
        try { await reader.cancel(); } catch {}
        throw new Error('A página é grande demais para importar.');
      }
      chunks.push(Buffer.from(value));
    }

    const buffer = Buffer.concat(chunks);
    const charsetMatch = contentType.match(/charset\s*=\s*([^;\s]+)/i);
    const charset = charsetMatch ? charsetMatch[1].replace(/["']/g, '') : 'utf-8';
    let html;
    try {
      html = new TextDecoder(charset).decode(buffer);
    } catch {
      html = buffer.toString('utf8');
    }

    return { html, finalUrl: parsed.toString() };
  }

  throw new Error('O site redirecionou vezes demais.');
}

function cleanArticleHtml(content) {
  return sanitizeHtml(content || '', {
    allowedTags: ['p', 'br', 'h2', 'h3', 'h4', 'blockquote', 'ul', 'ol', 'li', 'pre', 'code', 'em', 'strong', 'b', 'i', 'a', 'hr'],
    allowedAttributes: {
      a: ['href']
    },
    allowedSchemes: ['http', 'https', 'mailto'],
    allowProtocolRelative: false,
    transformTags: {
      a: (tagName, attribs) => ({
        tagName,
        attribs: {
          ...(attribs.href ? { href: attribs.href } : {})
        }
      })
    }
  });
}

function fallbackArticle(document) {
  const root = document.querySelector('article, main, [role="main"]') || document.body;
  if (!root) return null;

  root.querySelectorAll('script, style, nav, footer, header, aside, form, iframe, noscript').forEach(node => node.remove());
  const title = (document.querySelector('h1') || document.querySelector('title'))?.textContent?.trim() || 'Texto importado';
  const textContent = root.textContent?.replace(/\s+/g, ' ').trim() || '';
  if (textContent.length < 200) return null;

  return {
    title,
    byline: '',
    excerpt: '',
    siteName: '',
    length: textContent.length,
    content: root.innerHTML,
    textContent
  };
}

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Método não permitido.' });
  }

  const rawUrl = Array.isArray(req.query.url) ? req.query.url[0] : req.query.url;
  if (!rawUrl || typeof rawUrl !== 'string') {
    return res.status(400).json({ error: 'Informe uma URL para importar.' });
  }

  try {
    const { html, finalUrl } = await fetchPage(rawUrl);
    const dom = new JSDOM(html, { url: finalUrl });
    const document = dom.window.document;

    let article = null;
    try {
      article = new Readability(document.cloneNode(true), { charThreshold: 200 }).parse();
    } catch {}

    if (!article) article = fallbackArticle(document);
    if (!article) {
      return res.status(422).json({ error: 'Não consegui identificar um texto principal nessa página.' });
    }

    const content = cleanArticleHtml(article.content);
    const textContent = (article.textContent || '').replace(/\n{3,}/g, '\n\n').trim();
    if (!content || textContent.length < 150) {
      return res.status(422).json({ error: 'O texto encontrado é curto demais ou não pôde ser extraído.' });
    }

    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({
      title: article.title?.trim() || new URL(finalUrl).hostname,
      byline: article.byline?.trim() || '',
      excerpt: article.excerpt?.trim() || '',
      siteName: article.siteName?.trim() || new URL(finalUrl).hostname.replace(/^www\./, ''),
      length: Number(article.length) || textContent.length,
      content,
      textContent,
      url: finalUrl
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Não foi possível importar esse link.';
    return res.status(400).json({ error: message });
  }
};
