(() => {
  const programmes = window.PYTHOLOGY_RESEARCH_PROGRAMMES || [];
  const page = location.pathname.split('/').pop() || 'index.html';

  // Human-facing pages use one stable public navigation. Keep research programmes
  // discoverable in-page rather than promoting specialist domains into the top nav.
  if (document.body.classList.contains('pitch-body')) {
    const nav = document.querySelector('[data-nav-links]');
    if (nav) {
      const links = [
        ['index.html', 'Home'],
        ['earthnet-platform.html', 'EarthNet'],
        ['prometheus.html', 'Prometheus'],
        ['causal-intelligence.html', 'Causal Core'],
        ['research.html', 'The stack'],
        ['where-it-fits.html', 'Where it fits'],
        ['about.html', 'About']
      ];
      const renderPublicNav = () => {
        nav.innerHTML = links.map(([href, label]) => {
          const active = page === href || (page === '' && href === 'index.html');
          return `<a class="nav-link${active ? ' active' : ''}" href="${href}">${label}</a>`;
        }).join('');
        nav.setAttribute('aria-label', 'Primary navigation');
      };
      renderPublicNav();

      // Some mirrored pages can inject a second, unversioned copy of this UI
      // script after the cache-busted overlay. Restore the canonical menu if
      // that late script replaces it with an older link set.
      const navObserver = new MutationObserver(() => {
        if (!nav.querySelector('a[href="causal-intelligence.html"]')) renderPublicNav();
      });
      navObserver.observe(nav, { childList: true });
    }
  }

  // The redesign deliberately leaves the EarthNet planetary statement untouched: it
  // is the visual benchmark. Other artwork gets a modest lift so it reads as imagery,
  // not as a barely-visible texture behind copy.
  if (!document.getElementById('pythology-visual-polish')) {
    const style = document.createElement('style');
    style.id = 'pythology-visual-polish';
    style.textContent = `
      .home-pitch-hero::before { opacity:.60 !important; filter:saturate(.88) contrast(.98) !important; }
      .home-pitch-hero::after { background:linear-gradient(90deg,#060a0d 0%,rgba(6,10,13,.96) 37%,rgba(6,10,13,.56) 64%,rgba(6,10,13,.16)) !important; }
      .stack-hero::before { opacity:.49 !important; filter:saturate(.78) contrast(.97) !important; }
      .fit-hero::before { opacity:.50 !important; filter:saturate(.80) contrast(.97) !important; }
      .about-hero::before { opacity:.58 !important; filter:saturate(.78) contrast(.97) !important; }
      .causal-hero::before { opacity:.48 !important; filter:saturate(.78) contrast(.97) !important; }

      .home-dual-view { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:20px; margin-top:44px; }
      .home-view-card { position:relative; min-height:500px; overflow:hidden; border:1px solid rgba(161,213,222,.16); border-radius:22px; isolation:isolate; display:flex; align-items:flex-end; }
      .home-view-card::before { content:''; position:absolute; inset:0; z-index:-2; background:var(--view-art) center/cover no-repeat; opacity:.58; filter:saturate(.88) contrast(.98); }
      .home-view-card::after { content:''; position:absolute; inset:0; z-index:-1; background:linear-gradient(180deg,rgba(5,10,13,.18) 0%,rgba(5,10,13,.52) 44%,rgba(5,10,13,.94) 100%); }
      .home-view-copy { padding:clamp(28px,4vw,48px); max-width:650px; }
      .home-view-copy h3 { margin:14px 0 18px; font:500 clamp(34px,4vw,54px)/1.02 'Newsreader',Georgia,serif; letter-spacing:-.035em; }
      .home-view-copy p { color:#b5c4c8; line-height:1.72; }
      .home-view-stats { display:grid; grid-template-columns:repeat(3,1fr); margin:28px 0 0; border:1px solid rgba(161,213,222,.15); background:rgba(5,11,14,.58); backdrop-filter:blur(10px); }
      .home-view-stat { padding:17px; border-right:1px solid rgba(161,213,222,.12); }
      .home-view-stat:last-child { border-right:0; }
      .home-view-stat strong { display:block; font:500 28px/1 'Newsreader',Georgia,serif; }
      .home-view-stat span { display:block; margin-top:7px; color:#81969c; font-size:9px; line-height:1.4; }

      .df-home-grid,.cross-domain-grid { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:20px; margin-top:42px; }
      .df-home-card,.cross-domain-card { position:relative; overflow:hidden; min-height:330px; padding:32px; border:1px solid rgba(161,213,222,.14); border-radius:18px; background:linear-gradient(155deg,rgba(15,31,38,.78),rgba(8,17,22,.58)); }
      .df-home-card h3,.cross-domain-card h3 { margin:18px 0 14px; font:500 clamp(27px,3vw,38px)/1.08 'Newsreader',Georgia,serif; }
      .df-home-card p,.cross-domain-card p { color:#a7b7bb; line-height:1.72; }
      .df-home-branches { display:flex; flex-wrap:wrap; gap:8px; margin-top:22px; }
      .df-home-branch { padding:8px 10px; border:1px solid rgba(161,213,222,.14); border-radius:999px; color:#93a6ab; font-size:10px; }
      .df-home-status { margin-top:22px; padding-top:16px; border-top:1px solid rgba(161,213,222,.10); color:#78cbd9; font:600 10px/1.55 'JetBrains Mono',monospace; }
      .df-home-note { margin-top:28px; max-width:980px; color:#899da3; font-size:12px; line-height:1.72; }

      #cross-domain-home .pitch-section-head .h2 { font-size:clamp(40px,4.15vw,58px); line-height:1.01; max-width:720px; }
      .cross-domain-card { min-height:380px; isolation:isolate; display:flex; flex-direction:column; justify-content:flex-end; }
      .cross-domain-card::before { content:''; position:absolute; inset:0; z-index:-2; background:var(--domain-art,none) center/cover no-repeat; opacity:.43; filter:saturate(.86) contrast(.98); }
      .cross-domain-card::after { content:''; position:absolute; inset:0; z-index:-1; background:linear-gradient(180deg,rgba(5,11,14,.18),rgba(5,11,14,.90) 78%); }
      .cross-domain-card--physical::before { opacity:.43; }
      .cross-domain-card--physical { background:radial-gradient(circle at 76% 18%,rgba(75,182,202,.14),transparent 20rem),linear-gradient(155deg,rgba(15,31,38,.78),rgba(8,17,22,.58)); }
      .cross-domain-card a { display:inline-block; margin-top:18px; color:#90ddeb; font-size:12px; font-weight:700; text-decoration:none; }
      .brier-explainer { margin:16px 0 0; color:#7f9399; font-size:11px; line-height:1.6; }

      @media (max-width:900px) {
        .home-dual-view,.df-home-grid,.cross-domain-grid { grid-template-columns:1fr; }
        .home-view-card { min-height:430px; }
      }
      @media (max-width:700px) {
        .about-hero::before { opacity:.42 !important; }
        .home-view-card { min-height:400px; }
        .home-view-stats { grid-template-columns:1fr; }
        .home-view-stat { border-right:0; border-bottom:1px solid rgba(161,213,222,.12); }
        .home-view-stat:last-child { border-bottom:0; }
      }
    `;
    document.head.appendChild(style);
  }

  if (page === 'index.html' || page === '') {
    const heroLead = document.querySelector('.home-pitch-hero .lede');
    if (heroLead) {
      heroLead.textContent = 'We watch complicated parts of the world, explain what might connect the signals, forecast what happens next — and keep the record when reality answers.';
    }

    const brierValue = document.querySelector('[data-home-prom-brier]')?.closest('.pitch-proof');
    const proofLine = brierValue?.closest('.pitch-proof-line');
    if (proofLine && !document.getElementById('proof-brier-note')) {
      const note = document.createElement('p');
      note.id = 'proof-brier-note';
      note.className = 'brier-explainer';
      note.textContent = 'Lower is better · 0 = perfect. Measures how closely forecast probabilities matched real outcomes.';
      proofLine.insertAdjacentElement('afterend', note);
    }

    // Replace the single EarthNet banner with the intended global + country-level pair.
    const domainBand = document.querySelector('.home-domain-band');
    if (domainBand && !document.querySelector('.home-dual-view')) {
      domainBand.innerHTML = `
        <div class="container">
          <p class="human-kicker">EarthNet · planetary intelligence</p>
          <h2 class="h2">New Zealand proves the country model.<br>EarthNet proves the global model.</h2>
          <p class="lede">The same architecture can keep watch across the whole board or go much deeper where decisions live. The evidence model stays explicit either way.</p>
          <div class="home-dual-view">
            <article class="home-view-card" style="--view-art:url('png_images/earthnet.png')">
              <div class="home-view-copy">
                <p class="human-kicker">Global view</p>
                <h3>Keep watch across the whole board.</h3>
                <p>See developing environmental and human-system context together: severe weather, seismic activity, ocean and cryosphere signals, wildfire, humanitarian pressure and other changing evidence.</p>
                <div class="btn-row"><a class="btn" href="earthnet-global/">Open the global platform</a></div>
              </div>
            </article>
            <article class="home-view-card" style="--view-art:url('png_images/nz_report.webp')">
              <div class="home-view-copy">
                <p class="human-kicker">Country-level view · New Zealand</p>
                <h3>Then go much deeper where the decisions live.</h3>
                <p>New Zealand is EarthNet's current country-level proving ground. The public daily state combines seismic activity, volcanic status, incoming weather and ocean context while keeping the evidence chain visible.</p>
                <div class="home-view-stats">
                  <div class="home-view-stat"><strong data-home-nz-count>—</strong><span>24-hour catalogue events</span></div>
                  <div class="home-view-stat"><strong data-home-nz-largest>—</strong><span>largest event</span></div>
                  <div class="home-view-stat"><strong data-home-nz-cluster>—</strong><span>largest concentration</span></div>
                </div>
                <div class="btn-row"><a class="btn" href="earthnet-nz-intelligence.html">Open New Zealand intelligence</a></div>
              </div>
            </article>
          </div>
          <div class="integrity-note"><strong>Scalability without pretending the data is identical everywhere:</strong> the architecture can be configured around other countries and regions as suitable public or authorised evidence sources become available. New Zealand proves the country model; it does not imply every jurisdiction has the same source depth today.</div>
        </div>`;
    }

    // Decision Futures stays visibly conditional until the human receiver is deployed.
    const stackSection = document.querySelector('#stack');
    if (stackSection && !document.getElementById('decision-futures-home')) {
      const section = document.createElement('section');
      section.className = 'pitch-section';
      section.id = 'decision-futures-home';
      section.innerHTML = `
        <div class="container">
          <div class="pitch-section-head">
            <div><p class="human-kicker">Decision Futures · human in the loop</p><h2 class="h2">What changes if<br>the choice changes?</h2></div>
            <p>Freeze the evidence first, compare a small number of pre-declared branches, let a human review the reasoning, then preserve the chosen path so later reality can judge what actually happened.</p>
          </div>
          <div class="df-home-grid">
            <article class="df-home-card">
              <span class="human-kicker">Current review candidate</span>
              <h3>Athens heat risk</h3>
              <p><strong>Conditional question:</strong> if sustained heat persists, does earlier readiness or resource staging materially change plausible downstream electricity-system or heat-health pressure?</p>
              <div class="df-home-branches"><span class="df-home-branch">Maintain posture</span><span class="df-home-branch">Escalate readiness</span><span class="df-home-branch">Stage resources earlier</span><span class="df-home-branch">Dismiss</span></div>
              <div class="df-home-status">REVIEW: PENDING · TRIAL OPENED: NO</div>
            </article>
            <article class="df-home-card">
              <span class="human-kicker">Example conditional branch</span>
              <h3>A wildfire changes when the wind changes.</h3>
              <p>If wind direction or speed shifts, the useful question is not simply whether the fire remains active. It is whether the plausible exposure corridor changes with it — and whether homes, roads, power assets or other people and systems move into that corridor.</p>
              <div class="df-home-branches"><span class="df-home-branch">Baseline wind</span><span class="df-home-branch">Shifted wind</span><span class="df-home-branch">Changed exposure</span><span class="df-home-branch">Human review</span></div>
              <div class="df-home-status">CONDITIONAL SCENARIO · NOT A WARNING OR EVACUATION ORDER</div>
            </article>
          </div>
          <p class="df-home-note">Decision Futures is research decision support. A scenario is not an observed outcome, a forecast is not causal proof, and operational authority remains with responsible humans and official agencies.</p>
        </div>`;
      stackSection.insertAdjacentElement('afterend', section);
    }

    if (!document.getElementById('cross-domain-home')) {
      const dfSection = document.getElementById('decision-futures-home');
      const section = document.createElement('section');
      section.className = 'pitch-section';
      section.id = 'cross-domain-home';
      section.innerHTML = `
        <div class="container">
          <div class="pitch-section-head">
            <div><p class="human-kicker">Cross-domain research</p><h2 class="h2">The stack is domain-agnostic.<br>The evidence is not.</h2></div>
            <p>Biology and engineered systems can use the same discipline of provenance, competing mechanisms, prospective forecasts and outcome scoring — but each domain has to earn validation independently.</p>
          </div>
          <div class="cross-domain-grid">
            <article class="cross-domain-card" style="--domain-art:url('png_images/bio_symbology.png')">
              <div><p class="human-kicker">Biological intelligence</p><h3>Detect the transition, not only the tumour.</h3><p>Model biological transitions that may precede invasive disease while keeping pathway reasoning and evidence provenance explicit.</p><a href="biosymbology.html">Explore biological work →</a></div>
            </article>
            <article class="cross-domain-card cross-domain-card--physical" style="--domain-art:url('png_images/digital_infrastructure_twin.png')">
              <div><p class="human-kicker">Physical intelligence</p><h3>Understand the machine. Then test the decision.</h3><p>Physics-constrained world models for high-value engineered systems — freeze the evidence and decision before the machine reveals the answer.</p><a href="physical-intelligence.html">Explore physical work →</a></div>
            </article>
          </div>
        </div>`;
      (dfSection || stackSection)?.insertAdjacentElement('afterend', section);
    }

    // Make the four buyer stories concrete without over-claiming operational use.
    const markets = Array.from(document.querySelectorAll('.market-item'));
    const marketCopy = [
      ['A severe-weather system is developing. Which exposures are changing before the claims data exists?', 'Connect hazards, evolving evidence and portfolio context early enough to investigate changing exposure while keeping assumptions inspectable.'],
      ['Several weak signals are moving at once. Is this noise, or does the combined picture justify earlier attention?', 'Bring different evidence families into one challengeable operating picture without turning uncertainty into a false alarm.'],
      ['Weather, seismic activity and network dependencies are changing around an asset. What deserves attention first?', 'Focus the evidence chain around assets, regions and dependencies, then preserve why one developing pressure was prioritised over another.'],
      ['A hypothesis sounds plausible. What would have to happen next for it to deserve more confidence?', 'Turn hypotheses into prospective records with competing explanations, forecast commitments and later outcomes rather than persuasive hindsight.']
    ];
    markets.slice(0, 4).forEach((item, index) => {
      const [heading, copy] = marketCopy[index];
      const h3 = item.querySelector('h3');
      const p = item.querySelector('p');
      if (h3) h3.textContent = heading;
      if (p) p.textContent = copy;
    });
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
    image.addEventListener('error', () => media.remove(), { once: true });
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
    image.src = item.image;
    stage.textContent = item.stage;
    title.textContent = item.title;
    blurb.textContent = item.blurb;
  };
  links.forEach((link) => {
    const index = Number(link.dataset.researchIndex);
    link.addEventListener('mouseenter', () => update(index));
    link.addEventListener('focus', () => update(index));
  });
})();