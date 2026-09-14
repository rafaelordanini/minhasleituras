function renderLibraryCards() {
  const grid = el('libraryGrid');
  if (!grid) return;
  const query = (el('librarySearch')?.value || '').trim().toLowerCase();
  let docs = [...state.docs];
  if (state.activeTagFilter) docs = docs.filter(d => (d.tagIds || []).includes(state.activeTagFilter));
  if (query) docs = docs.filter(d => `${d.title} ${d.dek || ''} ${d.byline || ''}`.toLowerCase().includes(query));
  grid.innerHTML = '';
  if (!docs.length) {
    grid.innerHTML = '<div class="library-empty">Nenhum texto encontrado.</div>';
    return;
  }
  docs.forEach(doc => {
    const card = document.createElement('article');
    card.className = 'library-card';
    const tags = (doc.tagIds || []).map(getTag).filter(Boolean);
    card.innerHTML = `<button class="library-delete" title="Excluir texto">${trashSvg(16)}</button><h3>${escapeHtml(doc.title)}</h3><div class="meta">${escapeHtml(doc.type || 'Texto')}</div><div class="library-card-tags">${tags.map(t => `<span class="doc-tag-pill">${tagIconSvg(t.color,11)}${escapeHtml(t.name)}</span>`).join('')}</div>`;
    card.addEventListener('click', e => { if (!e.target.closest('.library-delete')) openDocument(doc.id); });
    card.querySelector('.library-delete').addEventListener('click', e => { e.stopPropagation(); deleteDocument(doc.id); });
    grid.appendChild(card);
  });
}

async function deleteDocument(id) {
  const doc = state.docs.find(d => d.id === id);
  if (!doc) return;
  if (!confirm(`Excluir “${doc.title}” da biblioteca? Essa ação não pode ser desfeita.`)) return;
  await dbDelete('documents', id);
  state.docs = state.docs.filter(d => d.id !== id);
  if (state.activeDocId === id) state.activeDocId = null;
  renderSidebar();
  if (state.view === 'library') renderLibraryCards();
  else if (state.docs.length) openDocument(state.docs[0].id);
  else showLibrary();
  toast('Texto excluído da biblioteca');
}

function textToParagraphs(text) {
  const clean = String(text || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  if (!clean) return { html:'<p>Arquivo sem texto legível.</p>', clean:'' };
  const chunks = clean.split(/(?<=[.!?])\s+(?=[A-ZÁÉÍÓÚÂÊÔÃÕÇÑ])/).reduce((acc,s) => {
    if (!acc.length || acc[acc.length-1].join(' ').length > 520) acc.push([s]); else acc[acc.length-1].push(s);
    return acc;
  }, []);
  return { html: chunks.map(a => `<p>${escapeHtml(a.join(' '))}</p>`).join(''), clean };
}

async function importFile(file) {
  const raw = await file.text();
  const title = file.name.replace(/\.[^.]+$/, '');
  let html, clean;
  if (/\.html?$/i.test(file.name)) {
    const dom = new DOMParser().parseFromString(raw, 'text/html');
    dom.querySelectorAll('script,style,iframe,object,embed,form').forEach(n => n.remove());
    const root = dom.querySelector('article,main') || dom.body;
    html = root?.innerHTML || '<p>Arquivo sem texto legível.</p>';
    clean = root?.innerText || root?.textContent || '';
  } else ({html, clean} = textToParagraphs(raw));
  const mins = readingMinutes(clean);
  const doc = {id:uid('doc'),title,type:`Arquivo · ${mins} min`,dek:'Documento importado para leitura.',label:`Arquivo · Leitura de ${mins} min`,byline:'Arquivo local',meta:file.name,html,textContent:clean,sourceUrl:'',tagIds:[],notes:[],createdAt:now(),updatedAt:now()};
  await saveDoc(doc);
  openDocument(doc.id);
  toast('Arquivo salvo na biblioteca');
}

function errorText(value, fallback='') {
  if (value == null || value === '') return fallback;
  if (typeof value === 'string') return value;
  if (value instanceof Error && value.message) return errorText(value.message, fallback);
  if (typeof value === 'object') {
    for (const key of ['message','error','detail','description','code']) {
      const nested = errorText(value[key], ''); if (nested) return nested;
    }
    try { const json = JSON.stringify(value); if (json && json !== '{}') return json; } catch {}
    return fallback;
  }
  const text = String(value); return text === '[object Object]' ? fallback : text;
}

async function importUrl(url) {
  const response = await fetch('/api/import?url=' + encodeURIComponent(url), {headers:{Accept:'application/json'}});
  const raw = await response.text();
  let data = {};
  if (raw) { try { data = JSON.parse(raw); } catch { data = {message:raw.slice(0,300)}; } }
  if (!response.ok) throw new Error(errorText(data.error || data.message || data, `Falha ao importar (${response.status}).`));
  if (!data.content || !data.textContent) throw new Error('A API respondeu, mas não devolveu um texto legível.');
  const mins = readingMinutes(data.textContent);
  const host = (() => { try { return new URL(data.url || url).hostname.replace(/^www\./,''); } catch { return data.siteName || 'Página da web'; } })();
  const doc = {id:uid('doc'),title:data.title || host,type:`Link · ${mins} min`,dek:data.excerpt || 'Texto importado de uma página da web.',label:`Texto da web · Leitura de ${mins} min`,byline:data.byline || data.siteName || host,meta:host,html:data.content,textContent:data.textContent,sourceUrl:data.url || url,tagIds:[],notes:[],createdAt:now(),updatedAt:now()};
  await saveDoc(doc);
  openDocument(doc.id);
  return doc;
}

function renderNotes() {
  const doc = activeDoc();
  const notes = doc?.notes || [];
  const query = (el('searchInput').value || '').trim().toLowerCase();
  const filtered = notes.filter(n => !query || `${n.quote} ${n.body || ''}`.toLowerCase().includes(query));
  el('noteCount').textContent = notes.length;
  const list = el('notesList');
  list.innerHTML = '';
  if (!filtered.length) { list.innerHTML = '<div class="empty">Nenhum destaque encontrado.</div>'; return; }
  filtered.forEach(note => {
    const item = document.createElement('div');
    item.className = 'note';
    item.innerHTML = `<div class="quote">“${escapeHtml(note.quote)}”</div><textarea class="note-body" placeholder="Adicionar uma nota…">${escapeHtml(note.body || '')}</textarea><div class="note-bottom"><span></span><button class="delete">Excluir</button></div>`;
    item.querySelector('textarea').addEventListener('input', async e => { note.body = e.target.value; await saveDoc(doc); });
    item.querySelector('.delete').addEventListener('click', async () => { doc.notes = doc.notes.filter(n => n.id !== note.id); await saveDoc(doc); renderNotes(); });
    list.appendChild(item);
  });
}

function captureSelection() {
  if (state.view !== 'reader') return;
  const sel = window.getSelection();
  if (!sel.rangeCount || sel.isCollapsed) { el('floatingHL').style.display = 'none'; return; }
  const range = sel.getRangeAt(0);
  const body = el('articleBody');
  if (!body || !body.contains(range.commonAncestorContainer)) { el('floatingHL').style.display = 'none'; return; }
  state.selectedText = sel.toString().trim();
  if (!state.selectedText) return;
  state.selectedRange = range.cloneRange();
  state.selectionRect = range.getBoundingClientRect();
  const rect = state.selectionRect;
  const box = el('floatingHL');
  box.style.left = Math.min(window.innerWidth - 190, Math.max(12, rect.left + rect.width/2 - 80)) + 'px';
  box.style.top = Math.max(12, rect.top - 48) + 'px';
  box.style.display = 'flex';
  el('translationCard').classList.remove('open');
}

async function highlightSelection() {
  const doc = activeDoc();
  if (!doc || !state.selectedRange || !state.selectedText) return;
  const mark = document.createElement('mark'); mark.className = 'user-highlight';
  try { state.selectedRange.surroundContents(mark); }
  catch {
    try { const fragment = state.selectedRange.extractContents(); mark.appendChild(fragment); state.selectedRange.insertNode(mark); }
    catch { toast('Não foi possível destacar exatamente essa seleção.'); return; }
  }
  doc.html = el('articleBody').innerHTML;
  doc.notes = doc.notes || [];
  doc.notes.unshift({id:uid('note'), quote:state.selectedText, body:'', createdAt:now()});
  await saveDoc(doc);
  renderNotes();
  el('floatingHL').style.display = 'none';
  window.getSelection()?.removeAllRanges();
  toast('Trecho destacado');
}

async function translateSelection() {
  if (!state.selectedText) return;
  const button = el('translateAction');
  const old = button.textContent; button.disabled = true; button.textContent = 'Traduzindo…';
  try {
    const response = await fetch('/api/translate', {method:'POST',headers:{'Content-Type':'application/json','Accept':'application/json'},body:JSON.stringify({text:state.selectedText})});
    const raw = await response.text();
    let data = {}; if (raw) { try { data = JSON.parse(raw); } catch { data = {message:raw.slice(0,300)}; } }
    if (!response.ok) throw new Error(errorText(data.error || data.message || data, 'Não foi possível traduzir.'));
    const card = el('translationCard');
    el('translationText').textContent = data.translatedText || 'Não foi possível traduzir.';
    const rect = state.selectionRect || {left:20,bottom:80,width:0};
    card.style.left = Math.min(window.innerWidth - 435, Math.max(15, rect.left + Math.min(rect.width/2, 180))) + 'px';
    card.style.top = Math.min(window.innerHeight - 180, Math.max(18, rect.bottom + 12)) + 'px';
    card.classList.add('open');
    el('floatingHL').style.display = 'none';
  } catch (err) { toast(errorText(err, 'Não foi possível traduzir esse trecho.'), 5000); }
  finally { button.disabled = false; button.textContent = old; }
}

function openTagModal(returnToPicker=false) {
  state.returnToTagPicker = returnToPicker;
  el('tagNameInput').value = '';
  el('tagColorInput').value = '#315c8c';
  el('tagModal').classList.add('open');
  setTimeout(() => el('tagNameInput').focus(), 50);
}

async function createTag() {
  const name = el('tagNameInput').value.trim();
  const color = el('tagColorInput').value || '#315c8c';
  if (!name) { toast('Digite um nome para a etiqueta.'); return; }
  const existing = state.tags.find(t => t.name.toLowerCase() === name.toLowerCase());
  if (existing) { toast('Já existe uma etiqueta com esse nome.'); return; }
  const tag = {id:uid('tag'), name, color, createdAt:now()};
  await dbPut('tags', tag);
  state.tags.push(tag); state.tags.sort((a,b) => a.name.localeCompare(b.name, 'pt-BR'));
  el('tagModal').classList.remove('open');
  renderSidebar();
  if (state.returnToTagPicker && activeDoc()) {
    const doc = activeDoc();
    doc.tagIds = [...new Set([...(doc.tagIds || []), tag.id])];
    await saveDoc(doc);
    openTagPicker();
    renderInlineTags(doc);
  }
  toast('Etiqueta criada');
}

function openTagPicker() {
  const doc = activeDoc(); if (!doc) return;
  const wrap = el('tagPickerList'); wrap.innerHTML = '';
  if (!state.tags.length) wrap.innerHTML = '<div class="tag-picker-empty">Crie sua primeira etiqueta para organizar este texto.</div>';
  state.tags.forEach(tag => {
    const item = document.createElement('label');
    item.className = 'tag-picker-item';
    const checked = (doc.tagIds || []).includes(tag.id);
    item.innerHTML = `${tagIconSvg(tag.color)}<span>${escapeHtml(tag.name)}</span><input type="checkbox" ${checked ? 'checked' : ''} />`;
    item.querySelector('input').addEventListener('change', async e => {
      const ids = new Set(doc.tagIds || []);
      e.target.checked ? ids.add(tag.id) : ids.delete(tag.id);
      doc.tagIds = [...ids];
      await saveDoc(doc);
      renderInlineTags(doc);
    });
    wrap.appendChild(item);
  });
  el('tagPickerModal').classList.add('open');
}
