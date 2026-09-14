const DB_NAME = 'minhasleituras-db';
const DB_VERSION = 1;
const RECENT_LIMIT = 5;

const state = {
  db: null,
  docs: [],
  tags: [],
  activeDocId: null,
  view: 'reader',
  activeTagFilter: null,
  selectedText: '',
  selectedRange: null,
  selectionRect: null,
  speaking: false,
  focus: false,
  returnToTagPicker: false
};

const el = id => document.getElementById(id);
const now = () => new Date().toISOString();
const uid = prefix => `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
const escapeHtml = (s='') => String(s).replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
const toast = (msg, duration=2600) => {
  const t = el('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => t.classList.remove('show'), duration);
};

function tagIconSvg(color='currentColor', size=14) {
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M20.6 13.2 12.9 20.9a2 2 0 0 1-2.8 0L3.1 13.9a2 2 0 0 1-.6-1.4V5a2 2 0 0 1 2-2h7.5a2 2 0 0 1 1.4.6l7.2 7.2a1.7 1.7 0 0 1 0 2.4Z" stroke="${color}" stroke-width="1.7"/><circle cx="7.5" cy="7.5" r="1.5" fill="${color}"/></svg>`;
}
function trashSvg(size=14) {
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3M7 7l1 13h8l1-13M10 11v5M14 11v5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>`;
}

function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains('documents')) {
        const docs = db.createObjectStore('documents', { keyPath: 'id' });
        docs.createIndex('createdAt', 'createdAt');
        docs.createIndex('tagIds', 'tagIds', { multiEntry: true });
      }
      if (!db.objectStoreNames.contains('tags')) {
        db.createObjectStore('tags', { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
function dbStore(name, mode='readonly') { return state.db.transaction(name, mode).objectStore(name); }
function dbGetAll(name) {
  return new Promise((resolve, reject) => {
    const req = dbStore(name).getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}
function dbPut(name, value) {
  return new Promise((resolve, reject) => {
    const req = dbStore(name, 'readwrite').put(value);
    req.onsuccess = () => resolve(value);
    req.onerror = () => reject(req.error);
  });
}
function dbDelete(name, key) {
  return new Promise((resolve, reject) => {
    const req = dbStore(name, 'readwrite').delete(key);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

function demoDocument() {
  const html = `<p>Nos últimos anos, quase todos os produtos digitais aprenderam a disputar a nossa atenção. Ler, porém, exige o movimento contrário. Exige continuidade, silêncio e uma certa disposição para permanecer. O design de um bom leitor digital não precisa impressionar a cada segundo; precisa abrir espaço para que a linguagem faça o seu trabalho.</p><p>Uma página confortável cria ritmo por meio de margens amplas, uma coluna de texto generosa e tipografia de alta legibilidade. O leitor deixa de perceber a interface como um conjunto de controles e passa a percebê-la como uma superfície de concentração.</p><h2>Marcar sem interromper</h2><p>Destacar um trecho é uma forma de conversar com o texto. A marcação deve ser rápida, discreta e reversível. Depois, o destaque ganha uma segunda vida no painel de notas.</p>`;
  return {
    id: 'demo',
    title: 'Ler devagar também é uma forma de pensar.',
    type: 'Ensaio',
    dek: 'Uma interface de leitura deve desaparecer o suficiente para que o texto recupere o centro da experiência.',
    label: 'Ensaio · Leitura de 3 min',
    byline: 'Leitura Editorial',
    meta: '14 setembro 2026',
    html,
    textContent: html.replace(/<[^>]+>/g, ' '),
    sourceUrl: '',
    tagIds: [],
    notes: [],
    createdAt: now(),
    updatedAt: now()
  };
}

async function loadData() {
  state.docs = await dbGetAll('documents');
  state.tags = await dbGetAll('tags');
  if (!state.docs.length) {
    const demo = demoDocument();
    await dbPut('documents', demo);
    state.docs = [demo];
  }
  state.docs.sort((a,b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  state.tags.sort((a,b) => a.name.localeCompare(b.name, 'pt-BR'));
}

function activeDoc() { return state.docs.find(d => d.id === state.activeDocId) || null; }
function getTag(id) { return state.tags.find(t => t.id === id) || null; }
function readingMinutes(text) { return Math.max(1, Math.ceil(String(text||'').trim().split(/\s+/).filter(Boolean).length / 220)); }

async function saveDoc(doc) {
  doc.updatedAt = now();
  await dbPut('documents', doc);
  const i = state.docs.findIndex(d => d.id === doc.id);
  if (i >= 0) state.docs[i] = doc; else state.docs.unshift(doc);
  renderSidebar();
}

function renderSidebar() {
  state.docs.sort((a,b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  el('allCount').textContent = state.docs.length;
  el('allTextsNav').classList.toggle('active', state.view === 'library' && !state.activeTagFilter);

  const recent = state.docs.slice(0, RECENT_LIMIT);
  const list = el('docList');
  list.innerHTML = '';
  recent.forEach(doc => {
    const card = document.createElement('div');
    card.className = 'doc-card' + (doc.id === state.activeDocId && state.view === 'reader' ? ' active' : '');
    card.innerHTML = `<div class="doc-title">${escapeHtml(doc.title)}</div><div class="doc-meta">${escapeHtml(doc.type || 'Texto')}</div><button class="doc-delete" title="Excluir texto">${trashSvg()}</button>`;
    card.addEventListener('click', e => { if (!e.target.closest('.doc-delete')) openDocument(doc.id); });
    card.querySelector('.doc-delete').addEventListener('click', e => { e.stopPropagation(); deleteDocument(doc.id); });
    list.appendChild(card);
  });
  el('moreBtn').classList.toggle('hidden', state.docs.length <= RECENT_LIMIT);

  const tagsWrap = el('sidebarTags');
  tagsWrap.innerHTML = '';
  if (!state.tags.length) {
    tagsWrap.innerHTML = '<div style="font-size:11px;color:#929292;padding:5px 9px">Nenhuma etiqueta criada.</div>';
  } else {
    state.tags.forEach(tag => {
      const count = state.docs.filter(d => (d.tagIds || []).includes(tag.id)).length;
      const item = document.createElement('div');
      item.className = 'tag-nav' + (state.view === 'library' && state.activeTagFilter === tag.id ? ' active' : '');
      item.innerHTML = `${tagIconSvg(tag.color)}<span>${escapeHtml(tag.name)}</span><span class="tag-count">${count}</span>`;
      item.addEventListener('click', () => showLibrary(tag.id));
      tagsWrap.appendChild(item);
    });
  }
}

function renderReader(doc) {
  state.view = 'reader';
  state.activeTagFilter = null;
  state.activeDocId = doc.id;
  el('readerActions').style.display = '';
  el('crumb').textContent = `Biblioteca / ${doc.title}`;
  el('mainContent').innerHTML = `
    <article class="article" id="article">
      <div class="article-label">${escapeHtml(doc.label || doc.type || 'Texto')}</div>
      <h1 id="articleTitle">${escapeHtml(doc.title)}</h1>
      <div class="dek">${escapeHtml(doc.dek || 'Texto salvo na sua biblioteca.')}</div>
      <div class="doc-tags-inline" id="docTagsInline"></div>
      <div class="byline"><div class="author-dot"></div><div><strong>${escapeHtml(doc.byline || 'Fonte original')}</strong><br/><span>${escapeHtml(doc.meta || '')}</span></div></div>
      <div class="article-body" id="articleBody" lang="auto">${doc.html || '<p>Sem conteúdo.</p>'}</div>
    </article>`;
  renderInlineTags(doc);
  renderNotes();
  renderSidebar();
  window.scrollTo({top:0, behavior:'smooth'});
}

function renderInlineTags(doc) {
  const wrap = el('docTagsInline');
  if (!wrap) return;
  wrap.innerHTML = '';
  (doc.tagIds || []).map(getTag).filter(Boolean).forEach(tag => {
    const pill = document.createElement('span');
    pill.className = 'doc-tag-pill';
    pill.innerHTML = `${tagIconSvg(tag.color, 12)}<span>${escapeHtml(tag.name)}</span><span class="doc-tag-dot" style="background:${tag.color}"></span>`;
    wrap.appendChild(pill);
  });
}

async function openDocument(id) {
  const doc = state.docs.find(d => d.id === id);
  if (!doc) return;
  renderReader(doc);
}

function showLibrary(tagId=null) {
  state.view = 'library';
  state.activeTagFilter = tagId;
  state.activeDocId = null;
  el('readerActions').style.display = 'none';
  const tag = tagId ? getTag(tagId) : null;
  el('crumb').textContent = tag ? `Biblioteca / ${tag.name}` : 'Biblioteca / Todos os textos';
  el('mainContent').innerHTML = `
    <section class="library-page">
      <div class="library-head">
        <div><div class="library-kicker">Biblioteca</div><h2 class="library-title">${escapeHtml(tag ? tag.name : 'Todos os textos')}</h2></div>
        <input class="library-search" id="librarySearch" placeholder="Pesquisar na biblioteca…" />
      </div>
      <div class="library-grid" id="libraryGrid"></div>
    </section>`;
  el('librarySearch').addEventListener('input', renderLibraryCards);
  renderLibraryCards();
  renderSidebar();
  window.scrollTo({top:0, behavior:'smooth'});
}
