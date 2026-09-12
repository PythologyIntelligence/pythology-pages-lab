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

  const applyHomeMdra = () => {
    if (currentPage() !== 'index.html') return;
    const band = document.querySelector('.home-domain-band');
    if (!band) return;
    if (band.querySelector('.mdra-single-view') && !/New Zealand proves the country model/i.test(band.textContent)) return;

    band.innerHTML = `
      <div class="container">
        <p class="human-kicker">MDRA · Multi-Domain Deterministic Risk Architecture</p>
        <h2 class="h2">One architecture. Three live systems.<br>One evidence plane.</h2>
        <p class="lede">EarthNet 2.0 watches the planet. Atlas 2.0 resolves New Zealand's environmental state in operational depth, using an architecture that can be adapted to other countries where suitable public or authorised data sources are available. A.R.C.U.S tracks geopolitical instability and strategic disruption. MDRA keeps those systems connected without collapsing observation, calculation and inference into the same thing.</p>
        <div class="home-dual-view mdra-single-view" style="grid-template-columns:1fr">
          <article class="home-view-card" style="--view-art:url('png_images/earthnet.png')">
            <div class="home-view-copy">
              <p class="human-kicker">The operating architecture</p>
              <h3>EarthNet 2.0 / Atlas 2.0 / A.R.C.U.S</h3>
              <p>Planetary physical state, country-level environmental depth and geopolitical instability remain specialist evidence domains. MDRA gives them a common evidence grammar while preserving provenance, confidence and the boundary between what was observed and what was inferred.</p>
              <div class="btn-row"><a class="btn btn-primary" href="mdra.html">Explore MDRA</a><a class="btn" href="mdra.html#systems">See the live systems</a></div>
            </div>
          </article>
        </div>
      </div>`;
    band.dataset.mdraHomeCanonical = '1';
  };

  const applyCanonicalUi = () => {
    apply();
    applyHomeMdra();
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', applyCanonicalUi, { once: true });
  } else {
    applyCanonicalUi();
  }

  const observer = new MutationObserver(() => {
    const nav = document.querySelector('[data-nav-links]');
    if (nav) {
      const expected = canonicalHtml();
      if (nav.innerHTML !== expected) apply();
    }

    if (currentPage() === 'index.html') {
      const band = document.querySelector('.home-domain-band');
      if (band && (!band.querySelector('.mdra-single-view') || /New Zealand proves the country model/i.test(band.textContent))) {
        applyHomeMdra();
      }
    }
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
})();
