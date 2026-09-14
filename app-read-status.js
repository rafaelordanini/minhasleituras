(() => {
  const readValue = doc => Boolean(doc?.isRead);

  function readButton(doc, extraClass='') {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `read-flag ${readValue(doc) ? 'is-read' : ''} ${extraClass}`.trim();
    button.setAttribute('aria-pressed', readValue(doc) ? 'true' : 'false');
    button.title = readValue(doc) ? 'Marcar como não lido' : 'Marcar como lido';
    button.innerHTML = `<span class="read-flag-icon">${readValue(doc) ? '✓' : ''}</span><span>Lido</span>`;
    button.addEventListener('click', async event => {
      event.preventDefault();
      event.stopPropagation();
      await toggleReadStatus(doc.id);
    });
    return button;
  }

  async function toggleReadStatus(id) {
    const doc = state.docs.find(item => item.id === id);
    if (!doc) return;
    doc.isRead = !readValue(doc);
    doc.readAt = doc.isRead ? now() : null;
    await saveDoc(doc);

    if (state.view === 'reader' && state.activeDocId === id) decorateReader(doc);
    if (state.view === 'library') renderLibraryCards();
    toast(doc.isRead ? 'Texto marcado como lido' : 'Texto marcado como não lido');
  }

  function decorateReader(doc) {
    const actions = el('readerActions');
    if (!actions || !doc) return;
    actions.querySelector('#readStatusBtn')?.remove();
    const button = readButton(doc, 'reader-read-flag');
    button.id = 'readStatusBtn';
    actions.prepend(button);
  }

  function decorateSidebar() {
    const cards = [...document.querySelectorAll('#docList .doc-card')];
    const docs = [...state.docs]
      .sort((a,b) => String(b.createdAt).localeCompare(String(a.createdAt)))
      .slice(0, typeof RECENT_LIMIT === 'number' ? RECENT_LIMIT : 5);

    cards.forEach((card, index) => {
      const doc = docs[index];
      if (!doc) return;
      card.querySelector('.read-flag')?.remove();
      const flag = readButton(doc, 'compact-read-flag');
      const meta = card.querySelector('.doc-meta');
      (meta?.parentNode || card).insertBefore(flag, meta ? meta.nextSibling : null);
    });
  }

  function visibleLibraryDocs() {
    const query = (el('librarySearch')?.value || '').trim().toLowerCase();
    let docs = [...state.docs];
    if (state.activeTagFilter) docs = docs.filter(d => (d.tagIds || []).includes(state.activeTagFilter));
    if (query) docs = docs.filter(d => `${d.title} ${d.dek || ''} ${d.byline || ''}`.toLowerCase().includes(query));
    return docs;
  }

  function decorateLibrary() {
    const cards = [...document.querySelectorAll('#libraryGrid .library-card')];
    const docs = visibleLibraryDocs();
    cards.forEach((card, index) => {
      const doc = docs[index];
      if (!doc) return;
      card.querySelector('.read-flag')?.remove();
      card.appendChild(readButton(doc, 'library-read-flag'));
    });
  }

  const originalRenderSidebar = window.renderSidebar;
  if (typeof originalRenderSidebar === 'function') {
    window.renderSidebar = function(...args) {
      const result = originalRenderSidebar.apply(this, args);
      decorateSidebar();
      return result;
    };
  }

  const originalRenderReader = window.renderReader;
  if (typeof originalRenderReader === 'function') {
    window.renderReader = function(doc, ...args) {
      const result = originalRenderReader.call(this, doc, ...args);
      decorateReader(doc);
      return result;
    };
  }

  const originalRenderLibraryCards = window.renderLibraryCards;
  if (typeof originalRenderLibraryCards === 'function') {
    window.renderLibraryCards = function(...args) {
      const result = originalRenderLibraryCards.apply(this, args);
      decorateLibrary();
      return result;
    };
  }

  window.toggleReadStatus = toggleReadStatus;
})();
