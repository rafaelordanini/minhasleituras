(() => {
  let editingDocId = null;
  const allowedTags = new Set(['P','DIV','BR','H2','H3','H4','BLOCKQUOTE','UL','OL','LI','PRE','CODE','EM','STRONG','B','I','A','HR','MARK','SPAN']);
  const dropTags = new Set(['SCRIPT','STYLE','IFRAME','OBJECT','EMBED','FORM','META','LINK','SVG','MATH','VIDEO','AUDIO','SOURCE']);

  function safeHref(value) {
    const href = String(value || '').trim();
    if (!href) return '';
    if (/^(https?:|mailto:)/i.test(href)) return href;
    return '';
  }

  function sanitizeEditorHtml(input) {
    const doc = new DOMParser().parseFromString(`<div id="editorSanitizeRoot">${String(input || '')}</div>`, 'text/html');
    const root = doc.getElementById('editorSanitizeRoot');
    if (!root) return '<p></p>';

    function clean(node) {
      Array.from(node.children || []).forEach(clean);
      if (node === root || node.nodeType !== 1) return;
      const tag = node.tagName;
      if (dropTags.has(tag)) {
        node.remove();
        return;
      }
      if (!allowedTags.has(tag)) {
        node.replaceWith(...Array.from(node.childNodes));
        return;
      }

      const keep = {};
      if (tag === 'A') {
        const href = safeHref(node.getAttribute('href'));
        if (href) keep.href = href;
      }
      if (tag === 'MARK' && node.classList.contains('user-highlight')) {
        keep.class = 'user-highlight';
        const id = node.getAttribute('data-highlight-id');
        if (id) keep['data-highlight-id'] = id;
      }
      if (tag === 'SPAN' && node.getAttribute('data-reading-marker') === 'true') {
        keep.class = 'reading-marker';
        keep['data-reading-marker'] = 'true';
        const markerId = node.getAttribute('data-marker-id');
        if (markerId) keep['data-marker-id'] = markerId;
        keep['aria-label'] = 'Marcador de retomada de leitura';
        keep.title = 'Marcador de retomada';
      }
      Array.from(node.attributes).forEach(attr => node.removeAttribute(attr.name));
      Object.entries(keep).forEach(([name,value]) => node.setAttribute(name,value));
    }

    clean(root);
    const html = root.innerHTML.trim();
    return html || '<p></p>';
  }

  function editorText(html) {
    const box = document.createElement('div');
    box.innerHTML = html;
    return (box.innerText || box.textContent || '').replace(/\s+/g, ' ').trim();
  }

  function openTextEditor(docId = null) {
    const modal = el('textEditorModal');
    const title = el('editorTitleInput');
    const subtitle = el('editorSubtitleInput');
    const content = el('editorContent');
    const heading = el('editorModalTitle');
    if (!modal || !title || !subtitle || !content || !heading) return;

    const doc = docId ? state.docs.find(item => item.id === docId) : null;
    editingDocId = doc?.id || null;
    heading.textContent = doc ? 'Editar texto' : 'Adicionar texto manualmente';
    title.value = doc?.title || '';
    subtitle.value = doc?.subtitle ?? doc?.dek ?? '';
    content.innerHTML = doc?.html || '';
    modal.classList.add('open');
    setTimeout(() => title.focus(), 40);
  }

  function closeTextEditor() {
    el('textEditorModal')?.classList.remove('open');
    editingDocId = null;
  }

  function refreshReadingLabels(doc, mins) {
    const prefix = String(doc.type || 'Texto').split('·')[0].trim() || 'Texto';
    doc.type = `${prefix} · ${mins} min`;
    if (String(doc.label || '').includes('Leitura de') || !doc.label) {
      const labelPrefix = String(doc.label || prefix).split('·')[0].trim() || prefix;
      doc.label = `${labelPrefix} · Leitura de ${mins} min`;
    }
  }

  async function saveTextEditor() {
    const title = el('editorTitleInput')?.value.trim() || '';
    const subtitle = el('editorSubtitleInput')?.value.trim() || '';
    const rawHtml = el('editorContent')?.innerHTML || '';
    const html = sanitizeEditorHtml(rawHtml);
    const textContent = editorText(html);

    if (!title) {
      toast('Informe um título para o texto.');
      el('editorTitleInput')?.focus();
      return null;
    }
    if (!textContent) {
      toast('Digite o conteúdo do texto.');
      el('editorContent')?.focus();
      return null;
    }

    const wasEditing = Boolean(editingDocId);
    const mins = readingMinutes(textContent);
    let doc = editingDocId ? state.docs.find(item => item.id === editingDocId) : null;
    if (doc) {
      doc.title = title;
      doc.subtitle = subtitle;
      doc.dek = subtitle;
      doc.html = html;
      doc.textContent = textContent;
      refreshReadingLabels(doc, mins);
    } else {
      doc = {
        id: uid('doc'),
        title,
        subtitle,
        type: `Manual · ${mins} min`,
        dek: subtitle,
        label: `Texto manual · Leitura de ${mins} min`,
        byline: '',
        meta: '',
        html,
        textContent,
        sourceUrl: '',
        sourceType: 'manual',
        tagIds: [],
        notes: [],
        isRead: false,
        readAt: null,
        createdAt: now(),
        updatedAt: now()
      };
    }

    await saveDoc(doc);
    closeTextEditor();
    openDocument(doc.id);
    toast(wasEditing ? 'Alterações salvas' : 'Texto salvo na biblioteca');
    return doc;
  }

  const originalRenderReader = window.renderReader;
  if (typeof originalRenderReader === 'function') {
    window.renderReader = function(doc, ...args) {
      const result = originalRenderReader.call(this, doc, ...args);
      const dek = document.querySelector('.dek');
      if (dek) dek.textContent = doc.subtitle ?? doc.dek ?? '';
      const editBtn = el('editDocBtn');
      if (editBtn) editBtn.style.display = '';
      return result;
    };
  }

  const originalShowLibrary = window.showLibrary;
  if (typeof originalShowLibrary === 'function') {
    window.showLibrary = function(...args) {
      const result = originalShowLibrary.apply(this, args);
      const editBtn = el('editDocBtn');
      if (editBtn) editBtn.style.display = 'none';
      return result;
    };
  }

  el('manualBtn')?.addEventListener('click', () => openTextEditor());
  el('editDocBtn')?.addEventListener('click', () => {
    const doc = activeDoc();
    if (doc) openTextEditor(doc.id);
  });
  el('saveTextEditorBtn')?.addEventListener('click', saveTextEditor);
  el('cancelTextEditorBtn')?.addEventListener('click', closeTextEditor);
  el('textEditorModal')?.addEventListener('click', event => {
    if (event.target === el('textEditorModal')) closeTextEditor();
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && el('textEditorModal')?.classList.contains('open')) closeTextEditor();
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's' && el('textEditorModal')?.classList.contains('open')) {
      event.preventDefault();
      saveTextEditor();
    }
  });

  window.LeiturEditor = { openTextEditor, closeTextEditor, saveTextEditor, sanitizeEditorHtml, editorText };
})();