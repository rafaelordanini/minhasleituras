const test = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');

test('Retomar remove marcador visual e persistido', async () => {
  const dom = new JSDOM(`<!doctype html><body>
    <div id="readerActions"><button id="listenBtn">Ouvir</button></div>
    <div id="articleBody"></div>
    <div id="floatingHL"></div>
    <div id="readingListNav"></div><span id="readingListCount"></span>
    <div id="crumb"></div>
  </body>`, { url: 'https://example.test' });

  global.window = dom.window;
  global.document = dom.window.document;
  global.Node = dom.window.Node;
  global.state = { docs: [], view: 'reader', activeDocId: 'doc1' };
  global.el = id => document.getElementById(id);
  global.now = () => '2026-09-14T18:00:00.000Z';
  global.toast = () => {};

  const doc = {
    id: 'doc1',
    isRead: false,
    readingMarker: { id: 'm1', createdAt: 'x' },
    readingMarkerAt: 'x',
    html: '<p>Antes <span class="reading-marker" data-reading-marker="true" data-marker-id="m1"></span>depois</p>'
  };
  state.docs = [doc];
  global.activeDoc = () => doc;
  let saved = false;
  global.saveDoc = async () => { saved = true; };

  window.renderSidebar = () => {};
  window.renderLibraryCards = () => {};
  window.showLibrary = () => {};
  window.renderReader = current => { document.getElementById('articleBody').innerHTML = current.html; };
  let scrollTarget = null;
  window.scrollY = 0;
  Object.defineProperty(window, 'innerHeight', { value: 800, configurable: true });
  window.scrollTo = options => { scrollTarget = options; };
  dom.window.HTMLElement.prototype.getBoundingClientRect = () => ({ top: 500, left: 0, right: 0, bottom: 0, width: 0, height: 0 });

  delete require.cache[require.resolve('../app-reading-tools.js')];
  require('../app-reading-tools.js');
  window.renderReader(doc);

  const resume = document.getElementById('resumeMarkerBtn');
  assert.ok(resume, 'botão Retomar deve existir');
  resume.click();
  await new Promise(resolve => setTimeout(resolve, 20));

  assert.equal(saved, true);
  assert.equal(document.querySelector('[data-reading-marker="true"]'), null);
  assert.equal(doc.readingMarker, null);
  assert.equal(doc.readingMarkerAt, null);
  assert.equal(doc.html.includes('data-reading-marker'), false);
  assert.equal(document.getElementById('resumeMarkerBtn'), null);
  assert.ok(scrollTarget && typeof scrollTarget.top === 'number');
});
