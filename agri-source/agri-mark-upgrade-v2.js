/* Mark pilot handover v2.
   The farmer view stays live even when the shared archival Blob store is unavailable:
   the server-side Agri API recalculates current block intelligence on request, while
   this layer preserves farmer-supplied maps, richer work planning and growth unlocks. */
(function installMarkPilotUpgradeV2() {
  const CLIENT_ID = 'brookfield-newfield-pilot';
  const POLL_MS = 5 * 60 * 1000;
  const FARM_STRUCTURE = {
    brookfield: { hectares: 116.7, paddocks: 23 },
    newfield: { hectares: 32.7, paddocks: 23 },
  };
  let pollTimer = null;
  let pollBusy = false;
  let plannerRequest = 0;
  let presentationObserver = null;

  function isMark() {
    return portalState?.client?.id === CLIENT_ID;
  }

  function escape(value) {
    return typeof escapeHtml === 'function' ? escapeHtml(value) : String(value ?? '');
  }

  function formatClock(value) {
    if (!value) return '—';
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) {
      return date.toLocaleTimeString('en-NZ', { hour: 'numeric', minute: '2-digit' });
    }
    const match = String(value).match(/T(\d{2}):(\d{2})/);
    if (!match) return String(value);
    const hour24 = Number(match[1]);
    return `${hour24 % 12 || 12}:${match[2]} ${hour24 < 12 ? 'am' : 'pm'}`;
  }

  function formatLiveStamp(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return portalState.data?.generated_display || 'current';
    return date.toLocaleString('en-NZ', {
      weekday: 'short', day: 'numeric', month: 'short',
      hour: 'numeric', minute: '2-digit',
    });
  }

  function patchStructure() {
    if (!isMark()) return;
    const profile = decisionIntel()?.profile_context;
    if (!profile) return;
    profile.effective_hectares = 149.4;
    if (!Array.isArray(profile.farms)) return;
    for (const farm of profile.farms) {
      const known = FARM_STRUCTURE[farm?.id];
      if (!known) continue;
      farm.hectares = known.hectares;
      farm.mapped_hectares = known.hectares;
      farm.mapped_paddock_count = known.paddocks;
    }
  }

  /* Compatibility for the older browser overlay: soil fields are hourly in
     Open-Meteo, not current fields. The server API already uses the hourly form;
     this keeps the independent browser cross-check healthy as well. */
  const nativeFetch = window.fetch.bind(window);
  window.fetch = async function markFetch(input, init) {
    const inputUrl = typeof input === 'string' ? input : input?.url;
    if (!inputUrl || !inputUrl.startsWith('https://api.open-meteo.com/v1/forecast?')) {
      return nativeFetch(input, init);
    }
    const url = new URL(inputUrl);
    const currentVars = (url.searchParams.get('current') || '').split(',').filter(Boolean);
    const soilVars = currentVars.filter((name) => name.startsWith('soil_'));
    if (!soilVars.length) return nativeFetch(input, init);

    url.searchParams.set('current', currentVars.filter((name) => !name.startsWith('soil_')).join(','));
    const hourly = new Set((url.searchParams.get('hourly') || '').split(',').filter(Boolean));
    soilVars.forEach((name) => hourly.add(name));
    url.searchParams.set('hourly', [...hourly].join(','));
    const response = await nativeFetch(url.toString(), init);
    if (!response.ok) return response;
    const payload = await response.json();
    const times = payload.hourly?.time || [];
    const index = Math.max(0, times.indexOf(payload.current?.time));
    payload.current = {
      ...(payload.current || {}),
      soil_temperature_0cm: payload.hourly?.soil_temperature_0cm?.[index] ?? null,
      soil_moisture_0_to_1cm: payload.hourly?.soil_moisture_0_to_1cm?.[index] ?? null,
    };
    return new Response(JSON.stringify(payload), {
      status: response.status,
      statusText: response.statusText,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    });
  };

  const baseRecommendations = window.renderRecommendations;
  window.renderRecommendations = function markRecommendations() {
    if (isMark() && Array.isArray(decisionIntel()?.action_board) && decisionIntel().action_board.length === 0) {
      setText('action-count', '0');
      const container = document.getElementById('recommendations');
      if (container) container.innerHTML = '<div class="rec empty"><strong>No action required</strong><span>No material farm threshold has crossed this cycle. Agri will surface the next meaningful change automatically.</span></div>';
      return;
    }
    baseRecommendations();
  };

  function selectedBlock() {
    const id = document.getElementById('mark-block-select')?.value || 'brookfield';
    return portalState.data?.blocks?.find((block) => block.farm_id === id) || portalState.data?.blocks?.[0] || null;
  }

  function plannerSection() {
    return document.getElementById('planner-body')?.closest('.panel-section')
      || document.getElementById('mark-planner-cards')?.closest('.panel-section')
      || null;
  }

  function dayLabel(date, index) {
    if (index === 0) return 'Today';
    if (index === 1) return 'Tomorrow';
    return new Date(`${date}T12:00:00+12:00`).toLocaleDateString('en-NZ', { weekday: 'short' });
  }

  function rainPeriods(times, values, date) {
    const periods = [];
    let start = null;
    let end = null;
    for (let i = 0; i < times.length; i += 1) {
      if (!String(times[i]).startsWith(`${date}T`)) continue;
      const wet = Number(values[i] || 0) > 0.1;
      if (wet && start == null) start = times[i];
      if (wet) end = times[i];
      if (!wet && start != null) {
        periods.push([start, end]);
        start = null;
        end = null;
      }
    }
    if (start != null) periods.push([start, end]);
    return periods.slice(0, 2);
  }

  function rainTiming(periods) {
    if (!periods.length) return 'No significant rain window';
    return periods.map(([start, end]) => `${formatClock(start)}–${formatClock(end)}`).join(', ');
  }

  function peak(times, values, date) {
    let max = null;
    let at = null;
    values.forEach((raw, index) => {
      if (!String(times[index]).startsWith(`${date}T`)) return;
      const value = Number(raw);
      if (Number.isFinite(value) && (max == null || value > max)) {
        max = value;
        at = times[index];
      }
    });
    return { max, at };
  }

  function advice(rain, wind, gust, firstRain) {
    const lines = [];
    if (rain >= 8) lines.push(`Shift stock before ${firstRain || 'the main rain'} and watch higher-saturation ground.`);
    else if (rain >= 3) lines.push('Plan grazing around the rain window and re-check softer ground afterwards.');
    else lines.push('No major rain constraint is indicated for normal grazing work.');
    if (gust >= 50) lines.push('Avoid exposed jobs and favour sheltered stock areas during peak gusts.');
    else if (gust >= 35 || wind >= 22) lines.push('Allow extra margin for exposed paddocks and spraying.');
    if (rain < 0.2 && wind < 16) lines.push('Best spray/work window if field conditions agree.');
    return lines.join(' ');
  }

  async function detailedPlannerForecast(block) {
    const params = new URLSearchParams({
      latitude: String(block.lat), longitude: String(block.lon),
      timezone: 'Pacific/Auckland', forecast_days: '4',
      hourly: 'precipitation,wind_speed_10m,wind_gusts_10m',
      daily: 'temperature_2m_max,temperature_2m_min,precipitation_sum,wind_speed_10m_max,wind_gusts_10m_max',
    });
    const response = await nativeFetch(`https://api.open-meteo.com/v1/forecast?${params}`, { cache: 'no-store' });
    if (!response.ok) throw new Error(`Planner weather returned ${response.status}`);
    return response.json();
  }

  async function renderDetailedPlanner() {
    if (!isMark()) return;
    const section = plannerSection();
    const block = selectedBlock();
    if (!section || !block) return;
    const request = ++plannerRequest;
    const title = section.querySelector('.panel-title');
    if (title) {
      title.classList.add('mark-planner-title');
      title.innerHTML = `Three-day work planner <span>${escape(block.block_name)}</span>`;
    }
    const table = section.querySelector('table');
    if (table) table.hidden = true;
    let cards = section.querySelector('#mark-planner-cards');
    if (!cards) {
      cards = document.createElement('div');
      cards.id = 'mark-planner-cards';
      cards.className = 'mark-planner-cards';
      section.appendChild(cards);
    }
    cards.innerHTML = '<div class="mark-planner-loading">Loading rain and wind timing…</div>';

    try {
      const forecast = await detailedPlannerForecast(block);
      if (request !== plannerRequest) return;
      const dates = (forecast.daily?.time || []).slice(0, 3);
      const times = forecast.hourly?.time || [];
      const rainHourly = forecast.hourly?.precipitation || [];
      const windHourly = forecast.hourly?.wind_speed_10m || [];
      const gustHourly = forecast.hourly?.wind_gusts_10m || [];
      cards.innerHTML = dates.map((date, index) => {
        const rain = Number(forecast.daily?.precipitation_sum?.[index] || 0);
        const periods = rainPeriods(times, rainHourly, date);
        const windPeak = peak(times, windHourly, date);
        const gustPeak = peak(times, gustHourly, date);
        const wind = Number(windPeak.max ?? forecast.daily?.wind_speed_10m_max?.[index] ?? 0);
        const gust = Number(gustPeak.max ?? forecast.daily?.wind_gusts_10m_max?.[index] ?? 0);
        const peakAt = gustPeak.at || windPeak.at;
        const high = Number(forecast.daily?.temperature_2m_max?.[index]);
        const low = Number(forecast.daily?.temperature_2m_min?.[index]);
        const rainTone = rain >= 8 ? 'hold' : rain >= 3 ? 'caution' : 'go';
        const windTone = gust >= 50 ? 'hold' : gust >= 35 ? 'caution' : 'go';
        return `<article class="mark-planner-card">
          <div class="mark-planner-day"><div><strong>${escape(dayLabel(date, index))}</strong><span>${escape(String(date).slice(5).split('-').reverse().join('/'))}</span></div><span>${Math.round(high)}° / ${Math.round(low)}°</span></div>
          <div class="mark-planner-line"><span>Rain</span><strong class="tone-${rainTone}">${rain.toFixed(1)} mm</strong><small>${escape(rainTiming(periods))}</small></div>
          <div class="mark-planner-line"><span>Wind</span><strong class="tone-${windTone}">${Math.round(wind)} km/h · gust ${Math.round(gust)}</strong><small>${peakAt ? `Strongest around ${escape(formatClock(peakAt))}` : 'No peak timing available'}</small></div>
          <div class="mark-planner-advice"><span>Farm advice</span><p>${escape(advice(rain, wind, gust, periods[0] ? formatClock(periods[0][0]) : ''))}</p></div>
        </article>`;
      }).join('');
    } catch {
      cards.innerHTML = (block.planner || []).map((day) => `<article class="mark-planner-card"><div class="mark-planner-day"><div><strong>${escape(day.day)}</strong><span>${escape(day.date)}</span></div><span>${formatNumber(day.high, 0)}° / ${formatNumber(day.low, 0)}°</span></div><div class="mark-planner-line"><span>Rain</span><strong>${formatNumber(day.rain)} mm</strong><small>Detailed timing temporarily unavailable</small></div><div class="mark-planner-line"><span>Wind</span><strong>${formatNumber(day.wind, 0)} km/h</strong><small>Live farm model retained</small></div></article>`).join('');
    }
  }

  function ensureGrowthSection() {
    if (!isMark()) return;
    let section = document.getElementById('beef-growth-section');
    if (!section) {
      section = document.createElement('section');
      section.className = 'panel-section';
      section.id = 'beef-growth-section';
      const summary = document.getElementById('summary')?.closest('.panel-section');
      if (summary?.parentNode) summary.parentNode.insertBefore(section, summary);
    }
    if (!section) return;
    const missing = new Set(decisionIntel()?.feed_planning_readiness?.missing_inputs || []);
    section.innerHTML = `
      <div class="panel-title mark-growth-title">Growth & feed intelligence <span>Next unlock</span></div>
      <div class="mark-growth-hero"><strong>Give Agri the calf and feed numbers you already know.</strong><p>Then this becomes a live target-weight plan for Mark's calves — expected weight by age, actual versus target growth, and the feed/energy gap required to hit the sale pathway.</p></div>
      <div class="mark-growth-benchmarks"><span><small>Pre-weaning guide</small><strong>0.70–0.85 kg/day</strong></span><span><small>Post-weaning guide</small><strong>0.60–0.80 kg/day</strong></span><span><small>Meal-fed scenario</small><strong>1.0–1.4 kg/day</strong></span></div>
      <p class="mark-growth-note">Pilot benchmark bands only — Mark's own weights and feeding records replace these assumptions as the trial learns the farm.</p>
      <div class="mark-input-grid">
        <article><span>1 · Birth baseline</span><strong>Average calf birth weight</strong><p>Starts the liveweight curve and expected daily-gain tracking.</p></article>
        <article><span>2 · Weaning</span><strong>Weaning age/date + average weight</strong><p>Calculates actual pre-weaning gain and the post-wean starting point.</p></article>
        <article><span>3 · Feed</span><strong>Pasture quality + meal/supplement kg/head/day</strong><p>Unlocks maintenance/growth demand, dry-matter and energy-gap estimates.</p></article>
        <article><span>4 · Sale pathway</span><strong>Target liveweight + target age / processor spec</strong><p>Calculates required ADG, likely target date and whether the feeding plan is enough.</p></article>
      </div>
      <div class="mark-growth-output"><strong>What Mark gets back</strong><div><span>Expected weight today</span><b>Locked until birth/weaning weights arrive</b></div><div><span>Actual vs target ADG</span><b>Automatic once weights are supplied</b></div><div><span>Projected sale-weight date</span><b>Calculated from Mark's target</b></div><div><span>Feed/energy shortfall</span><b>${missing.size ? 'Waiting for pasture/feed inputs' : 'Ready for initial estimate'}</b></div></div>`;
  }

  function liveStamp() {
    return portalState.data?.weather_refresh?.last_success || portalState.data?.generated || null;
  }

  function normalizePresentation() {
    if (!isMark()) return;
    const stamp = liveStamp();
    const banner = document.getElementById('weather-refresh-banner');
    const updated = document.getElementById('updated');
    const liveText = stamp ? formatLiveStamp(stamp) : 'current';
    const desiredBanner = `<strong>Live farm intelligence active.</strong> Brookfield & Newfield conditions refreshed ${escape(liveText)} · portal rechecks every 5 minutes. Soil and pasture values are modelled estimates; field observations remain authoritative.`;
    if (banner) {
      banner.hidden = false;
      banner.classList.add('mark-live-banner');
      if (banner.innerHTML !== desiredBanner) banner.innerHTML = desiredBanner;
    }
    if (updated) {
      const desired = stamp ? `LIVE FARM CONDITIONS ${formatClock(stamp)}` : 'LIVE FARM CONDITIONS';
      if (updated.textContent !== desired) updated.textContent = desired;
    }
    document.querySelectorAll('#summary .summary-row').forEach((row) => {
      const cells = row.querySelectorAll('span');
      if (cells[0]?.textContent?.trim() === 'Last good report') {
        cells[0].textContent = 'Live conditions';
        cells[1].textContent = liveText;
      }
    });
  }

  function startPresentationGuard() {
    if (presentationObserver || !window.MutationObserver) return;
    presentationObserver = new MutationObserver(() => normalizePresentation());
    const portal = document.getElementById('portal');
    if (portal) presentationObserver.observe(portal, { childList: true, subtree: true, characterData: true });
  }

  async function pullCurrentFarm() {
    if (!isMark() || pollBusy || document.hidden) return;
    pollBusy = true;
    try {
      const response = await nativeFetch(`/api/agri-data?client=${encodeURIComponent(CLIENT_ID)}&_=${Date.now()}`, { cache: 'no-store' });
      if (!response.ok) throw new Error(`Farm API returned ${response.status}`);
      const payload = await response.json();
      portalState.client = payload.client;
      portalState.data = payload.data;
      portalState.paddocks = payload.paddocks;
      patchStructure();
      baseRenderPortal();
      patchStructure();
      ensureGrowthSection();
      normalizePresentation();
      renderDetailedPlanner();
    } catch (error) {
      console.warn('Mark live farm check failed; retaining the last displayed conditions.', error);
    } finally {
      pollBusy = false;
    }
  }

  function startPolling() {
    if (pollTimer) return;
    pollTimer = window.setInterval(pullCurrentFarm, POLL_MS);
    window.addEventListener('focus', pullCurrentFarm);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) pullCurrentFarm(); });
    document.addEventListener('change', (event) => {
      if (event.target?.id === 'mark-block-select') window.setTimeout(renderDetailedPlanner, 50);
    });
  }

  const baseRenderPortal = window.renderPortal;
  window.renderPortal = function renderMarkPilotV2() {
    if (portalState?.client?.id === CLIENT_ID) patchStructure();
    baseRenderPortal();
    if (!isMark()) return;
    patchStructure();
    ensureGrowthSection();
    normalizePresentation();
    renderDetailedPlanner();
    startPresentationGuard();
    startPolling();
  };
})();
