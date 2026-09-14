const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

function boot() {
  const dom = new JSDOM(`<!doctype html><body>
    <button id="manualBtn"></button><button id="editDocBtn"></button>
    <div id="textEditorModal"><h3 id="editorModalTitle"></h3><input id="editorTitleInput"><input id="editorSubtitleInput"><div id="editorContent"></div><button id="saveTextEditorBtn"></button><button id="cancelTextEditorBtn"></button></div>
    <div class="dek"></div><div id="toast"></div>
  </body>`, { runScripts: 'outside-only', url: 'https://example.test/' });
  const { window } = dom;
  window.state = { docs: [] };
  window.el = id => window.document.getElementById(id);
  window.now = () => '2026-09-14T18:00:00.000Z';
  let counter = 0;
  window.uid = prefix => `${prefix}_${++counter}`;
  window.readingMinutes = text => Math.max(1, Math.ceil(String(text || '').trim().split(/\s+/).filter(Boolean).length / 220));
  window.toastMessages = [];
  window.toast = msg => window.toastMessages.push(msg);
  window.saveDoc = async doc => {
    const i = window.state.docs.findIndex(d => d.id === doc.id);
    if (i >= 0) window.state.docs[i] = doc; else window.state.docs.unshift(doc);
    return doc;
  };
  window.openedId = null;
  window.openDocument = id => { window.openedId = id; };
  window.activeDoc = () => window.state.docs.find(d => d.id === window.state.activeDocId) || null;
  window.renderReader = doc => { window.state.activeDocId = doc.id; window.document.querySelector('.dek').textContent = doc.dek || ''; };
  window.showLibrary = () => {};
  const code = fs.readFileSync(path.join(__dirname, '..', 'app-editor.js'), 'utf8');
  window.eval(code);
  return window;
}

test('cria texto manual com título, subtítulo e conteúdo sanitizado', async () => {
  const window = boot();
  window.LeiturEditor.openTextEditor();
  window.el('editorTitleInput').value = 'Meu texto';
  window.el('editorSubtitleInput').value = 'Autor ou frase';
  window.el('editorContent').innerHTML = '<p onclick="alert(1)">Primeiro parágrafo.</p><script>alert(1)</script><p>Segundo parágrafo.</p>';
  const doc = await window.LeiturEditor.saveTextEditor();

  assert.ok(doc);
  assert.equal(doc.title, 'Meu texto');
  assert.equal(doc.subtitle, 'Autor ou frase');
  assert.equal(doc.sourceType, 'manual');
  assert.equal(doc.isRead, false);
  assert.match(doc.html, /Primeiro parágrafo/);
  assert.doesNotMatch(doc.html, /script|onclick/i);
  assert.equal(window.state.docs.length, 1);
  assert.equal(window.openedId, doc.id);
});

test('edita texto existente preservando tags, notas, lido e marcador', async () => {
  const window = boot();
  const original = {
    id: 'doc_existing',
    title: 'Título antigo',
    subtitle: 'Sub antigo',
    dek: 'Sub antigo',
    type: 'Link · 3 min',
    label: 'Texto da web · Leitura de 3 min',
    html: '<p>Texto antigo <mark class="user-highlight" data-highlight-id="h1">marcado</mark><span class="reading-marker" data-reading-marker="true" data-marker-id="m1"></span>.</p>',
    textContent: 'Texto antigo marcado.',
    tagIds: ['tag1'],
    notes: [{ id: 'note1', quote: 'marcado', body: '' }],
    isRead: true,
    readAt: '2026-09-14T17:00:00.000Z',
    readingMarker: { id: 'm1' },
    readingMarkerAt: '2026-09-14T17:30:00.000Z',
    createdAt: '2026-09-13T10:00:00.000Z',
    updatedAt: '2026-09-13T10:00:00.000Z'
  };
  window.state.docs.push(original);
  window.LeiturEditor.openTextEditor(original.id);
  window.el('editorTitleInput').value = 'Título novo';
  window.el('editorSubtitleInput').value = 'Novo subtítulo';
  window.el('editorContent').innerHTML += '<p>Novo parágrafo.</p>';
  const saved = await window.LeiturEditor.saveTextEditor();

  assert.equal(saved.id, original.id);
  assert.equal(saved.title, 'Título novo');
  assert.equal(saved.subtitle, 'Novo subtítulo');
  assert.deepEqual(saved.tagIds, ['tag1']);
  assert.equal(saved.notes.length, 1);
  assert.equal(saved.isRead, true);
  assert.equal(saved.readAt, '2026-09-14T17:00:00.000Z');
  assert.deepEqual(saved.readingMarker, { id: 'm1' });
  assert.match(saved.html, /data-highlight-id="h1"/);
  assert.match(saved.html, /data-reading-marker="true"/);
  assert.match(saved.html, /Novo parágrafo/);
});