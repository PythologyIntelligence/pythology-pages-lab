(() => {
  'use strict';

  const DATA = {
    health: 'data/system-health.json',
    earth: 'data/earthnet_status.json',
    latest: 'data/earthnet_latest.json',
    prometheus: 'data/earthnet_prometheus.json'
  };

  const state = { health: null, earth: null, latest: null, prometheus: null, refreshedAt: null };
  const $ = (id) => document.getElementById(id);

  function esc(value) {
    return String(value ?? '').replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }

  function number(value, fallback = 0) {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
  }

  function ageMinutes(ts) {
    const ms = Date.parse(ts || '');
    return Number.isFinite(ms) ? Math.max(0, Math.round((Date.now() - ms) / 60000)) : null;
  }

  async function getJson(url) {
    const response = await fetch(`${url}?v=${Date.now()}`, { cache: 'no-store' });
    if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
    return response.json();
  }

  function setChip(id, text, status = '') {
    const el = $(id);
    if (!el) return;
    el.textContent = text;
    el.className = `chip ${status}`.trim();
  }

  function renderClock() {
    const clock = $('clock');
    if (clock) clock.textContent = new Intl.DateTimeFormat('en-NZ', { hour:'2-digit', minute:'2-digit', second:'2-digit', hour12:false }).format(new Date());
  }

  function renderFleet() {
    const h = state.health;
    if (!h || !Array.isArray(h.systems)) return;

    const grid = $('system-grid');
    grid.innerHTML = h.systems.map((s) => {
      const status = ['operational','degraded','down'].includes(s.status) ? s.status : 'degraded';
      const summary = s.summary || 'No public-safe summary available.';
      const age = Number.isFinite(Number(s.snapshotAgeMinutes)) ? `${s.snapshotAgeMinutes} min old` : '';
      return `<article class="system-node ${esc(status)}">
        <div class="node-head"><span class="node-light"></span><strong>${esc(s.name || s.id)}</strong></div>
        <small>${esc(summary)}</small>
        <em>${esc(String(s.status || 'unknown').toUpperCase())}${age ? ` · ${esc(age)}` : ''}</em>
      </article>`;
    }).join('');

    const operational = h.systems.filter((s) => s.status === 'operational').length;
    const attention = h.systems.length - operational;
    $('systems-healthy').textContent = operational;
    $('systems-attention').textContent = attention;

    const fleetStatus = h.fleet?.status || (attention ? 'degraded' : 'operational');
    if (fleetStatus === 'operational') setChip('fleet-chip', 'NOMINAL', 'good');
    else if (h.systems.some((s) => s.status === 'down')) setChip('fleet-chip', 'ATTENTION', 'danger');
    else setChip('fleet-chip', 'DEGRADED', 'warn');

    const core = $('core-state');
    core.className = '';
    if (!attention) {
      core.textContent = 'NOMINAL';
      core.classList.add('nominal');
      $('core-summary').textContent = `All ${h.systems.length} monitored Pythology surfaces are operational.`;
    } else if (h.systems.some((s) => s.status === 'down')) {
      core.textContent = 'ATTENTION';
      core.classList.add('incident');
      const names = h.systems.filter((s) => s.status !== 'operational').map((s) => s.name).join(', ');
      $('core-summary').textContent = `${operational} of ${h.systems.length} monitored surfaces are operational. Attention: ${names}.`;
    } else {
      core.textContent = 'DEGRADED';
      core.classList.add('degraded');
      $('core-summary').textContent = `${operational} of ${h.systems.length} monitored surfaces are operational; one or more checks need attention.`;
    }
  }

  function renderEarth() {
    const e = state.earth;
    if (!e) {
      setChip('earth-chip', 'NO LINK', 'danger');
      return;
    }

    const engines = number(e.engine_count, number(e.engines_completed, 0));
    const events = number(e.event_count, number(e.events_count, 0));
    const failedObj = e.failed_engines && typeof e.failed_engines === 'object' ? e.failed_engines : {};
    const failures = Array.isArray(e.failed_engines) ? e.failed_engines.length : Object.keys(failedObj).length;
    const ts = e.live_data_plane?.published_at || e.cycle_completed_at || e.generated || e.generated_at;
    const age = ageMinutes(ts);

    $('earth-events').textContent = events || '0';
    $('earth-engines').textContent = engines || '0';
    $('earth-failures').textContent = failures;
    $('earth-age').textContent = age == null ? '—' : age;

    const healthy = e.success === true && e.degraded !== true && failures === 0 && e.live_data_plane?.published !== false;
    setChip('earth-chip', healthy ? 'OPERATIONAL' : 'DEGRADED', healthy ? 'good' : 'warn');
    $('earth-summary').textContent = healthy
      ? `${engines} engines completed the latest EarthNet cycle with ${events} events and no engine failures.`
      : `EarthNet is reachable, but its latest production assertion is reporting degraded conditions or an engine failure.`;

    const details = [];
    if (ts) details.push(['Latest production state', new Date(ts).toLocaleString('en-NZ')]);
    if (e.live_data_plane && Object.prototype.hasOwnProperty.call(e.live_data_plane, 'published')) details.push(['Live data plane', e.live_data_plane.published ? 'published' : 'not published']);
    if (e.degraded != null) details.push(['Cycle degraded', e.degraded ? 'yes' : 'no']);
    $('earth-detail').innerHTML = details.map(([a,b]) => `<div class="detail-row"><span>${esc(a)}</span><b>${esc(b)}</b></div>`).join('');
  }

  function findForecasts(p) {
    if (Array.isArray(p?.forecasts)) return p.forecasts;
    if (Array.isArray(p?.history)) return p.history;
    return [];
  }

  function renderPrometheus() {
    const p = state.prometheus;
    if (!p) {
      setChip('prom-chip', 'NO LINK', 'danger');
      return;
    }

    const forecasts = findForecasts(p);
    const resolvedActual = forecasts.filter((f) => f.status === 'resolved').length;
    const openActual = forecasts.filter((f) => f.status === 'open').length;
    const cal = p.calibration || p.metrics || {};
    const resolved = number(cal.resolved_count, number(p.resolved_count, resolvedActual));
    const open = number(p.open_count, openActual);
    const observed = number(cal.confirmed_count, number(p.confirmed_count, 0));
    const brier = Number(cal.brier_score ?? p.brier_score);

    $('prom-open').textContent = open;
    $('prom-resolved').textContent = resolved;
    $('prom-observed').textContent = observed;
    $('prom-brier').textContent = Number.isFinite(brier) ? brier.toFixed(3) : '—';
    setChip('prom-chip', 'LEDGER LIVE', 'good');

    const calibrated = number(cal.calibrated_forecast_count, 0);
    $('prom-summary').textContent = `${resolved} forecasts have resolved; ${observed} qualifying outcomes were observed${calibrated ? `, with ${calibrated} empirically calibrated forecasts` : ''}. Lower Brier is better.`;
  }

  function renderLink(ok) {
    $('link-state').textContent = ok ? 'ESTABLISHED' : 'PARTIAL';
    $('link-dot').className = `link-dot${ok ? ' good' : ''}`;
    $('last-refresh').textContent = state.refreshedAt ? state.refreshedAt.toLocaleTimeString('en-NZ', {hour:'2-digit',minute:'2-digit',hour12:false}) : '—';
  }

  async function refresh() {
    const button = $('refresh-button');
    if (button) button.disabled = true;
    const results = await Promise.allSettled([
      getJson(DATA.health), getJson(DATA.earth), getJson(DATA.latest), getJson(DATA.prometheus)
    ]);
    [state.health, state.earth, state.latest, state.prometheus] = results.map((r) => r.status === 'fulfilled' ? r.value : null);
    state.refreshedAt = new Date();
    renderFleet();
    renderEarth();
    renderPrometheus();
    renderLink(Boolean(state.health && state.earth && state.prometheus));
    if (button) button.disabled = false;
  }

  function fleetAttention() {
    const systems = state.health?.systems || [];
    return systems.filter((s) => s.status !== 'operational');
  }

  function sentinelReply(raw) {
    const q = String(raw || '').toLowerCase();
    const systems = state.health?.systems || [];
    const operational = systems.filter((s) => s.status === 'operational').length;
    const attention = fleetAttention();

    if (/earth|planet|quake|hazard/.test(q)) {
      const e = state.earth;
      if (!e) return 'EarthNet telemetry is not available to this public-safe console right now.';
      const failures = e.failed_engines && typeof e.failed_engines === 'object' ? Object.keys(e.failed_engines).length : 0;
      return `EarthNet reports ${number(e.engine_count)} engines, ${number(e.event_count)} events and ${failures} engine failures in the latest relayed production state. ${e.degraded ? 'The cycle is marked degraded.' : 'The cycle is not marked degraded.'}`;
    }

    if (/prometheus|forecast|foresight|brier/.test(q)) {
      const p = state.prometheus;
      if (!p) return 'Prometheus telemetry is not available to this public-safe console right now.';
      const f = findForecasts(p), c = p.calibration || {};
      const resolved = number(c.resolved_count, f.filter((x) => x.status === 'resolved').length);
      const open = f.filter((x) => x.status === 'open').length;
      const brier = Number(c.brier_score);
      return `Prometheus currently exposes ${open} open forecast${open === 1 ? '' : 's'} and ${resolved} resolved forecasts. ${Number.isFinite(brier) ? `Current Brier score is ${brier.toFixed(3)}.` : ''}`.trim();
    }

    if (/attention|problem|wrong|down|degraded/.test(q)) {
      if (!attention.length) return 'Nothing in the current public-safe Fleet snapshot needs attention.';
      return `Current attention list: ${attention.map((s) => `${s.name} is ${s.status}`).join('; ')}.`;
    }

    if (/sentinel|brain|watchdog/.test(q)) {
      return 'This public command surface is live. Sentinel’s private VPS brain is deliberately not exposed to the public web; it is supervised locally by the Pythology Sentinel VPS Brain Watchdog.';
    }

    if (/status|report|fleet|system|health/.test(q)) {
      return systems.length
        ? `${operational} of ${systems.length} monitored Fleet surfaces are operational.${attention.length ? ` Attention is currently on ${attention.map((s) => s.name).join(', ')}.` : ' No monitored surface needs attention.'}`
        : 'Fleet telemetry has not loaded yet.';
    }

    return 'I can answer from the public-safe command picture: ask for a status report, EarthNet status, Prometheus status, or what needs attention. Private neural reasoning remains on the VPS rather than being exposed through this page.';
  }

  function addMessage(role, text) {
    const box = $('conversation');
    const item = document.createElement('div');
    item.className = `message ${role}`;
    item.innerHTML = `<span>${role === 'user' ? 'COMMAND' : 'SENTINEL'}</span><p>${esc(text)}</p>`;
    box.appendChild(item);
    box.scrollTop = box.scrollHeight;
  }

  function submitCommand(text) {
    const clean = String(text || '').trim();
    if (!clean) return;
    addMessage('user', clean);
    addMessage('sentinel', sentinelReply(clean));
  }

  document.addEventListener('DOMContentLoaded', () => {
    renderClock();
    setInterval(renderClock, 1000);
    $('refresh-button')?.addEventListener('click', refresh);
    $('command-form')?.addEventListener('submit', (event) => {
      event.preventDefault();
      const input = $('command-input');
      submitCommand(input.value);
      input.value = '';
    });
    document.querySelectorAll('[data-command]').forEach((button) => button.addEventListener('click', () => submitCommand(button.dataset.command)));
    refresh();
    setInterval(refresh, 120000);
  });
})();
