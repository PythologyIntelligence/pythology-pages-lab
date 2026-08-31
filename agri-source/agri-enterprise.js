/* Enterprise-aware Agri portal overlays.
   Keeps the shared weather/map portal while removing dairy-only presentation for
   beef, sheep, cropping and mixed enterprises. */
(function installAgriEnterpriseView() {
  function farmType() {
    const type = portalState?.data?.enterprise?.farm_type
      || decisionIntel()?.profile_context?.farm_type
      || '';
    return String(type).trim().toLowerCase();
  }

  function isDairy() {
    const type = farmType();
    return !type || type === 'dairy';
  }

  function livestockSummary() {
    const livestock = decisionIntel()?.profile_context?.livestock || {};
    const parts = [];
    const cows = livestock.breeding_cows;
    const steers = livestock.yearling_steers;
    if (cows?.head_count != null) {
      const breed = cows.breed ? ` ${cows.breed}` : '';
      parts.push(`${cows.head_count}${breed} breeding cows`);
    }
    if (steers?.head_count != null) parts.push(`${steers.head_count} yearling steers`);
    return parts.join(' · ') || 'Not yet configured';
  }

  function weatherRefresh() {
    return portalState?.data?.weather_refresh || portalState?.data?.weather_status || null;
  }

  function renderSoilIntelligence() {
    const section = document.getElementById('soil-intelligence-section');
    const container = document.getElementById('soil-intelligence');
    if (!section || !container) return;

    const blocks = portalState?.data?.blocks || [];
    if (!blocks.length) {
      section.hidden = true;
      container.innerHTML = '';
      return;
    }

    section.hidden = false;
    container.innerHTML = `${blocks.map((block) => {
      const moistureAvailable = Number.isFinite(Number(block.soil_m));
      const temperatureAvailable = Number.isFinite(Number(block.soil_t));
      const etAvailable = Number.isFinite(Number(block.et_24h));
      const balanceAvailable = Number.isFinite(Number(block.moisture_balance));
      const balance = balanceAvailable ? Number(block.moisture_balance) : null;
      const tone = balance == null ? 'neutral' : balance < -3 ? 'dry' : balance > 3 ? 'wet' : 'balanced';
      const status = block.balance_status || (balance == null ? 'Unavailable' : balance < 0 ? 'Deficit' : 'Surplus');

      return `<article class="soil-card soil-${tone}">
        <div class="soil-card-head">
          <strong>${escapeHtml(block.block_name || block.full_name || block.farm_id || 'Farm block')}</strong>
          <span>${escapeHtml(status)}</span>
        </div>
        <div class="soil-metrics">
          <div><span>Soil moisture</span><strong>${moistureAvailable ? `${escapeHtml(formatNumber(block.soil_m))}%` : 'Unavailable'}</strong></div>
          <div><span>Soil temperature</span><strong>${temperatureAvailable ? `${escapeHtml(formatNumber(block.soil_t))}°C` : 'Unavailable'}</strong></div>
          <div><span>Evapotranspiration 24h</span><strong>${etAvailable ? `${escapeHtml(formatNumber(block.et_24h, 2))} mm` : 'Unavailable'}</strong></div>
          <div><span>Moisture balance</span><strong>${balanceAvailable ? `${escapeHtml(formatNumber(block.moisture_balance))} mm` : 'Unavailable'}</strong></div>
          <div><span>Pugging risk</span><strong>${escapeHtml(block.pugging_risk || 'Unavailable')}</strong></div>
        </div>
      </article>`;
    }).join('')}
      <p class="soil-source-note"><strong>Source:</strong> ${escapeHtml(portalState?.data?.weather_provider || blocks[0]?.weather_provider || 'Open-Meteo')} land-model estimate. Field observations remain authoritative. Satellite regional cross-check is not yet connected.</p>`;
  }

  function renderFarmMapContext() {
    const section = document.getElementById('farm-map-section');
    const container = document.getElementById('farm-map-context');
    if (!section || !container) return;

    const farms = decisionIntel()?.profile_context?.farms;
    if (!Array.isArray(farms) || !farms.length) {
      section.hidden = true;
      container.innerHTML = '';
      return;
    }

    section.hidden = false;
    container.innerHTML = farms.map((farm) => {
      const paddocks = Array.isArray(farm.paddocks) ? farm.paddocks : [];
      const calving = Array.isArray(farm.calving_paddocks) ? farm.calving_paddocks : [];
      const mappedCount = Number.isFinite(Number(farm.mapped_paddock_count)) ? Number(farm.mapped_paddock_count) : paddocks.length;
      const mappedHa = Number.isFinite(Number(farm.mapped_hectares)) ? `${formatNumber(farm.mapped_hectares)} ha mapped` : '';
      const farmHa = Number.isFinite(Number(farm.hectares)) ? `${formatNumber(farm.hectares)} ha` : '';
      const meta = [mappedCount ? `${mappedCount} mapped paddocks` : '', mappedHa, farmHa].filter(Boolean).join(' · ') || 'Map context supplied';
      const paddockHtml = paddocks.length
        ? `<div class="paddock-list">${paddocks.map((paddock) => `<span><strong>${escapeHtml(paddock.name)}</strong>${paddock.hectares == null ? '' : ` ${escapeHtml(formatNumber(paddock.hectares))} ha`}</span>`).join('')}</div>`
        : '';
      const calvingHtml = calving.length
        ? `<div class="farm-context-note"><strong>Saved calving paddocks</strong><span>${calving.map(escapeHtml).join(' · ')}</span></div>`
        : '';
      return `<article class="farm-context-card">
        <div class="farm-context-head"><strong>${escapeHtml(farm.name || farm.id || 'Farm block')}</strong><span>${escapeHtml(meta)}</span></div>
        ${calvingHtml}${paddockHtml}
      </article>`;
    }).join('');
  }

  const baseRenderSummary = window.renderSummary;
  window.renderSummary = function renderEnterpriseSummary() {
    if (isDairy()) return baseRenderSummary();

    const blocks = portalState.data?.blocks || [];
    const profile = decisionIntel()?.profile_context || {};
    const feed = decisionIntel()?.feed_planning_readiness || {};
    const rows = [
      ['Client', portalState.client?.name || portalState.data?.client?.name || portalState.client?.id || '—'],
      ['Region', portalState.client?.region || portalState.data?.client?.region || '—'],
      ['Farm type', farmType() ? farmType().replace(/\b\w/g, (letter) => letter.toUpperCase()) : 'Not yet configured'],
      ['Effective area', profile.effective_hectares == null ? 'Not yet configured' : `${profile.effective_hectares} ha`],
      ['Farm blocks', blocks.map((block) => block.block_name).join(', ') || '—'],
      ['Livestock', livestockSummary()],
      ['Average pasture growth', `${formatNumber(average(blocks.map((block) => block.est_growth)))} kg DM/ha/day`],
      ['Feed planning', feed.status === 'ready_for_initial_estimate' ? 'Initial estimate ready' : 'Awaiting farm inputs'],
      ['Weather & soil source', portalState.data?.weather_provider || blocks[0]?.weather_provider || '—'],
      ['Data mode', portalState.data?.data_quality || '—'],
      ['Last good report', portalState.data?.generated_display || '—'],
    ];
    document.getElementById('summary').innerHTML = rows
      .map(([label, value]) => `<div class="summary-row"><span>${escapeHtml(label)}</span><span>${escapeHtml(value)}</span></div>`)
      .join('');
  };

  const basePopupForBlock = window.popupForBlock;
  window.popupForBlock = function enterprisePopupForBlock(block, title = block.block_name) {
    if (isDairy()) return basePopupForBlock(block, title);
    const decision = blockDecision(block.farm_id);
    const decisionRows = decision
      ? `<div class="popup-decision"><span>Today</span><strong>${escapeHtml(decision.primary_action)}</strong><small>${escapeHtml(decision.reason)}</small></div>`
      : '';
    return `<div class="popup-title">${escapeHtml(title)}</div>${decisionRows}<div class="popup-grid">
      <div><span>Temperature</span><strong>${escapeHtml(formatNumber(block.temp_now))}°C</strong></div>
      <div><span>Feels like</span><strong>${escapeHtml(formatNumber(block.feels_like))}°C</strong></div>
      <div><span>Soil moisture</span><strong>${escapeHtml(formatNumber(block.soil_m))}%</strong></div>
      <div><span>Soil temp</span><strong>${escapeHtml(formatNumber(block.soil_t))}°C</strong></div>
      <div><span>Pasture growth</span><strong>${escapeHtml(formatNumber(block.est_growth))} kg DM</strong></div>
      <div><span>Rain 24h</span><strong>${escapeHtml(formatNumber(block.rain_total_24h))} mm</strong></div>
      <div><span>Wind gust</span><strong>${escapeHtml(formatNumber(block.max_gust, 0))} km/h</strong></div>
      <div><span>Pugging</span><strong>${escapeHtml(block.pugging_risk || '—')}</strong></div>
    </div>`;
  };

  const baseRenderPortal = window.renderPortal;
  window.renderPortal = function renderEnterprisePortal() {
    baseRenderPortal();
    renderSoilIntelligence();
    renderFarmMapContext();

    const type = farmType();
    if (type && type !== 'dairy') {
      const sprayLabel = document.querySelector('#spray-value')?.closest('.stat')?.querySelector('.stat-label');
      if (sprayLabel) sprayLabel.textContent = 'Work Window';
      const growthLabel = document.querySelector('#growth-value')?.closest('.stat')?.querySelector('.stat-label');
      if (growthLabel) growthLabel.textContent = 'Pasture Growth';
    }

    const refresh = weatherRefresh();
    const banner = document.getElementById('weather-refresh-banner');
    if (!banner) return;
    if (refresh?.status === 'offline' || refresh?.status === 'stale') {
      banner.hidden = false;
      banner.textContent = refresh.message || 'Weather update delayed — showing the last successful forecast.';
    } else {
      banner.hidden = true;
      banner.textContent = '';
    }
  };
})();
