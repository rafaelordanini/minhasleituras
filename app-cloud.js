(() => {
  const DIRTY_DOCS_KEY = 'ml_cloud_dirty_docs';
  const DIRTY_TAGS_KEY = 'ml_cloud_dirty_tags';
  const DELETED_DOCS_KEY = 'ml_cloud_deleted_docs';
  const DELETED_TAGS_KEY = 'ml_cloud_deleted_tags';
  const originalDbPut = window.dbPut;
  const originalDbDelete = window.dbDelete;
  const originalLoadData = window.loadData;
  const docTimers = new Map();
  let hydrating = false;
  let warningAt = 0;

  function storedSet(key) {
    try { return new Set(JSON.parse(localStorage.getItem(key) || '[]')); }
    catch { return new Set(); }
  }

  function writeSet(key, set) {
    try { localStorage.setItem(key, JSON.stringify([...set])); } catch {}
  }

  function addStored(key, id) {
    if (!id) return;
    const set = storedSet(key); set.add(id); writeSet(key, set);
  }

  function removeStored(key, id) {
    if (!id) return;
    const set = storedSet(key); set.delete(id); writeSet(key, set);
  }

  function warnPending() {
    if (Date.now() - warningAt < 12000) return;
    warningAt = Date.now();
    if (typeof toast === 'function') toast('Salvo neste dispositivo. Sincronização com a nuvem pendente.', 4200);
  }

  async function cloudRequest(action, payload = {}) {
    const response = await fetch('/api/library', {
      method: 'POST',
      credentials: 'same-origin',
      cache: 'no-store',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify({ action, ...payload })
    });
    const raw = await response.text();
    let data = {};
    if (raw) {
      try { data = JSON.parse(raw); }
      catch { data = { error: 'Resposta inválida do serviço de sincronização.' }; }
    }
    if (!response.ok || data?.ok === false) {
      throw new Error(errorText(data?.error || data?.message || data, `Falha de sincronização (${response.status}).`));
    }
    return data;
  }

  function sortState() {
    state.docs.sort((a,b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
    state.tags.sort((a,b) => String(a.name || '').localeCompare(String(b.name || ''), 'pt-BR'));
  }

  async function clearStore(name) {
    return new Promise((resolve, reject) => {
      const tx = state.db.transaction(name, 'readwrite');
      const req = tx.objectStore(name).clear();
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  async function hydrateLocal(snapshot) {
    const docs = Array.isArray(snapshot?.docs) ? snapshot.docs : [];
    const tags = Array.isArray(snapshot?.tags) ? snapshot.tags : [];
    hydrating = true;
    try {
      await clearStore('documents');
      await clearStore('tags');
      for (const tag of tags) await originalDbPut('tags', tag);
      for (const doc of docs) await originalDbPut('documents', doc);
      state.docs = docs;
      state.tags = tags;
      sortState();
    } finally {
      hydrating = false;
    }
  }

  async function syncTagNow(tag) {
    if (!tag?.id) return;
    addStored(DIRTY_TAGS_KEY, tag.id);
    try {
      await cloudRequest('upsert_tag', { tag });
      removeStored(DIRTY_TAGS_KEY, tag.id);
      removeStored(DELETED_TAGS_KEY, tag.id);
    } catch (error) {
      console.warn('cloud-tag-sync', error);
      warnPending();
      throw error;
    }
  }

  async function syncDocNow(doc) {
    if (!doc?.id || doc.id === 'demo') return;
    addStored(DIRTY_DOCS_KEY, doc.id);
    try {
      const dirtyTags = storedSet(DIRTY_TAGS_KEY);
      for (const tagId of (doc.tagIds || [])) {
        if (!dirtyTags.has(tagId)) continue;
        const tag = state.tags.find(item => item.id === tagId);
        if (tag) await syncTagNow(JSON.parse(JSON.stringify(tag)));
      }
      await cloudRequest('upsert_doc', { doc });
      removeStored(DIRTY_DOCS_KEY, doc.id);
      removeStored(DELETED_DOCS_KEY, doc.id);
    } catch (error) {
      console.warn('cloud-doc-sync', error);
      warnPending();
      throw error;
    }
  }

  function scheduleDocSync(doc) {
    if (!doc?.id || doc.id === 'demo' || hydrating) return;
    addStored(DIRTY_DOCS_KEY, doc.id);
    const snapshot = JSON.parse(JSON.stringify(doc));
    clearTimeout(docTimers.get(doc.id));
    const timer = setTimeout(async () => {
      docTimers.delete(doc.id);
      try { await syncDocNow(snapshot); } catch {}
    }, 450);
    docTimers.set(doc.id, timer);
  }

  async function syncDeleteDoc(id) {
    if (!id || id === 'demo') return;
    clearTimeout(docTimers.get(id));
    docTimers.delete(id);
    addStored(DELETED_DOCS_KEY, id);
    removeStored(DIRTY_DOCS_KEY, id);
    try {
      await cloudRequest('delete_doc', { clientId: id });
      removeStored(DELETED_DOCS_KEY, id);
    } catch (error) {
      console.warn('cloud-doc-delete', error);
      warnPending();
    }
  }

  async function syncDeleteTag(id) {
    if (!id) return;
    addStored(DELETED_TAGS_KEY, id);
    removeStored(DIRTY_TAGS_KEY, id);
    try {
      await cloudRequest('delete_tag', { clientId: id });
      removeStored(DELETED_TAGS_KEY, id);
    } catch (error) {
      console.warn('cloud-tag-delete', error);
      warnPending();
    }
  }

  async function replayPending(localDocs, localTags) {
    let changed = false;
    for (const id of storedSet(DELETED_DOCS_KEY)) {
      try { await cloudRequest('delete_doc', { clientId: id }); removeStored(DELETED_DOCS_KEY, id); changed = true; }
      catch {}
    }
    for (const id of storedSet(DELETED_TAGS_KEY)) {
      try { await cloudRequest('delete_tag', { clientId: id }); removeStored(DELETED_TAGS_KEY, id); changed = true; }
      catch {}
    }
    for (const id of storedSet(DIRTY_TAGS_KEY)) {
      const tag = localTags.find(item => item.id === id);
      if (!tag) { removeStored(DIRTY_TAGS_KEY, id); continue; }
      try { await cloudRequest('upsert_tag', { tag }); removeStored(DIRTY_TAGS_KEY, id); changed = true; }
      catch {}
    }
    for (const id of storedSet(DIRTY_DOCS_KEY)) {
      const doc = localDocs.find(item => item.id === id);
      if (!doc) { removeStored(DIRTY_DOCS_KEY, id); continue; }
      try { await cloudRequest('upsert_doc', { doc }); removeStored(DIRTY_DOCS_KEY, id); changed = true; }
      catch {}
    }
    return changed;
  }

  async function migrateLocalLibrary(localDocs, localTags) {
    const realDocs = localDocs.filter(doc => doc?.id && doc.id !== 'demo');
    if (!realDocs.length && !localTags.length) return false;
    for (const tag of localTags) await cloudRequest('upsert_tag', { tag });
    for (const doc of realDocs) await cloudRequest('upsert_doc', { doc });
    return true;
  }

  loadData = async function cloudLoadData() {
    const localDocs = await dbGetAll('documents');
    const localTags = await dbGetAll('tags');

    try {
      let snapshot = await cloudRequest('pull');
      const cloudEmpty = !(snapshot.docs || []).length && !(snapshot.tags || []).length;

      if (cloudEmpty) {
        const migrated = await migrateLocalLibrary(localDocs, localTags);
        if (migrated) {
          snapshot = await cloudRequest('pull');
          if (typeof toast === 'function') toast('Biblioteca sincronizada na nuvem', 3200);
        }
      } else {
        const replayed = await replayPending(localDocs, localTags);
        if (replayed) snapshot = await cloudRequest('pull');
      }

      if ((snapshot.docs || []).length || (snapshot.tags || []).length) {
        await hydrateLocal(snapshot);
        return;
      }

      state.docs = localDocs;
      state.tags = localTags;
      if (!state.docs.length) {
        const demo = demoDocument();
        await originalDbPut('documents', demo);
        state.docs = [demo];
      }
      sortState();
    } catch (error) {
      console.warn('cloud-load-fallback', error);
      if (typeof originalLoadData === 'function') {
        await originalLoadData();
      } else {
        state.docs = localDocs;
        state.tags = localTags;
        sortState();
      }
      warnPending();
    }
  };

  dbPut = async function cloudAwarePut(name, value) {
    const result = await originalDbPut(name, value);
    if (hydrating) return result;
    if (name === 'documents') scheduleDocSync(value);
    if (name === 'tags' && value?.id) {
      syncTagNow(JSON.parse(JSON.stringify(value))).catch(() => {});
    }
    return result;
  };

  dbDelete = async function cloudAwareDelete(name, key) {
    const result = await originalDbDelete(name, key);
    if (hydrating) return result;
    if (name === 'documents') syncDeleteDoc(key);
    if (name === 'tags') syncDeleteTag(key);
    return result;
  };

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'hidden') return;
    for (const [id, timer] of docTimers) {
      clearTimeout(timer);
      docTimers.delete(id);
      const doc = state.docs.find(item => item.id === id);
      if (doc) syncDocNow(JSON.parse(JSON.stringify(doc))).catch(() => {});
    }
  });

  window.LeiturCloud = {
    pull: () => cloudRequest('pull'),
    syncDocNow,
    syncTagNow,
    hydrateLocal,
    migrateLocalLibrary
  };
})();
