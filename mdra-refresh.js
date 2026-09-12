(() => {
  const page = (location.pathname.split('/').filter(Boolean).pop() || 'index.html').toLowerCase();

  const byText = (root, selector, text) => [...(root || document).querySelectorAll(selector)].find((el) => el.textContent.trim().includes(text));
  const setFooterMdra = () => {
    document.querySelectorAll('.footer-links a').forEach((link) => {
      if (link.textContent.trim() === 'EarthNet' || /earthnet-platform\.html$/i.test(link.getAttribute('href') || '')) {
        link.textContent = 'MDRA';
        link.setAttribute('href', 'mdra.html');
      }
    });
  };

  const updateHome = () => {
    const heroEarth = [...document.querySelectorAll('.home-pitch-hero .btn')].find((a) => /open earthnet/i.test(a.textContent));
    if (heroEarth) {
      heroEarth.textContent = 'Explore MDRA';
      heroEarth.setAttribute('href', 'mdra.html');
    }

    const domainBand = document.querySelector('.home-domain-band');
    if (domainBand) {
      domainBand.innerHTML = `
        <div class="container">
          <p class="human-kicker">MDRA · Multi-Domain Deterministic Risk Architecture</p>
          <h2 class="h2">One architecture. Three live systems.<br>One evidence plane.</h2>
          <p class="lede">EarthNet 2.0 watches the planet. Atlas 2.0 resolves New Zealand's environmental state in operational depth. A.R.C.U.S tracks geopolitical instability and strategic disruption. MDRA keeps their evidence compatible without pretending observation, calculation and inference are the same thing.</p>
          <div class="home-view-card mdra-home-view" style="--view-art:url('png_images/earthnet.png')">
            <div class="home-view-copy">
              <p class="human-kicker">The operating trio</p>
              <h3>EarthNet 2.0 / Atlas 2.0 / A.R.C.U.S</h3>
              <p>EarthNet 2.0 retains planetary physical state. Atlas 2.0 provides country-level environmental depth — currently New Zealand, with an architecture that can be adapted to other countries where suitable public or authorised evidence sources are available. A.R.C.U.S adds the human and strategic system. Together, MDRA gives each domain a common evidence grammar while preserving its own provenance and claim boundaries.</p>
              <div class="btn-row"><a class="btn btn-primary" href="mdra.html">Explore MDRA</a><a class="btn" href="https://earthnet.pythology.co.nz/">Open EarthNet 2.0</a></div>
            </div>
          </div>
        </div>`;
    }

    const firstStack = [...document.querySelectorAll('#stack .stack-item')].find((item) => item.querySelector('.stack-name')?.textContent.trim() === 'EarthNet');
    if (firstStack) {
      const name = firstStack.querySelector('.stack-name');
      name.innerHTML = '<span>MDRA</span><small>EarthNet 2.0 / Atlas 2.0 / A.R.C.U.S</small>';
      const desc = firstStack.querySelector('p');
      if (desc) desc.textContent = 'Bring the outside world into a current evidence state across planetary, national and geopolitical domains, preserve provenance, and track meaningful change without hiding the boundary between observation and interpretation.';
    }
  };

  const updatePrometheus = () => {
    const action = document.querySelector('.site-header .nav-actions .btn-primary');
    if (action && /earthnet/i.test(action.textContent)) {
      action.textContent = 'Open MDRA';
      action.setAttribute('href', 'mdra.html');
    }

    const causal = document.querySelector('#causal-reasoning');
    if (causal) {
      const steps = causal.querySelectorAll('.pitch-step');
      if (steps[0]) {
        const p = steps[0].querySelector('p');
        if (p) p.textContent = 'MDRA provides the shared evidence architecture for current state across EarthNet 2.0, Atlas 2.0 and A.R.C.U.S. Prometheus is being connected to those retained histories so declared causal links can be tested with direction, confidence, provenance and competing explanations still visible.';
      }
      const note = causal.querySelector('.integrity-note');
      if (note) note.textContent = 'MDRA is the shared evidence architecture beneath Prometheus. EarthNet 2.0, Atlas 2.0 and A.R.C.U.S preserve their own domain evidence and histories; as the integration is completed, Prometheus can test declared cross-domain mechanisms without pretending the causal core discovers causation by itself.';
    }

    const world = document.querySelector('.world-statement');
    if (world) {
      const kicker = world.querySelector('.human-kicker');
      const heading = world.querySelector('.h2');
      const lead = world.querySelector('.lede');
      const row = world.querySelector('.btn-row');
      if (kicker) kicker.textContent = 'MDRA · the evidence plane beneath Prometheus';
      if (heading) heading.innerHTML = 'Three systems watch different worlds.<br>Prometheus looks for what connects them.';
      if (lead) lead.textContent = "EarthNet 2.0 retains planetary physical state. Atlas 2.0 resolves New Zealand's environmental state in operational depth, using an architecture that can be adapted to other countries where suitable public or authorised data sources are available. A.R.C.U.S tracks geopolitical instability and strategic disruption. MDRA keeps those histories compatible so Prometheus can test relationships across domains without confusing correlation with causation.";
      if (row) row.innerHTML = '<a class="btn btn-primary" href="mdra.html">Explore MDRA</a><a class="btn" href="#causal-reasoning">How Prometheus uses evidence</a>';
    }

    const disclaimer = document.querySelector('.pitch-disclaimer .container');
    if (disclaimer && /Prometheus and EarthNet/.test(disclaimer.textContent)) {
      disclaimer.textContent = 'Prometheus and the MDRA systems are research and decision-support systems in live validation. They are not official warning services, emergency instructions or replacements for responsible public authorities and domain experts.';
    }
  };

  const updateCausal = () => {
    const rust = document.querySelector('#rust-core');
    if (rust) {
      const trio = rust.querySelector('.pitch-three');
      if (trio) {
        trio.innerHTML = `
          <div class="pitch-step"><span class="step-no">MDRA</span><h3>Test mechanisms against a changing world.</h3><p>MDRA supplies retained, provenance-linked evidence across EarthNet 2.0, Atlas 2.0 and A.R.C.U.S. The causal core can evaluate declared pathways and intervention branches against that evidence without promoting correlation into causation.</p></div>
          <div class="pitch-step"><span class="step-no">PROMETHEUS</span><h3>Turn mechanisms into forecasts that risk being wrong.</h3><p>Prometheus uses traceable causal outputs to form prospective expectations, commit them before outcomes and learn when reality answers.</p></div>
          <div class="pitch-step"><span class="step-no">DECISION FUTURES</span><h3>Ask what changes when the intervention changes.</h3><p>Decision Futures carries explicit causal structure into conditional branches so alternative choices can be compared without presenting a scenario as an observed fact or guaranteed outcome.</p></div>`;
      }
      const buttons = rust.querySelector('.btn-row');
      if (buttons) buttons.innerHTML = '<a class="btn btn-primary" href="mdra.html">Explore MDRA</a><a class="btn" href="prometheus.html">Open Prometheus</a>';
      const boundary = rust.querySelector('.causal-boundary');
      if (boundary) boundary.innerHTML = '<strong>Why Rust:</strong> the core is compiled, deterministic and versioned. The same inputs, declared mechanism and engine version reproduce the same trace — giving Pythology a dependable computational layer beneath systems that must show their working.';
    }

    const domains = document.querySelectorAll('.causal-domain-grid .causal-domain');
    if (domains[0]) {
      const title = domains[0].querySelector('h3');
      const p = domains[0].querySelector('p');
      const a = domains[0].querySelector('a');
      if (title) title.textContent = 'Multi-domain intelligence';
      if (p) p.textContent = 'MDRA brings together live, independently observable evidence from EarthNet 2.0, Atlas 2.0 and A.R.C.U.S. It gives declared mechanisms somewhere real to be tested across physical, environmental and geopolitical systems while keeping each evidence boundary intact.';
      if (a) { a.textContent = 'Explore MDRA →'; a.setAttribute('href', 'mdra.html'); }
    }
  };

  const updateStack = () => {
    const first = document.querySelector('.stack-flow .stack-flow-item');
    if (first) {
      const title = first.querySelector('.stack-main h3');
      const p = first.querySelector('.stack-main p');
      const qp = first.querySelector('.stack-question p');
      const link = first.querySelector('.stack-question a');
      if (title) title.innerHTML = 'MDRA <small class="mdra-system-line">EarthNet 2.0 / Atlas 2.0 / A.R.C.U.S</small>';
      if (p) p.textContent = 'MDRA brings the outside world into a current evidence state across physical, environmental and geopolitical domains. Its job is to notice meaningful change, preserve provenance and keep each specialist system’s evidence boundary intact.';
      if (qp) qp.textContent = 'Observe broadly across the three specialist systems, preserve the source and keep repeated noise from looking like new evidence.';
      if (link) { link.textContent = 'Explore MDRA →'; link.setAttribute('href', 'mdra.html'); }
    }

    const proof = document.querySelector('.domain-proof-grid .domain-proof-card');
    if (proof) {
      proof.setAttribute('href', 'mdra.html');
      const title = proof.querySelector('h3');
      const p = proof.querySelector('p');
      const link = proof.querySelector('.proof-link');
      if (title) title.textContent = 'Multi-domain intelligence';
      if (p) p.textContent = 'MDRA is the most operational expression of the stack today: EarthNet 2.0 for planetary physical state, Atlas 2.0 for country-level environmental depth, and A.R.C.U.S for geopolitical instability and strategic disruption — all keeping their own evidence rules.';
      if (link) link.textContent = 'Explore MDRA →';
    }

    const statement = document.querySelector('.world-statement');
    if (statement) {
      const firstButton = statement.querySelector('.btn-primary');
      if (firstButton) { firstButton.textContent = 'See MDRA in operation'; firstButton.setAttribute('href', 'mdra.html'); }
    }
  };

  const updateWhereItFits = () => {
    const insurance = document.querySelector('#insurance');
    if (insurance) {
      const problem = insurance.querySelector('.fit-problem p');
      if (problem) problem.textContent = 'Weather, wildfire, flood conditions, infrastructure pressure, humanitarian effects and official updates often arrive from different sources. A focused MDRA deployment could organise that evolving evidence around a geography, portfolio or peril while keeping provenance, confidence and domain boundaries visible.';
      const firstMini = insurance.querySelector('.fit-mini');
      if (firstMini) {
        const span = firstMini.querySelector('span'); const h = firstMini.querySelector('h4'); const p = firstMini.querySelector('p');
        if (span) span.textContent = 'MDRA'; if (h) h.textContent = 'Developing exposure'; if (p) p.textContent = 'Physical, environmental and human-system context can be focused around the geography, portfolio or peril that matters.';
      }
      const link = insurance.querySelector('.fit-evidence-links a');
      if (link) { link.textContent = 'See MDRA →'; link.setAttribute('href', 'mdra.html'); }
    }

    const government = document.querySelector('#government');
    if (government) {
      const introP = government.querySelector('.fit-market-intro p');
      if (introP) introP.textContent = 'Public agencies already have authoritative warning systems and domain specialists. The opportunity for MDRA is the space between them: how physical, environmental and human-system evidence connects, what changed since the last cycle and what wider consequences may deserve attention.';
      const problem = government.querySelector('.fit-problem p');
      if (problem) problem.textContent = 'What changed? Is another system under pressure? Which information is stale? What is only inferred? What could matter next? MDRA can keep those questions in one evidence architecture while preserving the authority and provenance of the original sources.';
      const minis = government.querySelectorAll('.fit-mini');
      if (minis[0]) minis[0].innerHTML = '<span>COUNTRY ARCHITECTURE</span><h4>National intelligence</h4><p>Atlas 2.0 is the New Zealand implementation: high-resolution environmental intelligence built from local evidence. The architecture can be adapted to another country where suitable public or authorised sources are available, with that country earning its own source map and calibration history.</p>';
      if (minis[1]) minis[1].innerHTML = '<span>GLOBAL HORIZON</span><h4>Physical + strategic context</h4><p>EarthNet 2.0 preserves the planetary physical picture while A.R.C.U.S adds geopolitical instability and strategic disruption around the national operating view.</p>';
      const links = government.querySelectorAll('.fit-evidence-links a');
      if (links[0]) { links[0].textContent = 'Explore MDRA →'; links[0].setAttribute('href', 'mdra.html'); }
      if (links[1]) { links[1].textContent = 'Open Atlas 2.0 →'; links[1].setAttribute('href', 'https://atlas.pythology.co.nz/atlas'); }
    }

    const infrastructure = document.querySelector('#infrastructure .fit-problem p');
    if (infrastructure) infrastructure.textContent = 'Severe weather can touch power, transport, communications, ports, water and workforce access at the same time. A focused MDRA deployment could combine relevant public evidence with authorised private operational context to make those relationships easier to see and interrogate.';

    const resilience = document.querySelector('#resilience .fit-problem p');
    if (resilience) resilience.textContent = 'MDRA can establish the surrounding physical and environmental state, Atlas can provide country-level depth where configured, Prometheus can preserve a baseline expectation, and Decision Futures can make assumptions around alternative interventions explicit. Over time, observed outcomes can begin separating useful interventions from persuasive stories.';

    const research = document.querySelector('#research .fit-problem p');
    if (research) research.textContent = 'Prometheus creates a record of what was believed before reality answered. MDRA can supply retained multi-domain histories, the causal layer keeps competing mechanisms visible, and the outcome layer preserves misses instead of cleaning the story up afterward.';

    const global = document.querySelector('.fit-global');
    if (global) {
      const kicker = global.querySelector('.human-kicker');
      const heading = global.querySelector('.h2');
      const paras = global.querySelectorAll('.fit-global-copy > p:not(.human-kicker)');
      if (kicker) kicker.textContent = 'Global architecture · national depth · local decisions';
      if (heading) heading.textContent = 'Start with the geography and decisions that matter.';
      if (paras[0]) paras[0].textContent = 'MDRA combines different scales without pretending they are interchangeable: EarthNet 2.0 maintains the global physical horizon, Atlas 2.0 provides country-level environmental depth, and A.R.C.U.S adds human-system and strategic context.';
      if (paras[1]) paras[1].textContent = 'The exact sources will differ by country. Atlas 2.0 is live for New Zealand, but the architecture can be adapted to another jurisdiction using suitable public or authorised data. Each deployment must earn its own source map, evidence quality, assumptions and calibration history rather than inheriting New Zealand confidence.';
      const card = global.querySelector('.fit-scope-card');
      if (card) {
        const h = card.querySelector('h3'); const p = card.querySelector('p'); const a = card.querySelector('a');
        if (h) h.textContent = 'Same architecture. Different evidence.';
        if (p) p.textContent = 'Portability belongs to the architecture, not the certainty. A new country can reuse the discipline while building its own evidence base, validation boundaries and longitudinal record.';
        if (a) { a.textContent = 'Explore MDRA →'; a.setAttribute('href', 'mdra.html'); }
      }
    }
  };

  const updateAbout = () => {
    const story = document.querySelector('.about-story-copy');
    if (story) {
      const p = [...story.querySelectorAll(':scope > p')].find((el) => /EarthNet became a place/.test(el.textContent));
      if (p) p.textContent = 'Eventually those questions stopped looking like features and started looking like the architecture itself. EarthNet learned to watch the planet, Atlas learned to resolve environmental state in depth, and A.R.C.U.S extended the same evidence discipline into geopolitical instability. Together they became MDRA. Prometheus became the part willing to write a forecast down before the answer was known, while Sentinel became the idea that a human should be able to challenge the machinery instead of simply accepting whatever appears on the screen.';
    }

    const path = document.querySelector('.about-path');
    if (path) {
      const steps = path.querySelectorAll('.about-path-step');
      if (steps[1]) {
        const h = steps[1].querySelector('h3'); const p = steps[1].querySelector('p');
        if (h) h.textContent = 'MDRA';
        if (p) p.textContent = 'Bring EarthNet 2.0, Atlas 2.0 and A.R.C.U.S into one evidence architecture without confusing observation with explanation.';
      }
    }

    const future = document.querySelector('#future');
    if (future) {
      const heading = future.querySelector('.h2');
      const intro = future.querySelector('.pitch-section-head > p');
      if (heading) heading.innerHTML = 'MDRA is the proving ground.<br>It is not the end of the question.';
      if (intro) intro.textContent = 'The longer-term ambition is to test the same evidence discipline in problems where the hidden mechanism matters even more — particularly biology. That does not mean importing MDRA confidence into medicine. Every biological claim has to earn its own evidence, validation and expert scrutiny.';
    }

    const heroContainer = document.querySelector('.about-hero .container');
    if (heroContainer && !heroContainer.querySelector('.about-mobile-visual')) {
      const visual = document.createElement('div');
      visual.className = 'about-mobile-visual';
      visual.setAttribute('role', 'img');
      visual.setAttribute('aria-label', 'Pythology founder mark');
      heroContainer.appendChild(visual);
    }
  };

  const apply = () => {
    setFooterMdra();
    if (page === 'index.html' || page === '') updateHome();
    if (page === 'prometheus.html') updatePrometheus();
    if (page === 'causal-intelligence.html') updateCausal();
    if (page === 'research.html') updateStack();
    if (page === 'where-it-fits.html') updateWhereItFits();
    if (page === 'about.html') updateAbout();
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', apply, { once: true });
  else apply();
})();
