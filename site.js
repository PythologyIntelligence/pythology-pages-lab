(() => {
  const nav = document.querySelector('[data-nav-links]');
  const menuButton = document.querySelector('[data-menu-button]');

  if (!nav || !menuButton) return;

  const canonicalNav = [
    ['index.html', 'Home'],
    ['mdra.html', 'MDRA'],
    ['prometheus.html', 'Prometheus'],
    ['causal-intelligence.html', 'Causal Core'],
    ['research.html', 'The stack'],
    ['where-it-fits.html', 'Where it fits'],
    ['about.html', 'About']
  ];

  const path = window.location.pathname;
  const currentPage = path.endsWith('/')
    ? 'index.html'
    : (path.split('/').filter(Boolean).pop() || 'index.html');

  nav.replaceChildren();
  canonicalNav
    .filter(([href]) => href !== currentPage)
    .forEach(([href, label]) => {
      const link = document.createElement('a');
      link.className = 'nav-link';
      link.href = href;
      link.textContent = label;
      nav.appendChild(link);
    });

  const dropdownTriggers = Array.from(document.querySelectorAll('[data-dropdown-trigger]'));
  const isMobile = () => window.matchMedia('(max-width: 1000px)').matches;

  const closeDropdowns = (except = null) => {
    dropdownTriggers.forEach((trigger) => {
      const wrapper = trigger.closest('.nav-dropdown');
      if (!wrapper || wrapper === except) return;
      wrapper.classList.remove('open');
      trigger.setAttribute('aria-expanded', 'false');
    });
  };

  const closeMenu = () => {
    nav.classList.remove('mobile-open');
    menuButton.setAttribute('aria-expanded', 'false');
    menuButton.setAttribute('aria-label', 'Open menu');
    menuButton.textContent = '☰';
    closeDropdowns();
  };

  const openMenu = () => {
    nav.classList.add('mobile-open');
    menuButton.setAttribute('aria-expanded', 'true');
    menuButton.setAttribute('aria-label', 'Close menu');
    menuButton.textContent = '×';
  };

  menuButton.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (nav.classList.contains('mobile-open')) closeMenu();
    else openMenu();
  });

  dropdownTriggers.forEach((trigger) => {
    const wrapper = trigger.closest('.nav-dropdown');
    if (!wrapper) return;

    trigger.setAttribute('aria-expanded', 'false');

    trigger.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();

      const opening = !wrapper.classList.contains('open');
      closeDropdowns(wrapper);
      wrapper.classList.toggle('open', opening);
      trigger.setAttribute('aria-expanded', String(opening));
    });
  });

  nav.addEventListener('click', (event) => {
    const link = event.target.closest('a');
    if (link && isMobile()) closeMenu();
  });

  document.addEventListener('click', (event) => {
    if (!nav.contains(event.target) && !menuButton.contains(event.target)) {
      if (isMobile()) closeMenu();
      else closeDropdowns();
    }
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      closeMenu();
      menuButton.focus();
    }
  });

  window.addEventListener('resize', () => {
    if (!isMobile()) {
      nav.classList.remove('mobile-open');
      menuButton.setAttribute('aria-expanded', 'false');
      menuButton.setAttribute('aria-label', 'Open menu');
      menuButton.textContent = '☰';
    }
  });
})();
