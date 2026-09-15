(() => {
  const card = document.getElementById('translationCard');
  const handle = card?.querySelector('.translation-label');
  if (!card || !handle) return;

  const MARGIN = 8;
  let dragging = false;
  let dragMode = null;
  let pointerId = null;
  let offsetX = 0;
  let offsetY = 0;

  function clamp(value, min, max) {
    return Math.min(Math.max(value, min), Math.max(min, max));
  }

  function clampCardToViewport() {
    if (!card.classList.contains('open')) return;
    const rect = card.getBoundingClientRect();
    const maxLeft = window.innerWidth - rect.width - MARGIN;
    const maxTop = window.innerHeight - rect.height - MARGIN;
    const left = clamp(rect.left, MARGIN, maxLeft);
    const top = clamp(rect.top, MARGIN, maxTop);
    card.style.left = `${left}px`;
    card.style.top = `${top}px`;
    card.style.right = 'auto';
    card.style.bottom = 'auto';
  }

  function beginDrag(clientX, clientY, mode, id = null) {
    if (!card.classList.contains('open')) return false;
    const rect = card.getBoundingClientRect();
    dragging = true;
    dragMode = mode;
    pointerId = id;
    offsetX = clientX - rect.left;
    offsetY = clientY - rect.top;
    card.classList.add('is-dragging');
    return true;
  }

  function moveTo(clientX, clientY) {
    if (!dragging) return;
    const rect = card.getBoundingClientRect();
    const maxLeft = window.innerWidth - rect.width - MARGIN;
    const maxTop = window.innerHeight - rect.height - MARGIN;
    const left = clamp(clientX - offsetX, MARGIN, maxLeft);
    const top = clamp(clientY - offsetY, MARGIN, maxTop);
    card.style.left = `${left}px`;
    card.style.top = `${top}px`;
    card.style.right = 'auto';
    card.style.bottom = 'auto';
  }

  function finishDrag() {
    if (!dragging) return;
    dragging = false;
    dragMode = null;
    pointerId = null;
    card.classList.remove('is-dragging');
    clampCardToViewport();
  }

  // Mouse: listeners próprios, mais consistentes entre navegadores desktop e testes reais.
  handle.addEventListener('mousedown', event => {
    if (event.button !== 0) return;
    if (!beginDrag(event.clientX, event.clientY, 'mouse')) return;
    event.preventDefault();
  });
  document.addEventListener('mousemove', event => {
    if (!dragging || dragMode !== 'mouse') return;
    moveTo(event.clientX, event.clientY);
    event.preventDefault();
  }, { capture:true, passive:false });
  document.addEventListener('mouseup', () => {
    if (dragging && dragMode === 'mouse') finishDrag();
  }, true);

  // Toque/caneta: Pointer Events preservam um gesto único e evitam rolar a página durante o arraste.
  handle.addEventListener('pointerdown', event => {
    if (event.pointerType === 'mouse') return;
    if (event.button !== undefined && event.button !== 0) return;
    if (!beginDrag(event.clientX, event.clientY, 'pointer', event.pointerId)) return;
    try { handle.setPointerCapture?.(event.pointerId); } catch {}
    event.preventDefault();
  });
  document.addEventListener('pointermove', event => {
    if (!dragging || dragMode !== 'pointer' || event.pointerId !== pointerId) return;
    moveTo(event.clientX, event.clientY);
    event.preventDefault();
  }, { capture:true, passive:false });
  document.addEventListener('pointerup', event => {
    if (!dragging || dragMode !== 'pointer' || event.pointerId !== pointerId) return;
    try { handle.releasePointerCapture?.(pointerId); } catch {}
    finishDrag();
  }, true);
  document.addEventListener('pointercancel', event => {
    if (!dragging || dragMode !== 'pointer' || event.pointerId !== pointerId) return;
    finishDrag();
  }, true);

  window.addEventListener('resize', () => requestAnimationFrame(clampCardToViewport));
  window.addEventListener('orientationchange', () => setTimeout(clampCardToViewport, 100));

  const observer = new MutationObserver(mutations => {
    if (!mutations.some(m => m.attributeName === 'class')) return;
    if (card.classList.contains('open')) {
      requestAnimationFrame(() => requestAnimationFrame(clampCardToViewport));
    } else if (dragging) {
      finishDrag();
    }
  });
  observer.observe(card, { attributes:true, attributeFilter:['class'] });

  window.LeiturTranslationDrag = {
    clamp: clampCardToViewport,
    isDragging: () => dragging,
    mode: () => dragMode
  };
})();
