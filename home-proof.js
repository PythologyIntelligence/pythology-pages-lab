(() => {
  const safe = (value, fallback = '—') => value === undefined || value === null || value === '' ? fallback : value;
  const pct = (value) => Number.isFinite(Number(value)) ? `${Math.round(Number(value) * 100)}%` : '—';
  const all = (selector) => Array.from(document.querySelectorAll(selector));

  function text(selector, value) {
    all(selector).forEach((node) => { node.textContent = safe(value); });
  }

  function textAny(selectors, value) {
    selectors.forEach((selector) => text(selector, value));
  }

  function shortDate(value) {
    if (!value) return '—';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    return new Intl.DateTimeFormat('en-NZ', {
      timeZone: 'Pacific/Auckland', day: 'numeric', month: 'short', year: 'numeric'
    }).format(date);
  }

  async function getJson(path) {
    const response = await fetch(path, { cache: 'no-store' });
    if (!response.ok) throw new Error(`${path}: ${response.status}`);
    return response.json();
  }

  function fallbackFeatured(data) {
    const now = Date.now();
    const open = Array.isArray(data.open) ? data.open : [];
    return open
      .filter((item) => {
        const confidence = Number(item.forecast_confidence);
        if (!Number.isFinite(confidence) || confidence < 0.45) return false;
        const expiry = item.valid_until ? new Date(item.valid_until).getTime() : Infinity;
        return !Number.isFinite(expiry) || expiry > now;
      })
      .map((item) => {
        const calibrated = item.confidence_label === 'empirically_calibrated' || item.calibrated === true;
        const sources = Math.min(Number(item.source_independence_count || 0), 3);
        return { item, score: Number(item.forecast_confidence || 0) + (calibrated ? 0.18 : 0) + (sources * 0.06) };
      })
      .sort((a, b) => b.score - a.score)
      .map(({ item }) => item)[0] || null;
  }

  function featuredForecast(data) {
    if (Array.isArray(data.featured) && data.featured.length) return { item: data.featured[0], native: true };
    if (Array.isArray(data?.publication?.featured) && data.publication.featured.length) return { item: data.publication.featured[0], native: true };
    return { item: fallbackFeatured(data), native: false };
  }

  function latestResolved(data) {
    const history = Array.isArray(data.history) ? data.history : [];
    return history
      .filter((item) => item?.status === 'resolved' || item?.resolved_at || item?.outcome?.state)
      .slice()
      .sort((a, b) => new Date(b.resolved_at || b.valid_until || 0) - new Date(a.resolved_at || a.valid_until || 0))[0] || null;
  }

  function renderPrometheus(data) {
    const calibration = data.calibration || {};
    const resolved = Number(calibration.resolved_count);
    const hitRate = Number(calibration.hit_rate);
    const brier = Number(calibration.brier_score);

    textAny(['[data-home-prom-resolved]', '#proof-ledger-resolved'], Number.isFinite(resolved) ? resolved : '—');
    textAny(['#proof-ledger-hitrate'], Number.isFinite(hitRate) ? pct(hitRate) : '—');
    textAny(['[data-home-prom-brier]', '#proof-ledger-brier'], Number.isFinite(brier) ? brier.toFixed(3) : '—');
    textAny(['[data-home-prom-updated]'], `Public ledger · ${shortDate(data.generated_at)}`);
    text('#proof-date', shortDate(data.generated_at));
    text('#proof-brier-note', 'Lower is better · 0 = perfect. Measures how closely forecast probabilities matched real outcomes.');

    const featured = featuredForecast(data);
    if (!featured.item) {
      textAny(['[data-home-forecast-title]', '#proof-forecast-label'], 'No public forecast currently passes the featured gate');
      textAny(['[data-home-forecast-statement]', '#proof-forecast-text'], 'The wider Prometheus ledger remains available.');
      textAny(['#proof-forecast-confidence', '#proof-forecast-confindence'], '—');
      text('#proof-forecast-horizon', '—');
    } else {
      const forecast = featured.item;
      textAny(['[data-home-forecast-title]', '#proof-forecast-label'], forecast.target_title || forecast.region || 'Validation forecast');
      textAny(['[data-home-forecast-statement]', '#proof-forecast-text'], forecast.statement);
      const confidence = pct(forecast.forecast_confidence);
      textAny(['[data-home-forecast-confidence]', '#proof-forecast-confidence', '#proof-forecast-confindence'], confidence === '—' ? confidence : `${confidence} confidence`);
      textAny(['[data-home-forecast-valid]', '#proof-forecast-horizon'], forecast.valid_until ? `Valid to ${shortDate(forecast.valid_until)}` : 'Open forecast');
      text('[data-home-forecast-sources]', `${Number(forecast.source_independence_count || 0)} source ${Number(forecast.source_independence_count || 0) === 1 ? 'family' : 'families'}`);
      text('[data-home-forecast-mode]', featured.native ? 'Chosen by Prometheus' : 'Validation forecast');
    }

    const resolvedItem = latestResolved(data);
    if (resolvedItem) {
      const state = safe(resolvedItem?.outcome?.state, 'resolved').replaceAll('_', ' ');
      text('#proof-outcome-text', resolvedItem.target_title || resolvedItem.region || resolvedItem.statement || 'Latest resolved forecast');
      text('#proof-outcome-result', `${state} · ${shortDate(resolvedItem.resolved_at || resolvedItem.valid_until)}`);
    } else {
      text('#proof-outcome-text', 'No resolved public forecast is available in this snapshot.');
      text('#proof-outcome-result', '—');
    }
  }

  function renderNz(data) {
    const seismic = data.seismic || {};
    const events = Array.isArray(seismic.events) ? seismic.events : [];
    const largest = events.reduce((max, item) => Math.max(max, Number(item.magnitude) || -Infinity), -Infinity);
    const concentration = Array.isArray(seismic.activity_concentrations) ? seismic.activity_concentrations[0] : null;
    text('[data-home-nz-date]', data.local_date ? `Daily state · ${data.local_date}` : 'Latest daily state');
    text('[data-home-nz-count]', seismic.event_count);
    text('[data-home-nz-largest]', Number.isFinite(largest) ? `M${largest.toFixed(1)}` : '—');
    text('[data-home-nz-cluster]', concentration ? `${concentration.count} near ${safe(concentration.nearest_locality, 'leading concentration')}` : '—');
    const interpretation = Array.isArray(data.prometheus_interpretation) ? data.prometheus_interpretation[0] : null;
    text('[data-home-nz-line]', interpretation || 'The latest New Zealand interpretation is not available just now.');
  }

  function renderVolcano(data) {
    const alert = Array.isArray(data.alerts) ? data.alerts[0] : null;
    if (!alert) {
      text('[data-home-volcano-title]', 'No significant volcanic pulse in the current public snapshot');
      text('[data-home-volcano-value]', 'Quiet');
      return;
    }
    const measurement = Array.isArray(alert.measurements) ? alert.measurements[0] : null;
    text('[data-home-volcano-title]', alert.title || alert.name);
    text('[data-home-volcano-value]', measurement && Number.isFinite(Number(measurement.score_sigma)) ? `${Math.abs(Number(measurement.score_sigma)).toFixed(2)}σ` : 'Change');
  }

  async function boot() {
    const results = await Promise.allSettled([
      getJson('data/earthnet_prometheus.json'),
      getJson('data/earthnet_nz_daily.json'),
      getJson('data/earthnet_volcano_pulse.json')
    ]);
    if (results[0].status === 'fulfilled') renderPrometheus(results[0].value);
    if (results[1].status === 'fulfilled') renderNz(results[1].value);
    if (results[2].status === 'fulfilled') renderVolcano(results[2].value);
  }

  if (!document.getElementById('home-visual-presence')) {
    const style = document.createElement('style');
    style.id = 'home-visual-presence';
    style.textContent = `
      .pitch-body .home-pitch-hero::before {
        opacity: .72 !important;
        filter: saturate(.94) contrast(1) !important;
      }
      .pitch-body .home-pitch-hero::after {
        background: linear-gradient(90deg,#060a0d 0%,rgba(6,10,13,.94) 34%,rgba(6,10,13,.42) 60%,rgba(6,10,13,.05) 100%) !important;
      }
      .home-domain-band {
        background: #060a0d !important;
      }
      .home-dual-view .home-view-card:nth-child(2)::before {
        background-image: url('data:image/webp;base64,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') !important;
        background-position: center !important;
        background-size: cover !important;
        opacity: .82 !important;
      }
      .founder-note {
        background:
          linear-gradient(100deg,rgba(7,15,20,.98) 0%,rgba(7,15,20,.80) 48%,rgba(7,15,20,.38) 100%),
          url('png_images/causal_intelligence.png') center / cover no-repeat !important;
      }
      @media (max-width: 720px) {
        .pitch-body .home-pitch-hero::before { opacity: .52 !important; }
      }
    `;
    document.head.appendChild(style);
  }

  boot();
})();
