function setupEvents() {
  el('uploadBtn').addEventListener('click', () => el('fileInput').click());
  el('fileInput').addEventListener('change', async e => { const f = e.target.files[0]; if (f) { await importFile(f); e.target.value = ''; } });
  el('linkBtn').addEventListener('click', () => { el('urlModal').classList.add('open'); setTimeout(() => el('urlInput').focus(), 50); });
  el('newBtn').addEventListener('click', () => { el('urlModal').classList.add('open'); setTimeout(() => el('urlInput').focus(), 50); });
  el('urlInput').addEventListener('keydown', e => { if (e.key === 'Enter') el('importUrl').click(); });
  el('importUrl').addEventListener('click', async () => {
    const url = el('urlInput').value.trim(); if (!url) return;
    const btn = el('importUrl'), old = btn.textContent; btn.disabled = true; btn.textContent = 'Importando…';
    try { await importUrl(url); el('urlModal').classList.remove('open'); el('urlInput').value = ''; toast('Link salvo na biblioteca'); }
    catch (err) { toast(errorText(err, 'Não foi possível importar esse link.'), 6000); }
    finally { btn.disabled = false; btn.textContent = old; }
  });
  document.querySelectorAll('[data-close]').forEach(btn => btn.addEventListener('click', () => el(btn.dataset.close).classList.remove('open')));
  el('allTextsNav').addEventListener('click', () => showLibrary());
  el('moreBtn').addEventListener('click', () => showLibrary());
  el('addTagBtn').addEventListener('click', () => openTagModal(false));
  el('saveTagBtn').addEventListener('click', createTag);
  el('tagNameInput').addEventListener('keydown', e => { if (e.key === 'Enter') createTag(); });
  el('tagDocBtn').addEventListener('click', openTagPicker);
  el('createTagFromPicker').addEventListener('click', () => { el('tagPickerModal').classList.remove('open'); openTagModal(true); });
  el('searchInput').addEventListener('input', renderNotes);
  el('notesToggle').addEventListener('click', () => el('rightPanel').classList.add('open'));
  el('closeNotes').addEventListener('click', () => el('rightPanel').classList.remove('open'));
  el('highlightAction').addEventListener('click', highlightSelection);
  el('translateAction').addEventListener('click', translateSelection);
  el('translationClose').addEventListener('click', () => el('translationCard').classList.remove('open'));
  document.addEventListener('mouseup', () => setTimeout(captureSelection, 0));
  document.addEventListener('scroll', () => { el('floatingHL').style.display = 'none'; }, true);
  el('listenBtn').addEventListener('click', () => {
    const doc = activeDoc(); const body = el('articleBody'); if (!doc || !body) return;
    if (!('speechSynthesis' in window)) { toast('Áudio não suportado neste navegador'); return; }
    if (state.speaking) { speechSynthesis.cancel(); state.speaking = false; el('listenBtn').textContent = '▶ Ouvir'; return; }
    const u = new SpeechSynthesisUtterance(`${doc.title}. ${body.innerText}`); u.lang = 'pt-BR';
    u.onend = () => { state.speaking = false; el('listenBtn').textContent = '▶ Ouvir'; };
    speechSynthesis.speak(u); state.speaking = true; el('listenBtn').textContent = '■ Parar';
  });
  el('focusBtn').addEventListener('click', () => {
    state.focus = !state.focus;
    el('leftPanel').style.display = state.focus ? 'none' : '';
    el('rightPanel').style.display = state.focus ? 'none' : '';
    el('app').style.gridTemplateColumns = state.focus ? '1fr' : '';
    el('focusBtn').textContent = state.focus ? 'Sair do foco' : 'Foco';
  });
  window.addEventListener('scroll', () => {
    const max = document.documentElement.scrollHeight - window.innerHeight;
    const pct = max > 0 ? window.scrollY / max * 100 : 0;
    el('progressBar').style.width = Math.max(3, pct) + '%';
  });
}

async function init() {
  try {
    state.db = await openDB();
    await loadData();
    setupEvents();
    renderSidebar();
    const first = state.docs[0];
    if (first) openDocument(first.id); else showLibrary();
  } catch (err) {
    console.error(err);
    toast('Não foi possível abrir a base local do Leitura.', 6000);
  }
}

init();
