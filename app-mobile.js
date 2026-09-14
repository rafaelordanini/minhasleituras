(() => {
  const MOBILE_QUERY = '(max-width:760px)';
  const mq = window.matchMedia(MOBILE_QUERY);

  const left = () => document.getElementById('leftPanel');
  const backdrop = () => document.getElementById('mobileBackdrop');
  const menuButton = () => document.getElementById('mobileMenuBtn');

  function isMobile() { return mq.matches; }

  function syncA11y(open) {
    const panel = left();
    const button = menuButton();
    if (!panel || !button) return;
    if (isMobile()) {
      panel.setAttribute('aria-hidden', open ? 'false' : 'true');
      button.setAttribute('aria-expanded', open ? 'true' : 'false');
    } else {
      panel.removeAttribute('aria-hidden');
      button.setAttribute('aria-expanded', 'false');
    }
  }

  function openMobileNav() {
    if (!isMobile()) return;
    const panel = left();
    const shade = backdrop();
    if (!panel || !shade) return;
    panel.classList.add('mobile-open');
    shade.classList.add('open');
    document.body.classList.add('mobile-nav-open');
    syncA11y(true);
    setTimeout(() => document.getElementById('mobileSidebarClose')?.focus(), 0);
  }

  function closeMobileNav({restoreFocus=false} = {}) {
    const panel = left();
    const shade = backdrop();
    panel?.classList.remove('mobile-open');
    shade?.classList.remove('open');
    document.body.classList.remove('mobile-nav-open');
    syncA11y(false);
    if (restoreFocus && isMobile()) setTimeout(() => menuButton()?.focus(), 0);
  }

  function toggleMobileNav() {
    if (left()?.classList.contains('mobile-open')) closeMobileNav({restoreFocus:true});
    else openMobileNav();
  }

  menuButton()?.addEventListener('click', toggleMobileNav);
  document.getElementById('mobileSidebarClose')?.addEventListener('click', () => closeMobileNav({restoreFocus:true}));
  backdrop()?.addEventListener('click', () => closeMobileNav({restoreFocus:true}));

  left()?.addEventListener('click', event => {
    if (!isMobile()) return;
    if (event.target.closest?.('.doc-delete')) return;
    const destination = event.target.closest?.('#allTextsNav,#readingListNav,#moreBtn,.doc-card,.tag-nav,#uploadBtn,#linkBtn,#manualBtn,#newBtn,#addTagBtn');
    if (destination) setTimeout(() => closeMobileNav(), 0);
  });

  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && left()?.classList.contains('mobile-open')) {
      event.preventDefault();
      closeMobileNav({restoreFocus:true});
    }
  });

  mq.addEventListener?.('change', () => closeMobileNav());
  window.addEventListener('orientationchange', () => setTimeout(() => closeMobileNav(), 100));

  syncA11y(false);
  window.LeiturMobile = { open: openMobileNav, close: closeMobileNav, toggle: toggleMobileNav };
})();
