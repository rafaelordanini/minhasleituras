const test = require('node:test');
const assert = require('node:assert/strict');
const handler = require('../api/translate');

function makeRes() {
  return {
    statusCode: 200,
    headers: {},
    body: null,
    setHeader(name, value) { this.headers[name.toLowerCase()] = value; },
    status(code) { this.statusCode = code; return this; },
    json(value) { this.body = value; return this; }
  };
}

async function callTranslate(text) {
  const req = { method: 'POST', body: { text } };
  const res = makeRes();
  await handler(req, res);
  return res;
}

test('traduz seleção em espanhol para português', async () => {
  const res = await callTranslate('novedosa');
  assert.equal(res.statusCode, 200, JSON.stringify(res.body));
  assert.equal(typeof res.body?.translatedText, 'string');
  assert.ok(res.body.translatedText.trim().length > 0);
  assert.notEqual(res.body.translatedText.trim().toLowerCase(), 'novedosa');
});

test('usa fallback quando Google falha', async () => {
  const nativeFetch = global.fetch;
  global.fetch = async (url, options) => {
    const href = String(url);
    if (href.includes('translate.googleapis.com')) {
      return new Response('rate limited', { status: 429 });
    }
    return nativeFetch(url, options);
  };

  try {
    const res = await callTranslate('Me vio salir de Catedral, y juntos nos encaminamos a Palacio.');
    assert.equal(res.statusCode, 200, JSON.stringify(res.body));
    assert.equal(res.body?.provider, 'mymemory');
    assert.equal(res.body?.detectedLanguage, 'es');
    assert.ok(res.body.translatedText.trim().length > 0);
    assert.notEqual(
      res.body.translatedText.trim().toLowerCase(),
      'me vio salir de catedral, y juntos nos encaminamos a palacio.'
    );
  } finally {
    global.fetch = nativeFetch;
  }
});
