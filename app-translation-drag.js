(() => {
  const card = document.getElementById('translationCard');
  const handle = card?.querySelector('.translation-label');
  if (!card || !handle) return;

  const MARGIN = 8;
  let dragging = false;
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

  function startDrag(event) {
    if (event.button !== undefined && event.button !== 0) return;
    if (!card.classList.contains('open')) return;
    const rect = card.getBoundingClientRect();
    dragging = true;
    pointerId = event.pointerId;
    offsetX = event.clientX - rect.left;
    offsetY = event.clientY - rect.top;
    card.classList.add('is-dragging');
    try { handle.setPointerCapture?.(event.pointerId); } catch {}
    event.preventDefault();
  }

  function moveDrag(event) {
    if (!dragging || (pointerId !== null && event.pointerId !== pointerId)) return;
    const rect = card.getBoundingClientRect();
    const maxLeft = window.innerWidth - rect.width - MARGIN;
    const maxTop = window.innerHeight - rect.height - MARGIN;
    const left = clamp(event.clientX - offsetX, MARGIN, maxLeft);
    const top = clamp(event.clientY - offsetY, MARGIN, maxTop);
    card.style.left = `${left}px`;
    card.style.top = `${top}px`;
    card.style.right = 'auto';
    card.style.bottom = 'auto';
    event.preventDefault();
  }

  function endDrag(event) {
    if (!dragging) return;
    if (pointerId !== null && event.pointerId !== undefined && event.pointerId !== pointerId) return;
    dragging = false;
    try { handle.releasePointerCapture?.(pointerId); } catch {}
    pointerId = null;
    card.classList.remove('is-dragging');
    clampCardToViewport();
  }

  handle.addEventListener('pointerdown', startDrag);
  document.addEventListener('pointermove', moveDrag, {capture:true, passive:false});
  document.addEventListener('pointerup', endDrag, true);
  document.addEventListener('pointercancel', endDrag, true);

  window.addEventListener('resize', () => requestAnimationFrame(clampCardToViewport));
  window.addEventListener('orientationchange', () => setTimeout(clampCardToViewport, 100));

  const observer = new MutationObserver(mutations => {
    if (!mutations.some(m => m.attributeName === 'class')) return;
    if (card.classList.contains('open')) {
      requestAnimationFrame(() => requestAnimationFrame(clampCardToViewport));
    }
  });
  observer.observe(card, { attributes:true, attributeFilter:['class'] });

  window.LeiturTranslationDrag = {
    clamp: clampCardToViewport,
    isDragging: () => dragging
  };
})();
