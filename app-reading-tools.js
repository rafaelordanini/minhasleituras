(() => {
  const isUnread = doc => !Boolean(doc?.isRead);
  const markerSelector = '[data-reading-marker="true"]';

  state.readingListOnly = false;
  state.markerPlacementMode = false;

  function unreadDocs() {
    return state.docs.filter(isUnread);
  }

  function updateReadingListNav() {
    const nav = el('readingListNav');
    const count = el('readingListCount');
    if (!nav || !count) return;
    count.textContent = unreadDocs().length;
    nav.classList.toggle('active', Boolean(state.readingListOnly && state.view === 'library'));
  }

  const previousRenderSidebar = window.renderSidebar;
  if (typeof previousRenderSidebar === 'function') {
    window.renderSidebar = function(...args) {
      const result = previousRenderSidebar.apply(this, args);
      updateReadingListNav();
      return result;
    };
  }

  const previousRenderLibraryCards = window.renderLibraryCards;
  if (typeof previousRenderLibraryCards === 'function') {
    window.renderLibraryCards = function(...args) {
      if (!state.readingListOnly) return previousRenderLibraryCards.apply(this, args);
      const allDocs = state.docs;
      state.docs = allDocs.filter(isUnread);
      try {
        const result = previousRenderLibraryCards.apply(this, args);
        const page = document.querySelector('.library-page');
        page?.classList.add('reading-list-view');
        const empty = document.querySelector('#libraryGrid .library-empty');
        if (empty) empty.textContent = 'Sua lista de leitura está vazia.';
        return result;
      } finally {
        state.docs = allDocs;
      }
    };
  }

  const baseShowLibrary = window.showLibrary;
  if (typeof baseShowLibrary === 'function') {
    window.showLibrary = function(tagId = null) {
      state.readingListOnly = false;
      const result = baseShowLibrary.call(this, tagId);
      updateReadingListNav();
      return result;
    };
  }

  function showReadingList() {
    if (typeof baseShowLibrary !== 'function') return;
    state.readingListOnly = true;
    state.activeTagFilter = null;
    baseShowLibrary.call(window, null);
    state.readingListOnly = true;
    el('crumb').textContent = 'Biblioteca / Lista de leitura';
    const title = document.querySelector('.library-title');
    if (title) title.textContent = 'Lista de leitura';
    document.querySelector('.library-page')?.classList.add('reading-list-view');
    window.renderLibraryCards();
    updateReadingListNav();
  }

  function docHasMarker(doc) {
    return Boolean(doc?.readingMarker || String(doc?.html || '').includes('data-reading-marker="true"'));
  }

  function getCurrentMarker() {
    return el('articleBody')?.querySelector(markerSelector) || null;
  }

  function cancelMarkerPlacement() {
    state.markerPlacementMode = false;
    el('articleBody')?.classList.remove('marker-placement-mode');
    const button = el('placeMarkerBtn');
    if (button) {
      button.classList.remove('is-active');
      button.innerHTML = '🔖 <span>Marcar posição</span>';
      button.setAttribute('aria-pressed', 'false');
    }
  }

  async function consumeMarker(doc, marker) {
    if (!doc || !marker) return;
    const body = el('articleBody');
    if (!body) return;

    const targetY = Math.max(0, marker.getBoundingClientRect().top + window.scrollY - window.innerHeight * 0.42);
    window.scrollTo({ top: targetY, behavior: 'smooth' });

    const parent = marker.parentNode;
    marker.remove();
    parent?.normalize?.();
    doc.readingMarker = null;
    doc.readingMarkerAt = null;
    doc.html = body.innerHTML;
    await saveDoc(doc);
    decorateReaderMarkerControls(doc);
    toast('Leitura retomada. Marcador removido.');
  }

  function decorateReaderMarkerControls(doc) {
    const actions = el('readerActions');
    if (!actions || !doc) return;
    actions.querySelector('#placeMarkerBtn')?.remove();
    actions.querySelector('#resumeMarkerBtn')?.remove();

    const place = document.createElement('button');
    place.type = 'button';
    place.id = 'placeMarkerBtn';
    place.className = 'icon-btn marker-action';
    place.setAttribute('aria-pressed', 'false');
    place.title = docHasMarker(doc) ? 'Reposicionar marcador de leitura' : 'Inserir marcador de leitura';
    place.innerHTML = '🔖 <span>Marcar posição</span>';
    place.addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();
      const body = el('articleBody');
      if (!body) return;
      state.markerPlacementMode = !state.markerPlacementMode;
      body.classList.toggle('marker-placement-mode', state.markerPlacementMode);
      place.classList.toggle('is-active', state.markerPlacementMode);
      place.setAttribute('aria-pressed', state.markerPlacementMode ? 'true' : 'false');
      place.innerHTML = state.markerPlacementMode ? '● <span>Clique no texto…</span>' : '🔖 <span>Marcar posição</span>';
      if (state.markerPlacementMode) {
        el('floatingHL').style.display = 'none';
        toast('Clique no ponto exato do texto onde deseja deixar o marcador.');
      }
    });

    const listen = el('listenBtn');
    actions.insertBefore(place, listen || actions.firstChild);

    if (docHasMarker(doc)) {
      const resume = document.createElement('button');
      resume.type = 'button';
      resume.id = 'resumeMarkerBtn';
      resume.className = 'icon-btn marker-resume';
      resume.title = 'Retomar daqui e remover o marcador';
      resume.innerHTML = '↳ <span>Retomar</span>';
      resume.addEventListener('click', async event => {
        event.preventDefault();
        event.stopPropagation();
        const marker = getCurrentMarker();
        if (!marker) {
          doc.readingMarker = null;
          doc.readingMarkerAt = null;
          await saveDoc(doc);
          decorateReaderMarkerControls(doc);
          toast('O marcador salvo não existe mais neste texto.');
          return;
        }
        await consumeMarker(doc, marker);
      });
      actions.insertBefore(resume, listen || actions.firstChild);
    }
  }

  function rangeFromPoint(x, y) {
    if (typeof document.caretRangeFromPoint === 'function') {
      return document.caretRangeFromPoint(x, y);
    }
    if (typeof document.caretPositionFromPoint === 'function') {
      const position = document.caretPositionFromPoint(x, y);
      if (!position) return null;
      const range = document.createRange();
      range.setStart(position.offsetNode, position.offset);
      range.collapse(true);
      return range;
    }
    return null;
  }

  async function placeMarkerAtPoint(event) {
    if (!state.markerPlacementMode || state.view !== 'reader') return;
    const body = el('articleBody');
    const doc = activeDoc();
    if (!body || !doc || !body.contains(event.target)) return;

    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation?.();

    let range = rangeFromPoint(event.clientX, event.clientY);
    if (!range || !body.contains(range.startContainer)) {
      const target = event.target.closest?.('p,li,blockquote,h2,h3,h4') || event.target;
      const node = target?.firstChild || target;
      if (!node || !body.contains(node)) {
        toast('Não consegui posicionar o marcador nesse ponto.');
        return;
      }
      range = document.createRange();
      if (node.nodeType === Node.TEXT_NODE) range.setStart(node, 0);
      else range.setStart(node, 0);
      range.collapse(true);
    }

    body.querySelectorAll(markerSelector).forEach(marker => marker.remove());

    const markerId = `marker_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const marker = document.createElement('span');
    marker.className = 'reading-marker';
    marker.dataset.readingMarker = 'true';
    marker.dataset.markerId = markerId;
    marker.setAttribute('aria-label', 'Marcador de retomada de leitura');
    marker.setAttribute('title', 'Marcador de retomada');
    range.insertNode(marker);

    doc.readingMarker = { id: markerId, createdAt: now() };
    doc.readingMarkerAt = now();
    doc.html = body.innerHTML;
    await saveDoc(doc);

    cancelMarkerPlacement();
    decorateReaderMarkerControls(doc);
    el('floatingHL').style.display = 'none';
    window.getSelection()?.removeAllRanges();
    toast('Marcador salvo. Use “Retomar” para voltar a este ponto.');
  }

  const previousRenderReader = window.renderReader;
  if (typeof previousRenderReader === 'function') {
    window.renderReader = function(doc, ...args) {
      state.markerPlacementMode = false;
      const result = previousRenderReader.call(this, doc, ...args);
      decorateReaderMarkerControls(doc);
      return result;
    };
  }

  el('readingListNav')?.addEventListener('click', showReadingList);
  document.addEventListener('click', placeMarkerAtPoint, true);
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && state.markerPlacementMode) {
      cancelMarkerPlacement();
      toast('Posicionamento do marcador cancelado.');
    }
  });

  window.showReadingList = showReadingList;
  window.placeReadingMarkerAtPoint = placeMarkerAtPoint;
})();
