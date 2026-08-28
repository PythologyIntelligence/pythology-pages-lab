(() => {
  const programmes = window.PYTHOLOGY_RESEARCH_PROGRAMMES || [];
  const page = location.pathname.split('/').pop() || 'index.html';

  // The legacy site shell still rewrites navigation in site.js. Redesigned investor-facing
  // pages opt into the humanised shell with .pitch-body, so restore the intended public
  // navigation after site.js has done its legacy work.
  if (document.body.classList.contains('pitch-body')) {
    const nav = document.querySelector('[data-nav-links]');
    if (nav) {
      const links = [
        ['index.html', 'Home'],
        ['earthnet-platform.html', 'EarthNet'],
        ['prometheus.html', 'Prometheus'],
        ['research.html', 'The stack'],
        ['where-it-fits.html', 'Where it fits'],
        ['about.html', 'About']
      ];
      nav.innerHTML = links.map(([href, label]) => {
        const active = page === href || (page === '' && href === 'index.html');
        return `<a class="nav-link${active ? ' active' : ''}" href="${href}">${label}</a>`;
      }).join('');
      nav.setAttribute('aria-label', 'Primary navigation');
    }
  }

  const stageOverrides = {
    'earthnet-platform.html': 'Operational system',
    'proteus.html': 'Working demonstrator',
    'physical-intelligence.html': 'Working demonstrator',
  };
  programmes.forEach((item) => {
    if (stageOverrides[item.href]) item.stage = stageOverrides[item.href];
  });

  if (!document.querySelector('link[href="architecture-in-action.css"]')) {
    const actionStyles = document.createElement('link');
    actionStyles.rel = 'stylesheet';
    actionStyles.href = 'architecture-in-action.css';
    document.head.appendChild(actionStyles);
  }

  if (!document.querySelector('script[src="architecture-in-action.js"]')) {
    const actionScript = document.createElement('script');
    actionScript.src = 'architecture-in-action.js';
    actionScript.async = false;
    document.body.appendChild(actionScript);
  }

  const programme = programmes.find((item) => item.href === page);
  const makeHero = (item) => {
    const media = document.createElement('div');
    media.className = 'page-hero-media';
    const image = new Image();
    image.src = item.heroImage || item.image;
    image.alt = item.alt;
    image.decoding = 'async';
    image.fetchPriority = 'high';
    image.addEventListener('error', () => media.remove(), {once:true});
    media.appendChild(image);
    return media;
  };
  if (programme) {
    const grid = document.querySelector('.page-hero .page-hero-grid');
    if (grid) {
      const media = makeHero(programme);
      if (page === 'proteus.html') {
        const consolePanel = grid.querySelector('.proteus-console');
        if (consolePanel) {
          consolePanel.replaceWith(media);
          const target = document.querySelector('#architecture .container');
          if (target) { consolePanel.style.marginTop = '32px'; target.appendChild(consolePanel); }
        } else grid.querySelector('.page-hero-media')?.replaceWith(media) || grid.appendChild(media);
      } else grid.querySelector('.page-hero-media')?.replaceWith(media) || grid.appendChild(media);
    }
  }

  const trigger = [...document.querySelectorAll('[data-dropdown-trigger]')].find((item) => item.textContent.trim().startsWith('Research'));
  const panel = trigger?.closest('.nav-dropdown')?.querySelector('.dropdown-panel');
  if (!panel || !programmes.length) return;
  panel.className = 'dropdown-panel research-mega';
  panel.innerHTML = `<div class="research-mega-list">${programmes.map((item,index) => `<a class="research-mega-link${index ? '' : ' is-active'}" href="${item.href}" data-research-index="${index}"><span>${item.domain}</span><strong>${item.title}</strong></a>`).join('')}</div><div class="research-mega-preview" aria-hidden="true"><img src="${programmes[0].image}" alt=""><div class="research-mega-preview-copy"><span>${programmes[0].stage}</span><strong>${programmes[0].title}</strong><p>${programmes[0].blurb}</p></div></div>`;
  const links = [...panel.querySelectorAll('[data-research-index]')];
  const image = panel.querySelector('.research-mega-preview img');
  const stage = panel.querySelector('.research-mega-preview-copy span');
  const title = panel.querySelector('.research-mega-preview-copy strong');
  const blurb = panel.querySelector('.research-mega-preview-copy p');
  const update = (index) => {
    const item = programmes[index];
    links.forEach((link,i) => link.classList.toggle('is-active',i === index));
    image.src = item.image; stage.textContent = item.stage; title.textContent = item.title; blurb.textContent = item.blurb;
  };
  links.forEach((link) => {
    const index = Number(link.dataset.researchIndex);
    link.addEventListener('mouseenter',() => update(index));
    link.addEventListener('focus',() => update(index));
  });
})();
