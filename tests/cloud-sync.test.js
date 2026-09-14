const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

const root = path.join(__dirname, '..');

function okResponse(data) {
  return {
    ok: true,
    status: 200,
    async text() { return JSON.stringify(data); }
  };
}

test('migração envia etiquetas antes dos textos e usa cookie de mesma origem', async () => {
  const dom = new JSDOM('<!doctype html><div id="toast"></div>', {
    url: 'https://leitura.example/',
    runScripts: 'outside-only'
  });
  const calls = [];
  dom.window.fetch = async (url, options) => {
    calls.push({ url, options, body: JSON.parse(options.body) });
    return okResponse({ ok: true });
  };
  dom.window.console.warn = () => {};
  dom.window.eval(fs.readFileSync(path.join(root, 'app-core.js'), 'utf8'));
  dom.window.eval('function errorText(value, fallback="") { return typeof value === "string" ? value : fallback; }');
  dom.window.eval(fs.readFileSync(path.join(root, 'app-cloud.js'), 'utf8'));

  const tag = { id: 'tag_politica', name: 'Política Internacional', color: '#315c8c', createdAt: '2026-09-14T12:00:00.000Z' };
  const doc = {
    id: 'doc_1', title: 'Teste', html: '<p>Conteúdo</p>', textContent: 'Conteúdo',
    tagIds: ['tag_politica'], notes: [], createdAt: '2026-09-14T12:00:00.000Z', updatedAt: '2026-09-14T12:00:00.000Z'
  };
  const migrated = await dom.window.LeiturCloud.migrateLocalLibrary([doc], [tag]);

  assert.equal(migrated, true);
  assert.equal(calls.length, 2);
  assert.equal(calls[0].body.action, 'upsert_tag');
  assert.equal(calls[1].body.action, 'upsert_doc');
  assert.equal(calls[1].body.doc.id, 'doc_1');
  assert.equal(calls[0].options.credentials, 'same-origin');
  assert.equal(calls[0].url, '/api/library');
  dom.window.close();
});

test('proxy da biblioteca substitui qualquer token vindo do navegador pelo token HttpOnly validado', async () => {
  const authPath = require.resolve('../api/_auth.js');
  const libraryPath = require.resolve('../api/library.js');
  const previousAuth = require.cache[authPath];
  const previousLibrary = require.cache[libraryPath];
  let forwardedBody;
  const previousFetch = global.fetch;

  require.cache[authPath] = {
    id: authPath,
    filename: authPath,
    loaded: true,
    exports: {
      requireSession: async () => ({ ok: true, token: 'server-session-token' })
    }
  };
  delete require.cache[libraryPath];
  global.fetch = async (_url, options) => {
    forwardedBody = JSON.parse(options.body);
    return new Response(JSON.stringify({ ok: true, docs: [], tags: [] }), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    });
  };

  const handler = require('../api/library.js');
  const req = { method: 'POST', body: { action: 'pull', token: 'browser-forged-token' }, headers: {} };
  const output = { status: 200, body: null, headers: {} };
  const res = {
    setHeader(name, value) { output.headers[name] = value; },
    status(code) { output.status = code; return this; },
    json(body) { output.body = body; return this; }
  };

  try {
    await handler(req, res);
    assert.equal(output.status, 200);
    assert.equal(forwardedBody.action, 'pull');
    assert.equal(forwardedBody.token, 'server-session-token');
    assert.notEqual(forwardedBody.token, 'browser-forged-token');
  } finally {
    global.fetch = previousFetch;
    if (previousAuth) require.cache[authPath] = previousAuth; else delete require.cache[authPath];
    if (previousLibrary) require.cache[libraryPath] = previousLibrary; else delete require.cache[libraryPath];
  }
});
