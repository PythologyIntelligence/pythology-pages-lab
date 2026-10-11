/* EnviroArc public research projection: display only, never launches scans. */
(() => {
  'use strict';
  const ENDPOINT = 'https://atlas.pythology.co.nz/public-research/precursor.json';
  const section = document.getElementById('enviroarc-research-live');
  if (!section) return;
  const $ = (name) => section.querySelector('[data-er-' + name + ']');
  const safeText = (v, fallback = '—') => v == null || v === '' ? fallback : String(v);
  const num = (v) => v == null || !Number.isFinite(Number(v)) ? '—' : Number(v).toLocaleString('en-NZ');
  const stamp = (v) => {
    const ms = Date.parse(v || '');
    if (!Number.isFinite(ms)) return 'Unavailable';
    return new Intl.DateTimeFormat('en-NZ', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Pacific/Auckland' }).format(ms) + ' NZ time';
  };
  const set = (name, value) => { const el = $(name); if (el) el.textContent = safeText(value); };
  const clear = (node) => { while (node.firstChild) node.removeChild(node.firstChild); };
  const mark = (label, tone) => {
    const chip = $('status');
    if (!chip) return;
    chip.textContent = label;
    chip.dataset.tone = tone;
  };
  const validCoordinates = (item) => Number.isFinite(Number(item.lat)) &&
    Number.isFinite(Number(item.lon)) && Math.abs(Number(item.lat)) <= 90 && Math.abs(Number(item.lon)) <= 180;
  const neatLocation = (item) => {
    const named = [item.name, item.subregion, item.country].map(v => safeText(v, '')).filter(Boolean);
    const unique = [...new Set(named)];
    return unique.length ? unique.join(' · ') : Number(item.lat).toFixed(2) + '°, ' + Number(item.lon).toFixed(2) + '°';
  };
  const modeName = (item) => item.kind === 'volcano_context'
    ? 'NEAR A CATALOGUED VOLCANO' : 'REGIONAL SEISMIC SCREEN';
  const phaseName = (v) => ['WATCHING', 'ANOMALY', 'MULTI_SIGNAL'].includes(v) ? v.replace('_', ' ') : 'UNCLASSIFIED';
  function renderFindings(rows, fresh) {
    const list = $('findings');
    if (!list) return;
    clear(list);
    const items = Array.isArray(rows) ? rows.filter(validCoordinates).slice(0, 6) : [];
    if (!items.length) {
      const note = document.createElement('p');
      note.className = 'er-empty';
      note.textContent = 'No curated research locations were published in this scan. This is not evidence of geological safety.';
      list.appendChild(note);
      return;
    }
    items.forEach((item, index) => {
      const card = document.createElement('article');
      card.className = 'er-finding';
      const top = document.createElement('div');
      top.className = 'er-finding-top';
      const order = document.createElement('span');
      order.textContent = String(index + 1).padStart(2, '0') + ' · ' + modeName(item);
      const badge = document.createElement('b');
      badge.dataset.phase = item.phase || 'UNKNOWN';
      badge.textContent = phaseName(item.phase);
      top.append(order, badge);
      const title = document.createElement('h4');
      title.textContent = neatLocation(item);
      const why = document.createElement('p');
      const signals = Array.isArray(item.signals) ? item.signals.filter(Boolean).slice(0, 4) : [];
      const signalText = signals.length ? signals.join(' · ') : 'Catalogue-screening context';
      why.textContent = signalText + ' · ' + num(item.count) + ' local catalogue events';
      const foot = document.createElement('small');
      foot.textContent = (fresh ? 'Latest completed scan' : 'Historical scan — not current') +
        (item.last_event_utc ? ' · Last event ' + stamp(item.last_event_utc) : '');
      card.append(top, title, why, foot);
      list.appendChild(card);
    });
  }
  function render(data) {
    if (!data || typeof data !== 'object' || data.research_only !== true) throw new Error('Unverified research projection');
    const observed = Date.parse(data.observed_utc || '');
    const age = (Date.now() - observed) / 60000;
    const stateOk = data.status === 'ok' && Number.isFinite(age) && age >= -1 && age <= 180;
    const health = data.source_health || {};
    const feedOk = health.USGS === 'OK' && health.GVP === 'OK';
    const current = stateOk && feedOk;
    const degraded = stateOk && !feedOk;
    mark(current ? 'CURRENT HOURLY RESEARCH' : degraded ? 'SOURCE COVERAGE DEGRADED' : 'STALE / NOT CURRENT',
      current ? 'live' : degraded ? 'caution' : 'stale');
    set('updated', stamp(data.observed_utc));
    set('origin', 'USGS feed generated: ' + stamp(data.feed_generated_utc));
    set('analysed', num(data.counts?.analysed_centres));
    set('multisignal', num(data.counts?.multi_signal_centres));
    set('candidates', num(data.counts?.active_candidate_centres));
    set('source', 'USGS: ' + safeText(health.USGS, 'UNKNOWN') +
      ' · GVP inventory: ' + safeText(health.GVP, 'UNKNOWN') +
      ' · US official context: ' + safeText(health.HANS_US_volcanoes, 'UNKNOWN'));
    set('mode', 'Mode: ' + safeText(data.mode, 'research') +
      '. Centre classifications describe seismic catalogue patterns, not forecasts.');
    renderFindings(data.findings, current);
  }
  async function poll() {
    try {
      const ctrl = new AbortController();
      const abort = setTimeout(() => ctrl.abort(), 12000);
      let response;
      try { response = await fetch(ENDPOINT, { cache: 'no-store', signal: ctrl.signal, credentials: 'omit' }); }
      finally { clearTimeout(abort); }
      if (!response.ok) throw new Error('Research relay HTTP ' + response.status);
      render(await response.json());
    } catch (_) {
      mark('LIVE RELAY UNAVAILABLE', 'stale');
      set('updated', 'Latest research scan could not be verified.');
      set('origin', 'No current results are implied. The independent hourly watcher may still be running.');
      set('analysed', '—'); set('multisignal', '—'); set('candidates', '—');
      set('source', 'Public research relay unavailable; private collection remains independent.');
      set('mode', 'This display never starts a scan or makes earthquake/eruption predictions.');
      const list = $('findings');
      if (list) {
        clear(list);
        const p = document.createElement('p');
        p.className = 'er-empty';
        p.textContent = 'Live research locations are temporarily unavailable. Historical experiment records below remain accessible.';
        list.appendChild(p);
      }
    }
  }
  void poll();
  // A modest refresh; the collector itself runs hourly and this display never drives it.
  setInterval(() => { if (!document.hidden) void poll(); }, 5 * 60 * 1000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) void poll(); });
})();
