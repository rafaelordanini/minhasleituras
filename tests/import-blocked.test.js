const test = require('node:test');
const assert = require('node:assert/strict');
const handler = require('../api/import');

function makeRes() {
  return {
    statusCode: 200,
    payload: null,
    headers: {},
    setHeader(name, value) { this.headers[name.toLowerCase()] = value; },
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.payload = payload; return payload; }
  };
}

test('403 do site de origem vira erro estruturado UPSTREAM_BLOCKED', async () => {
  const previousFetch = global.fetch;
  global.fetch = async () => new Response('', { status: 403 });
  try {
    const req = { method: 'GET', query: { url: 'https://1.1.1.1/article' } };
    const res = makeRes();
    await handler(req, res);
    assert.equal(res.statusCode, 502);
    assert.equal(res.payload.code, 'UPSTREAM_BLOCKED');
    assert.equal(res.payload.sourceStatus, 403);
    assert.equal(res.payload.url, 'https://1.1.1.1/article');
    assert.match(res.payload.error, /bloqueou a importação automática/i);
  } finally {
    global.fetch = previousFetch;
  }
});
