(() => {
  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => Array.from(document.querySelectorAll(selector));
  const safe = (value, fallback = '—') => value === undefined || value === null || value === '' ? fallback : value;

  function text(selector, value) {
    const node = $(selector);
    if (node) node.textContent = safe(value);
  }

  function nzDate(value) {
    if (!value) return '—';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return value;
    return new Intl.DateTimeFormat('en-NZ', {
      timeZone: 'Pacific/Auckland',
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit'
    }).format(d);
  }

  function shortDate(value) {
    if (!value) return '—';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return value;
    return new Intl.DateTimeFormat('en-NZ', {
      timeZone: 'Pacific/Auckland',
      day: 'numeric',
      month: 'short'
    }).format(d);
  }

  async function getJson(path) {
    const response = await fetch(path, { cache: 'no-store' });
    if (!response.ok) throw new Error(`${path}: ${response.status}`);
    return response.json();
  }

  function distinct(items, keyFn) {
    return new Set(items.map(keyFn).filter(Boolean));
  }

  function selectDiverseEvents(events, limit = 6) {
    const ranked = [...events].sort((a, b) => (Number(b.sv) || 0) - (Number(a.sv) || 0));
    const chosen = [];
    const usedDomains = new Set();
    for (const event of ranked) {
      const domain = safe(event.e, 'other');
      if (!usedDomains.has(domain)) {
        chosen.push(event);
        usedDomains.add(domain);
      }
      if (chosen.length >= limit) return chosen;
    }
    for (const event of ranked) {
      if (!chosen.includes(event)) chosen.push(event);
      if (chosen.length >= limit) break;
    }
    return chosen;
  }

  function eventCard(event) {
    const article = document.createElement('article');
    article.className = 'change-card';

    const meta = document.createElement('div');
    meta.className = 'change-meta';
    const domain = document.createElement('span');
    domain.className = 'change-domain';
    domain.textContent = safe(event.e, 'signal');
    const when = document.createElement('span');
    when.textContent = shortDate(event.at);
    meta.append(domain, when);

    const title = document.createElement('h3');
    title.textContent = safe(event.t, 'EarthNet signal');

    const description = document.createElement('p');
    description.textContent = safe(event.d, 'No public description is available for this signal.');

    const foot = document.createElement('div');
    foot.className = 'change-foot';
    const region = document.createElement('span');
    region.textContent = safe(event.r, 'Global');
    const confidence = document.createElement('span');
    const cf = Number(event.cf);
    confidence.textContent = Number.isFinite(cf) ? `${Math.round(cf * 100)}% source confidence` : 'confidence not supplied';
    foot.append(region, confidence);

    article.append(meta, title, description, foot);
    return article;
  }

  function renderGlobal(events) {
    if (!Array.isArray(events)) return;
    const domains = distinct(events, (item) => item.e);
    const regions = distinct(events, (item) => item.r);
    const timestamps = events.map((item) => new Date(item.at).getTime()).filter(Number.isFinite);
    const latest = timestamps.length ? new Date(Math.max(...timestamps)).toISOString() : null;

    text('[data-earth-events]', events.length);
    text('[data-earth-domains]', domains.size);
    text('[data-earth-regions]', regions.size);
    text('[data-earth-updated]', latest ? nzDate(latest) : '—');
    text('[data-earth-updated-line]', latest ? `Latest public EarthNet event snapshot: ${nzDate(latest)} NZ time` : 'Latest public snapshot time unavailable');

    const wrap = $('[data-global-changes]');
    if (!wrap) return;
    wrap.replaceChildren();
    const selected = selectDiverseEvents(events, 6);
    if (!selected.length) {
      const p = document.createElement('p');
      p.className = 'loading-copy';
      p.textContent = 'No public global changes are available in the latest snapshot.';
      wrap.appendChild(p);
      return;
    }
    selected.forEach((event) => wrap.appendChild(eventCard(event)));
  }

  function renderNz(data) {
    const seismic = data?.seismic || {};
    const events = Array.isArray(seismic.events) ? seismic.events : [];
    const largest = events.reduce((max, event) => Math.max(max, Number(event.magnitude) || -Infinity), -Infinity);
    const concentration = Array.isArray(seismic.activity_concentrations) ? seismic.activity_concentrations[0] : null;
    const interpretations = Array.isArray(data?.prometheus_interpretation) ? data.prometheus_interpretation : [];

    text('[data-nz-count]', seismic.event_count);
    text('[data-nz-largest]', Number.isFinite(largest) ? `M${largest.toFixed(1)}` : '—');
    text('[data-nz-cluster]', concentration ? `${concentration.count} near ${safe(concentration.nearest_locality, 'leading cluster')}` : '—');
    text('[data-nz-date]', data?.local_date ? `Daily state · ${data.local_date}` : 'Latest daily state');
    text('[data-nz-interpretation-one]', interpretations[0] || 'The latest New Zealand interpretation is not available in this public snapshot.');
    text('[data-nz-interpretation-two]', interpretations[1] || 'EarthNet keeps unusual activity distinct from a predictive claim unless the evidence supports one.');
  }

  function renderVolcano(data) {
    const alert = Array.isArray(data?.alerts) ? data.alerts[0] : null;
    if (!alert) {
      text('[data-volcano-proof]', 'No significant volcanic pulse in the latest public snapshot.');
      return;
    }
    const measurement = Array.isArray(alert.measurements) ? alert.measurements[0] : null;
    const sigma = measurement && Number.isFinite(Number(measurement.score_sigma)) ? `${Math.abs(Number(measurement.score_sigma)).toFixed(2)}σ` : 'measurable change';
    const official = alert.official_status || {};
    text('[data-volcano-proof]', `${safe(alert.name)}: ${sigma} ${safe(measurement?.family, 'signal change')} against its recent baseline; GeoNet Level ${safe(official.level)} / ${safe(official.aviation_colour_code)}.`);
  }

  function renderPrometheus(data) {
    const calibration = data?.calibration || {};
    const open = Array.isArray(data?.open) ? data.open : [];
    text('[data-prom-open]', open.length);
    text('[data-prom-resolved]', calibration.resolved_count);
    text('[data-prom-brier]', Number.isFinite(Number(calibration.brier_score)) ? Number(calibration.brier_score).toFixed(3) : '—');
  }

  async function boot() {
    const results = await Promise.allSettled([
      getJson('data/earthnet_latest.json'),
      getJson('data/earthnet_nz_daily.json'),
      getJson('data/earthnet_volcano_pulse.json'),
      getJson('data/earthnet_prometheus.json')
    ]);

    if (results[0].status === 'fulfilled') renderGlobal(results[0].value);
    else $$('.earthnet-data-error').forEach((node) => { node.textContent = 'The latest public EarthNet snapshot could not be loaded just now.'; });

    if (results[1].status === 'fulfilled') renderNz(results[1].value);
    if (results[2].status === 'fulfilled') renderVolcano(results[2].value);
    if (results[3].status === 'fulfilled') renderPrometheus(results[3].value);
  }

  boot();
})();
