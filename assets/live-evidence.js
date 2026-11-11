/* Read-only, fail-closed public evidence summaries for redesigned Pythology pages. */
(() => {
  'use strict';
  const cards = [...document.querySelectorAll('[data-live-evidence]')];
  if (!cards.length) return;
  const nzTime = input => {
    const d = new Date(input || '');
    return Number.isFinite(d.getTime()) ?
      new Intl.DateTimeFormat('en-NZ', {
        timeZone: 'Pacific/Auckland', dateStyle: 'medium', timeStyle: 'short'
      }).format(d) + ' NZ time' : 'Timestamp not verified';
  };
  const fresh = (stamp, hours) => {
    const ms = Date.parse(stamp || '');
    const age = Date.now() - ms;
    return Number.isFinite(ms) && age >= -120000 && age <= hours * 3600000;
  };
  const count = n => typeof n === 'number' && Number.isFinite(n) && n >= 0 ?
    n.toLocaleString('en-NZ') : '—';
  const state = (kind, title, details, timestamp, ok) => {
    for (const card of cards.filter(el => el.dataset.liveEvidence === kind)) {
      card.dataset.state = ok ? 'verified' : 'stale';
      card.querySelector('[data-live-state]').textContent = title;
      card.querySelector('[data-live-detail]').textContent = details;
      card.querySelector('[data-live-date]').textContent =
        timestamp ? 'Source timestamp: ' + nzTime(timestamp) : 'Source timestamp unavailable';
    }
  };
  const unsupported = kind => state(kind, 'PUBLIC SOURCE UNAVAILABLE',
    'This public source cannot be verified. Do not infer an absence of activity or risk.', null, false);
  const specs = {
    ledger: {
      url: 'data/earthnet_prometheus.json', hours: 48,
      render(d) {
        const c = d?.calibration;
        if (!c || typeof c !== 'object') throw Error('Missing calibration');
        const verified = fresh(d.generated_at, this.hours);
        const brier = typeof c.brier_score === 'number' &&
          c.brier_score >= 0 && c.brier_score <= 1 ? c.brier_score.toFixed(3) : '—';
        const metrics = 'Resolved assessments: ' + count(c.resolved_count) +
          ' · Calibrated forecasts: ' + count(c.calibrated_forecast_count) +
          ' · Observed outcomes: ' + count(c.confirmed_count) +
          ' · Brier score: ' + brier;
        state('ledger', verified ? 'RECENT PUBLIC LEDGER' : 'DATED LEDGER · NOT CURRENT',
          metrics + '. Prospective research calibration is not independently validated predictive skill.',
          d.generated_at, verified);
      }
    },
    nz: {
      url: 'data/earthnet_nz_daily.json', hours: 36,
      render(d) {
        if (!d || !d.seismic || !d.local_date) throw Error('Missing daily state');
        const verified = fresh(d.generated_at, this.hours);
        state('nz', verified ? 'RECENT NZ DAILY SNAPSHOT' : 'LAST PUBLISHED · NOT CURRENT',
          'Catalogue events in snapshot: ' + count(d.seismic.event_count) +
          '. A national observational summary, not a hazard forecast or official alert.',
          d.generated_at, verified);
      }
    },
    weather: {
      url: 'data/prometheus_weather_research.json', hours: 6,
      render(d) {
        if (d?.schema !== 'pythology.weather-public-screening.v1') throw Error('Schema mismatch');
        const verified = fresh(d.generated_at, this.hours);
        state('weather', verified ? 'RECENT RESEARCH SCREEN' : 'LAST PUBLISHED · NOT CURRENT',
          'Global source rows: ' + count(d.global?.source_event_rows) +
          ' · Screening matches: ' + count(d.global?.matched_rows) +
          '. Candidates are not validated event predictions.',
          d.generated_at, verified);
      }
    },
    geology: {
      url: 'https://atlas.pythology.co.nz/public-research/precursor.json', hours: 3,
      render(d) {
        if (!d || d.research_only !== true) throw Error('Unverified geological research');
        const stamp = d.observed_utc;
        const verified = fresh(stamp, this.hours) && d.status === 'ok' &&
          d.source_health?.USGS === 'OK' && d.source_health?.GVP === 'OK';
        state('geology', verified ? 'RECENT PUBLIC RESEARCH SCREEN' : 'LAST PUBLISHED · NOT VERIFIED',
          'Centres analysed: ' + count(d.counts?.analysed_centres) +
          ' · Multi-signal areas: ' + count(d.counts?.multi_signal_centres) +
          '. Research patterns are not earthquake or eruption warnings.',
          stamp, verified);
      }
    },
    weatherlab: {
      url: 'https://atlas.pythology.co.nz/public-research/weather.json', hours: .5,
      render(d) {
        if (!d || d.schema !== 'pythology.weather-lab.public-research/v1' ||
            d.research_only !== true) throw Error('Unverified weather public research');
        const verified = fresh(d.generated_at, this.hours) && d.status !== 'unavailable';
        const sources = d.adapters || {};
        const label = s => s?.source_fresh === true ? 'current' : 'not verified';
        state('weatherlab', verified ? 'RECENT PUBLIC WEATHER RESEARCH' : 'STALE / SOURCE NOT VERIFIED',
          'NEXRAD: ' + label(sources.nexrad) +
          ' · NWS: ' + label(sources.nws_alerts) +
          ' · NHC: ' + label(sources.nhc_storms) +
          '. This is research status, not an official warning service.',
          d.generated_at, verified);
      }
    }
  };
  const update = async kind => {
    const spec = specs[kind];
    if (!spec) return;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    try {
      const response = await fetch(spec.url, {
        cache: 'no-store', credentials: 'omit', signal: controller.signal
      });
      if (!response.ok) throw Error('HTTP ' + response.status);
      spec.render(await response.json());
    } catch (_) {
      unsupported(kind);
    } finally {
      clearTimeout(timeout);
    }
  };
  function refresh() {
    for (const kind of new Set(cards.map(card => card.dataset.liveEvidence))) {
      void update(kind);
    }
  }
  refresh();
  setInterval(() => { if (!document.hidden) refresh(); }, 5 * 60 * 1000);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) refresh();
  });
})();