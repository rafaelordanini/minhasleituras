(() => {
  const FIX_VERSION = '20260914-validated-1';
  const BLOCK_SELECTOR = 'p,div,section,article,li,blockquote,dd,dt';
  const LEFT_SELECTOR = 'h1,h2,h3,h4,h5,h6,pre,code,table,th,td';

  function setImportant(node, property, value) {
    if (!node || !node.style) return;
    node.style.setProperty(property, value, 'important');
  }

  function applyReadingPresentation() {
    const body = document.getElementById('articleBody');
    if (!body) return false;

    setImportant(body, 'text-align', 'justify');
    setImportant(body, 'text-justify', 'inter-word');
    setImportant(body, 'user-select', 'text');
    setImportant(body, '-webkit-user-select', 'text');

    body.querySelectorAll(BLOCK_SELECTOR).forEach(node => {
      node.removeAttribute('align');
      setImportant(node, 'text-align', 'justify');
      setImportant(node, 'text-justify', 'inter-word');
      setImportant(node, 'user-select', 'text');
      setImportant(node, '-webkit-user-select', 'text');
    });

    body.querySelectorAll('*').forEach(node => {
      setImportant(node, 'user-select', 'text');
      setImportant(node, '-webkit-user-select', 'text');
      if (node.hasAttribute('contenteditable')) node.removeAttribute('contenteditable');
      if (node.hasAttribute('draggable')) node.removeAttribute('draggable');
    });

    body.querySelectorAll(LEFT_SELECTOR).forEach(node => {
      setImportant(node, 'text-align', 'left');
    });

    return true;
  }

  function isInside(body, node) {
    if (!body || !node) return false;
    return node === body || body.contains(node.nodeType === Node.TEXT_NODE ? node.parentNode : node);
  }

  function getSelectionRect(range) {
    const rects = Array.from(range.getClientRects()).filter(r => r.width > 0 || r.height > 0);
    if (rects.length) return rects[rects.length - 1];
    return range.getBoundingClientRect();
  }

  function captureSelectionFixed() {
    try {
      if (typeof state !== 'undefined' && state.view !== 'reader') return false;
      const body = document.getElementById('articleBody');
      const selection = window.getSelection();
      if (!body || !selection || !selection.rangeCount || selection.isCollapsed) return false;

      const range = selection.getRangeAt(0);
      if (!isInside(body, range.startContainer) || !isInside(body, range.endContainer)) return false;

      const selectedText = selection.toString().replace(/\s+/g, ' ').trim();
      if (!selectedText) return false;

      const rect = getSelectionRect(range);
      if (!rect) return false;

      if (typeof state !== 'undefined') {
        state.selectedText = selectedText;
        state.selectedRange = range.cloneRange();
        state.selectionRect = rect;
      }

      const tools = document.getElementById('floatingHL');
      if (!tools) return false;

      const desiredWidth = tools.offsetWidth || 176;
      const left = Math.max(12, Math.min(window.innerWidth - desiredWidth - 12, rect.left + rect.width / 2 - desiredWidth / 2));
      const top = rect.top > 58 ? rect.top - 48 : Math.min(window.innerHeight - 48, rect.bottom + 10);

      tools.style.left = `${left}px`;
      tools.style.top = `${Math.max(12, top)}px`;
      tools.classList.add('selection-tools-visible');
      tools.style.setProperty('display', 'flex', 'important');

      const card = document.getElementById('translationCard');
      if (card) card.classList.remove('open');
      return true;
    } catch (error) {
      console.error('selection capture failed', error);
      return false;
    }
  }

  function hideSelectionTools() {
    const tools = document.getElementById('floatingHL');
    if (!tools) return;
    tools.classList.remove('selection-tools-visible');
    tools.style.removeProperty('display');
  }

  let selectionTimer;
  function scheduleSelectionCapture(delay = 0) {
    clearTimeout(selectionTimer);
    selectionTimer = setTimeout(() => {
      requestAnimationFrame(() => captureSelectionFixed());
    }, delay);
  }

  // Substitui a função global usada pelos listeners já existentes.
  window.captureSelection = captureSelectionFixed;
  window.applyReadingPresentation = applyReadingPresentation;

  const main = document.getElementById('mainContent');
  if (main) {
    main.addEventListener('mouseup', event => {
      if (event.button !== undefined && event.button !== 0) return;
      scheduleSelectionCapture(0);
    }, true);
    main.addEventListener('pointerup', event => {
      if (event.pointerType === 'mouse' && event.button !== 0) return;
      scheduleSelectionCapture(0);
    }, true);
    main.addEventListener('touchend', () => scheduleSelectionCapture(80), { passive: true, capture: true });

    const observer = new MutationObserver(() => {
      requestAnimationFrame(applyReadingPresentation);
    });
    observer.observe(main, { childList: true, subtree: true });
  }

  document.addEventListener('keyup', event => {
    if (event.key === 'Shift' || event.key.startsWith('Arrow')) scheduleSelectionCapture(0);
  }, true);

  document.addEventListener('selectionchange', () => {
    const selection = window.getSelection();
    if (selection && !selection.isCollapsed && selection.rangeCount) scheduleSelectionCapture(20);
  });

  document.addEventListener('mousedown', event => {
    if (event.target.closest?.('#floatingHL') || event.target.closest?.('#translationCard')) return;
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed) hideSelectionTools();
  }, true);

  ['highlightAction', 'translateAction'].forEach(id => {
    const button = document.getElementById(id);
    if (!button) return;
    button.addEventListener('pointerdown', event => event.preventDefault(), true);
    button.addEventListener('mousedown', event => event.preventDefault(), true);
  });

  requestAnimationFrame(applyReadingPresentation);

  window.__LEITURA_FIX_SELFTEST__ = () => {
    const body = document.getElementById('articleBody');
    const sample = body?.querySelector('p,div,li,blockquote') || body;
    const tools = document.getElementById('floatingHL');
    return {
      version: FIX_VERSION,
      hasArticleBody: Boolean(body),
      computedTextAlign: sample ? getComputedStyle(sample).textAlign : null,
      computedUserSelect: sample ? getComputedStyle(sample).userSelect : null,
      captureSelectionType: typeof window.captureSelection,
      toolsPresent: Boolean(tools)
    };
  };
})();
