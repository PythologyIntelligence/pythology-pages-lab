(() => {
  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => Array.from(document.querySelectorAll(selector));
  const safe = (value, fallback = '—') => value === undefined || value === null || value === '' ? fallback : value;
  const pct = (value) => Number.isFinite(Number(value)) ? `${Math.round(Number(value) * 100)}%` : '—';

  function nzDate(value) {
    if (!value) return '—';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    return new Intl.DateTimeFormat('en-NZ', {
      timeZone: 'Pacific/Auckland',
      day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit'
    }).format(date);
  }

  function shortDate(value) {
    if (!value) return '—';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    return new Intl.DateTimeFormat('en-NZ', {
      timeZone: 'Pacific/Auckland', day: 'numeric', month: 'short', year: 'numeric'
    }).format(date);
  }

  function text(selector, value) {
    const node = $(selector);
    if (node) node.textContent = safe(value);
  }

  function el(tag, className, content) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (content !== undefined) node.textContent = safe(content, '');
    return node;
  }

  async function getJson(path) {
    const response = await fetch(path, { cache: 'no-store' });
    if (!response.ok) throw new Error(`${path}: ${response.status}`);
    return response.json();
  }

  function outcomeLabel(forecast) {
    const state = forecast?.outcome?.state;
    if (state === 'confirmed') return 'Observed later';
    if (state === 'not_observed') return 'Not observed';
    if (state) return String(state).replaceAll('_', ' ');
    return 'Open forecast';
  }

  function forecastCard(forecast, options = {}) {
    const { resolved = false, featured = false } = options;
    const article = el('article', `forecast-card${featured ? ' featured-forecast' : ''}`);
    const outcome = forecast?.outcome?.state || (resolved ? 'resolved' : 'open');
    article.dataset.outcome = outcome;

    const meta = el('div', 'forecast-meta');
    const status = el('span', 'forecast-status', resolved ? outcomeLabel(forecast) : featured ? 'Featured forecast' : 'Open forecast');
    const when = el('span', '', resolved ? `resolved ${shortDate(forecast.resolved_at)}` : `valid to ${shortDate(forecast.valid_until)}`);
    meta.append(status, when);

    const title = el('h3', '', forecast.target_title || forecast.region);
    const statement = el('div', 'forecast-statement', forecast.statement);

    const confidence = el('div', 'forecast-confidence');
    const confidenceValue = el('strong', '', pct(forecast.forecast_confidence));
    const sourceCount = Number(forecast.source_independence_count || 0);
    const sourceLabel = sourceCount === 1 ? '1 source family' : `${sourceCount} source families`;
    const labelParts = ['confidence at commitment', sourceLabel];
    if (forecast.confidence_label === 'empirically_calibrated' || forecast.calibrated === true) labelParts.push('calibrated policy');
    confidence.append(confidenceValue, el('span', '', labelParts.join(' · ')));

    const alternative = el('div', 'forecast-alt');
    const altLead = el('strong', '', 'Competing outcome: ');
    alternative.append(altLead, document.createTextNode(String(safe(forecast.alternative, 'No competing outcome recorded.'))));

    const provenance = el('div', 'forecast-provenance');
    provenance.append(
      el('span', '', `Committed ${shortDate(forecast.created_at)}`),
      el('span', '', `ID ${safe(forecast.forecast_id, 'unavailable')}`)
    );

    article.append(meta, title, statement, confidence, alternative, provenance);

    if (resolved) {
      const result = el('div', 'forecast-result');
      result.append(el('strong', '', outcomeLabel(forecast)));
      const matched = Array.isArray(forecast?.outcome?.matched_titles) ? forecast.outcome.matched_titles : [];
      const detail = matched.length
        ? `Later evidence matched: ${matched.slice(0, 2).join(' · ')}`
        : 'No qualifying later event was observed inside the forecast policy window.';
      result.append(el('span', '', detail));
      if (Number.isFinite(Number(forecast?.outcome?.brier_component))) {
        result.append(el('span', '', `Brier component ${Number(forecast.outcome.brier_component).toFixed(3)}`));
      }
      article.appendChild(result);
    }

    return article;
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
        const confidence = Number(item.forecast_confidence) || 0;
        const calibrated = item.confidence_label === 'empirically_calibrated' || item.calibrated === true;
        const sources = Math.min(Number(item.source_independence_count || 0), 3);
        const score = confidence + (calibrated ? 0.18 : 0) + (sources * 0.06);
        return { item, score };
      })
      .sort((a, b) => b.score - a.score)
      .map(({ item }) => item)
      .slice(0, 3);
  }

  function selectedFeatured(data) {
    if (Array.isArray(data.featured) && data.featured.length) return { items: data.featured.slice(0, 3), native: true };
    if (Array.isArray(data?.publication?.featured) && data.publication.featured.length) {
      return { items: data.publication.featured.slice(0, 3), native: true };
    }
    return { items: fallbackFeatured(data), native: false };
  }

  function renderForecastCollection(selector, items, options, emptyMessage) {
    const wrap = $(selector);
    if (!wrap) return;
    wrap.replaceChildren();
    if (!items.length) {
      wrap.appendChild(el('p', 'loading-copy', emptyMessage));
      return;
    }
    items.forEach((forecast) => wrap.appendChild(forecastCard(forecast, options)));
  }

  function renderHistoryFeed(history) {
    const wrap = $('[data-history-feed]');
    if (!wrap) return;
    wrap.replaceChildren();
    if (!history.length) {
      wrap.appendChild(el('p', 'loading-copy', 'No resolved forecast history is available in the current public projection.'));
      return;
    }

    history.slice(0, 12).forEach((forecast) => {
      const row = el('article', 'history-row');
      row.dataset.outcome = forecast?.outcome?.state || 'resolved';
      const marker = el('div', 'history-marker', forecast?.outcome?.state === 'confirmed' ? '✓' : '—');
      const copy = el('div', 'history-copy');
      copy.append(
        el('strong', '', forecast.target_title || forecast.region),
        el('span', '', `${pct(forecast.forecast_confidence)} at commitment · ${outcomeLabel(forecast)} · ${shortDate(forecast.resolved_at)}`)
      );
      const summary = el('div', 'history-summary', forecast.statement);
      row.append(marker, copy, summary);
      wrap.appendChild(row);
    });
  }

  function renderPrometheus(data) {
    const calibration = data.calibration || {};
    text('[data-prom-resolved]', calibration.resolved_count);
    text('[data-prom-calibrated]', calibration.calibrated_forecast_count);
    text('[data-prom-confirmed]', calibration.confirmed_count);
    text('[data-prom-brier]', Number.isFinite(Number(calibration.brier_score)) ? Number(calibration.brier_score).toFixed(3) : '—');
    text('[data-prom-updated]', `Ledger updated ${nzDate(data.generated_at)} NZ time`);

    const featured = selectedFeatured(data);
    renderForecastCollection('[data-featured-forecasts]', featured.items, { featured: true }, 'No forecast currently passes the public featured gate.');
    text('[data-featured-note]', featured.native
      ? 'Chosen by Prometheus from the public forecast projection.'
      : 'Prototype ranking: prioritises confidence, calibrated policy and independent source families. Tomorrow Prometheus will publish this selection himself.');

    const open = Array.isArray(data.open) ? data.open.slice(0, 6) : [];
    renderForecastCollection('[data-open-forecasts]', open, {}, 'No open forecasts in the current public projection.');

    const history = Array.isArray(data.history) ? data.history : [];
    renderForecastCollection('[data-resolved-forecasts]', history.slice(0, 6), { resolved: true }, 'No resolved forecasts in the current public projection.');
    renderHistoryFeed(history);

    const integrity = data.integrity || {};
    if (integrity.forecast_records_are_frozen_after_commitment && integrity.outcomes_are_later_resolutions_not_rewrites) {
      text('[data-integrity-copy]', 'The original forecast stays frozen after commitment. Later outcomes are added as resolutions, not edits to the original prediction. Misses stay in the record too.');
    }
  }

  function renderNz(data) {
    const seismic = data.seismic || {};
    const events = Array.isArray(seismic.events) ? seismic.events : [];
    const largest = events.reduce((max, item) => Math.max(max, Number(item.magnitude) || -Infinity), -Infinity);
    const concentration = Array.isArray(seismic.activity_concentrations) ? seismic.activity_concentrations[0] : null;

    text('[data-nz-date]', data.local_date ? `New Zealand · ${data.local_date}` : 'New Zealand · latest daily state');
    text('[data-nz-generated]', data.generated_at_nz ? `Generated ${nzDate(data.generated_at_nz)}` : `Generated ${nzDate(data.generated_at)}`);
    text('[data-nz-count]', seismic.event_count);
    text('[data-nz-largest]', Number.isFinite(largest) ? `M${largest.toFixed(1)}` : '—');
    text('[data-nz-cluster]', concentration ? `${concentration.count} near ${concentration.nearest_locality || 'the leading concentration'}` : '—');

    const list = $('[data-nz-interpretation]');
    if (list) {
      list.replaceChildren();
      const items = Array.isArray(data.prometheus_interpretation) ? data.prometheus_interpretation : [];
      items.forEach((item) => list.appendChild(el('li', '', item)));
      if (!items.length) list.appendChild(el('li', '', 'No interpretation is available in the latest public snapshot.'));
    }
  }

  function renderVolcano(data) {
    const alert = Array.isArray(data.alerts) ? data.alerts[0] : null;
    if (!alert) {
      text('[data-volcano-name]', 'No significant volcanic pulse in the current snapshot');
      text('[data-volcano-value]', 'Quiet');
      text('[data-volcano-copy]', 'Healthy monitoring cycles can remain silent. A missing alert is not presented as evidence that volcanic risk is zero.');
      return;
    }

    const measurement = Array.isArray(alert.measurements) ? alert.measurements[0] : null;
    text('[data-volcano-name]', alert.title || alert.name);
    text('[data-volcano-value]', measurement && Number.isFinite(Number(measurement.score_sigma)) ? `${Math.abs(Number(measurement.score_sigma)).toFixed(2)}σ` : 'Change');
    const official = alert.official_status || {};
    const officialText = `GeoNet Level ${safe(official.level)} · aviation ${safe(official.aviation_colour_code)}. `;
    const candidateText = alert.candidate
      ? 'The stricter multi-family research threshold was also met.'
      : 'The family-level change was significant, but the stricter multi-family research threshold was not met.';
    text('[data-volcano-copy]', `${officialText}${safe(alert.summary)}. ${candidateText}`);
    text('[data-volcano-time]', `Observed ${nzDate(alert.observed_at)} NZ time`);
  }

  async function boot() {
    const results = await Promise.allSettled([
      getJson('data/earthnet_prometheus.json'),
      getJson('data/earthnet_nz_daily.json'),
      getJson('data/earthnet_volcano_pulse.json')
    ]);

    if (results[0].status === 'fulfilled') renderPrometheus(results[0].value);
    else $$('.prometheus-data-error').forEach((node) => { node.textContent = 'The live public ledger could not be loaded just now.'; });

    if (results[1].status === 'fulfilled') renderNz(results[1].value);
    else {
      const node = $('[data-nz-error]');
      if (node) node.textContent = 'The latest New Zealand daily snapshot could not be loaded just now.';
    }

    if (results[2].status === 'fulfilled') renderVolcano(results[2].value);
    else {
      const node = $('[data-volcano-copy]');
      if (node) node.textContent = 'The latest public volcanic pulse could not be loaded just now.';
    }
  }

  boot();
})();
