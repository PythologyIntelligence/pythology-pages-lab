(() => {
  const links = [
    ['index.html', 'Home'],
    ['mdra.html', 'MDRA'],
    ['prometheus.html', 'Prometheus'],
    ['causal-intelligence.html', 'Causal Core'],
    ['research.html', 'The stack'],
    ['where-it-fits.html', 'Where it fits'],
    ['about.html', 'About']
  ];

  const currentPage = () => {
    const last = location.pathname.split('/').filter(Boolean).pop() || 'index.html';
    return last.includes('.') ? last : 'index.html';
  };

  const canonicalHtml = () => {
    const page = currentPage();
    return links.map(([href, label]) => {
      const active = page === href;
      return `<a class="nav-link${active ? ' active' : ''}" href="${href}">${label}</a>`;
    }).join('');
  };

  const apply = () => {
    const html = canonicalHtml();
    document.querySelectorAll('[data-nav-links]').forEach((nav) => {
      if (nav.dataset.mdraCanonical === '1' && nav.innerHTML === html) return;
      nav.innerHTML = html;
      nav.dataset.mdraCanonical = '1';
      nav.setAttribute('aria-label', 'Primary navigation');
    });
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', apply, { once: true });
  } else {
    apply();
  }

  const observer = new MutationObserver(() => {
    const nav = document.querySelector('[data-nav-links]');
    if (!nav) return;
    const expected = canonicalHtml();
    if (nav.innerHTML !== expected) apply();
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
})();
