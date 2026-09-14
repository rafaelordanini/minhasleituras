(() => {
  const normalizeHighlightText = value => String(value || '').replace(/\s+/g, ' ').trim();

  function findHighlightMark(note) {
    const body = el('articleBody');
    if (!body) return null;
    const marks = Array.from(body.querySelectorAll('mark.user-highlight'));

    if (note?.highlightId) {
      const exact = marks.find(mark => mark.dataset.highlightId === note.highlightId);
      if (exact) return exact;
    }

    // Compatibilidade com destaques criados antes de existir um ID de vínculo.
    const quote = normalizeHighlightText(note?.quote);
    if (!quote) return null;
    return marks.find(mark => normalizeHighlightText(mark.textContent) === quote) || null;
  }

  function unwrapHighlight(mark) {
    if (!mark?.parentNode) return false;
    const parent = mark.parentNode;
    while (mark.firstChild) parent.insertBefore(mark.firstChild, mark);
    mark.remove();
    parent.normalize();
    return true;
  }

  async function removeHighlight(note, doc) {
    const mark = findHighlightMark(note);
    if (mark) unwrapHighlight(mark);

    const body = el('articleBody');
    if (body) doc.html = body.innerHTML;
    doc.notes = (doc.notes || []).filter(item => item.id !== note.id);

    await saveDoc(doc);
    renderNotes();
    toast(mark ? 'Destaque excluído' : 'Registro do destaque excluído');
  }

  highlightSelection = async function () {
    const doc = activeDoc();
    if (!doc || !state.selectedRange || !state.selectedText) return;

    const highlightId = uid('hl');
    const mark = document.createElement('mark');
    mark.className = 'user-highlight';
    mark.dataset.highlightId = highlightId;

    try {
      state.selectedRange.surroundContents(mark);
    } catch {
      try {
        const fragment = state.selectedRange.extractContents();
        mark.appendChild(fragment);
        state.selectedRange.insertNode(mark);
      } catch {
        toast('Não foi possível destacar exatamente essa seleção.');
        return;
      }
    }

    doc.html = el('articleBody').innerHTML;
    doc.notes = doc.notes || [];
    doc.notes.unshift({
      id: uid('note'),
      highlightId,
      quote: state.selectedText,
      body: '',
      createdAt: now()
    });

    await saveDoc(doc);
    renderNotes();
    el('floatingHL').style.display = 'none';
    window.getSelection()?.removeAllRanges();
    toast('Trecho destacado');
  };

  renderNotes = function () {
    const doc = activeDoc();
    const notes = doc?.notes || [];
    const query = (el('searchInput').value || '').trim().toLowerCase();
    const filtered = notes.filter(note => !query || `${note.quote} ${note.body || ''}`.toLowerCase().includes(query));

    el('noteCount').textContent = notes.length;
    const list = el('notesList');
    list.innerHTML = '';

    if (!filtered.length) {
      list.innerHTML = '<div class="empty">Nenhum destaque encontrado.</div>';
      return;
    }

    filtered.forEach(note => {
      const item = document.createElement('div');
      item.className = 'note';
      item.innerHTML = `<div class="quote">“${escapeHtml(note.quote)}”</div><textarea class="note-body" placeholder="Adicionar uma nota…">${escapeHtml(note.body || '')}</textarea><div class="note-bottom"><span></span><button class="delete">Excluir</button></div>`;

      item.querySelector('textarea').addEventListener('input', async event => {
        note.body = event.target.value;
        await saveDoc(doc);
      });

      item.querySelector('.delete').addEventListener('click', () => removeHighlight(note, doc));
      list.appendChild(item);
    });
  };
})();