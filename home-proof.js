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
    text('#proof-brier-note', 'Lower is better · 0 = perfect · a 50% yes/no forecast scores 0.25.');

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

  boot();
})();
