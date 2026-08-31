const portalState = {
  client: null,
  data: null,
  paddocks: null,
  map: null,
  paddockLayer: null,
  accessCode: '',
};

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function values(items) {
  return items.filter((value) => Number.isFinite(Number(value))).map(Number);
}

function average(items) {
  const valid = values(items);
  return valid.length ? valid.reduce((sum, value) => sum + value, 0) / valid.length : null;
}

function formatNumber(value, decimals = 1, fallback = '—') {
  return Number.isFinite(Number(value)) ? Number(value).toFixed(decimals) : fallback;
}

function formatMoney(value, fallback = '—') {
  return Number.isFinite(Number(value)) ? `NZ$${Number(value).toLocaleString('en-NZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : fallback;
}

function decisionIntel() {
  return portalState.data?.decision_intelligence || null;
}

function blockById(blockId) {
  return portalState.data?.blocks?.find((block) => block.farm_id === blockId) || portalState.data?.blocks?.[0] || null;
}

function blockDecision(blockId) {
  const decisions = decisionIntel()?.paddock_decisions || [];
  return decisions.find((item) => item.block_id === blockId) || decisions[0] || null;
}

function setText(id, value) {
  const element = document.getElementById(id);
  if (element) element.textContent = value;
}

function setStat(id, value, detail, tone = '') {
  const valueElement = document.getElementById(`${id}-value`);
  const detailElement = document.getElementById(`${id}-detail`);
  if (valueElement) {
    valueElement.textContent = value;
    valueElement.className = `stat-value ${tone}`.trim();
  }
  if (detailElement) detailElement.textContent = detail;
}

async function openFarm(clientId, accessCode) {
  const response = await fetch('/api/agri-data', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ clientId, accessCode }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || 'Farm intelligence could not be opened.');
  portalState.client = payload.client;
  portalState.data = payload.data;
  portalState.paddocks = payload.paddocks;
  portalState.accessCode = accessCode;
}

function renderDecisionBanner() {
  const actions = decisionIntel()?.action_board || [];
  const urgent = actions.filter((item) => item.priority === 'urgent').length;
  const today = actions.filter((item) => item.priority === 'today').length;
  if (urgent) {
    setText('decision-headline', `${urgent} priority action${urgent === 1 ? '' : 's'} need attention today.`);
    setText('decision-subline', today ? `${today} additional operating decision${today === 1 ? '' : 's'} should also be planned.` : 'Review the Action Board before committing work.');
  } else if (actions.length) {
    setText('decision-headline', `${actions.length} farm decision${actions.length === 1 ? '' : 's'} and opportunities are ready.`);
    setText('decision-subline', 'No urgent hold condition is present in the current modelled signals. Field conditions remain authoritative.');
  } else {
    setText('decision-headline', 'No material farm actions were generated this cycle.');
    setText('decision-subline', 'Keep using direct field observation where conditions differ from the model.');
  }
  setText('decision-count', actions.length ? `${actions.length} ACTION${actions.length === 1 ? '' : 'S'}` : 'CLEAR');
  setText('action-count', String(actions.length));
}

function renderStats() {
  const blocks = portalState.data.blocks || [];
  const primary = blocks[0] || {};
  const avgSoil = average(blocks.map((block) => block.soil_m));
  const avgGrowth = average(blocks.map((block) => block.est_growth));

  const spray = primary.spray_adhesion || 'Unknown';
  setStat('spray', spray, `Dew spread ${formatNumber(primary.dew_spread)}°C`, spray === 'Good' ? 'good' : spray === 'Fair' ? 'warn' : 'bad');

  const frost = primary.frost_severity || 'None';
  setStat('frost', frost, primary.frost_min == null ? `Low ${formatNumber(primary.low)}°C` : `Minimum ${formatNumber(primary.frost_min)}°C`, frost === 'None' ? 'good' : frost === 'Light' ? 'warn' : 'bad');

  const rain = Number(primary.rain_total_24h || 0);
  setStat('rain', `${formatNumber(rain)} mm`, primary.rain_arrival ? `Arrives ${primary.rain_arrival}` : 'No significant rain', rain > 10 ? 'bad' : rain > 3 ? 'warn' : 'good');

  const wind = Number(primary.max_wind || 0);
  setStat('wind', `${formatNumber(wind, 0)} km/h`, `Gusts ${formatNumber(primary.max_gust, 0)} km/h`, wind > 30 ? 'bad' : wind > 20 ? 'warn' : 'good');

  setStat('soil', avgSoil == null ? 'Unavailable' : `${formatNumber(avgSoil, 0)}%`, `ET balance ${formatNumber(primary.moisture_balance)} mm`, avgSoil != null && avgSoil > 50 ? 'warn' : 'good');
  setStat('growth', avgGrowth == null ? 'Unavailable' : `${formatNumber(avgGrowth)} kg DM`, 'Average per ha/day', 'good');
}

function legacyRecommendations() {
  const blocks = portalState.data.blocks || [];
  const primary = blocks[0] || {};
  const recommendations = [];
  if (primary.spray_adhesion === 'Good' && primary.planner?.[0]?.spray === '✅') {
    recommendations.push({ id: 'legacy-spray', action: 'Spray window open', why: 'Wind, rain and leaf-moisture conditions are suitable today.', priority: 'opportunity' });
  } else {
    recommendations.push({ id: 'legacy-spray-hold', action: 'Hold spraying', why: `Current adhesion is ${primary.spray_adhesion || 'unknown'} and today’s planner is ${primary.planner?.[0]?.spray || 'unavailable'}.`, priority: 'today' });
  }
  if (primary.rain_arrival) recommendations.push({ id: 'legacy-rain', action: `Rain arriving ${primary.rain_arrival}`, why: `${formatNumber(primary.rain_total_24h)} mm expected${primary.rain_end ? `, clearing ${primary.rain_end}` : ''}.`, priority: 'today' });
  blocks.forEach((block) => {
    if (!block.effluent_ok) recommendations.push({ id: `${block.farm_id}-legacy-effluent`, action: `Hold effluent — ${block.block_name}`, why: block.effluent_note || 'Rain risk is outside the safe operating window.', priority: 'urgent' });
    if (block.pugging_risk && block.pugging_risk !== 'Low') recommendations.push({ id: `${block.farm_id}-legacy-pugging`, action: `Pugging — ${block.block_name}`, why: `${block.pugging_risk} risk with soil moisture at ${formatNumber(block.soil_m)}%.`, priority: block.pugging_risk === 'HIGH' ? 'urgent' : 'today' });
  });
  return recommendations;
}

function priorityLabel(priority) {
  return ({ urgent: 'ACT NOW', today: 'TODAY', opportunity: 'OPPORTUNITY', monitor: 'MONITOR' })[priority] || String(priority || 'CHECK').toUpperCase();
}

async function sendActionFeedback(action, verdict, statusElement) {
  let note = '';
  if (verdict === 'partly' || verdict === 'wrong') {
    note = window.prompt('What actually happened? A short field observation will help us calibrate the farm model.', '') || '';
  }
  statusElement.textContent = 'Recording…';
  try {
    const response = await fetch('/api/agri-feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        clientId: portalState.client?.id,
        accessCode: portalState.accessCode,
        recommendationId: action.id,
        recommendation: `${action.action || ''} ${action.why || ''}`.trim(),
        verdict,
        note,
        generated: portalState.data?.generated || '',
      }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || 'Feedback could not be recorded.');
    statusElement.textContent = verdict === 'matched' ? 'Recorded as matching field conditions.' : 'Field observation recorded for calibration.';
  } catch (error) {
    statusElement.textContent = error.message || 'Feedback could not be recorded.';
  }
}

function wireFeedback(actions) {
  const byId = new Map(actions.map((action) => [action.id, action]));
  document.querySelectorAll('[data-feedback-action]').forEach((button) => {
    button.addEventListener('click', async () => {
      const action = byId.get(button.dataset.feedbackAction);
      if (!action || !portalState.accessCode) return;
      const card = button.closest('.rec');
      const status = card?.querySelector('.feedback-status');
      const buttons = card?.querySelectorAll('.feedback-button') || [];
      buttons.forEach((item) => { item.disabled = true; });
      await sendActionFeedback(action, button.dataset.verdict, status);
      buttons.forEach((item) => { item.disabled = false; });
    });
  });
}

function renderRecommendations() {
  const container = document.getElementById('recommendations');
  const actions = decisionIntel()?.action_board?.length ? decisionIntel().action_board : legacyRecommendations();
  setText('action-count', String(actions.length));
  if (!actions.length) {
    container.innerHTML = '<div class="rec empty"><strong>No action required</strong><span>No material threshold crossing was generated this cycle.</span></div>';
    return;
  }

  container.innerHTML = actions.map((action) => {
    const evidence = Array.isArray(action.evidence) && action.evidence.length
      ? `<div class="evidence-list">${action.evidence.map((item) => `<span>${escapeHtml(item)}</span>`).join('')}</div>`
      : '';
    const value = action.value_context?.estimated_nzd != null
      ? `<div class="value-context"><strong>${escapeHtml(formatMoney(action.value_context.estimated_nzd))}</strong><span>${escapeHtml(action.value_context.note || 'Configured scenario value; not verified savings.')}</span></div>`
      : '';
    const feedback = action.verification
      ? `<div class="feedback"><span class="feedback-label">Did this match the farm?</span><div class="feedback-buttons"><button type="button" class="feedback-button" data-feedback-action="${escapeHtml(action.id)}" data-verdict="matched">Yes</button><button type="button" class="feedback-button" data-feedback-action="${escapeHtml(action.id)}" data-verdict="partly">Partly</button><button type="button" class="feedback-button" data-feedback-action="${escapeHtml(action.id)}" data-verdict="wrong">No</button><button type="button" class="feedback-button muted" data-feedback-action="${escapeHtml(action.id)}" data-verdict="not_followed">Didn’t act</button></div><span class="feedback-status"></span></div>`
      : '';
    return `<article class="rec priority-${escapeHtml(action.priority || 'today')}">
      <div class="rec-top"><span class="rec-tag">${escapeHtml(priorityLabel(action.priority))}</span>${action.block_name ? `<span class="rec-block">${escapeHtml(action.block_name)}</span>` : ''}</div>
      <strong>${escapeHtml(action.action || action.title || 'Farm action')}</strong>
      <span>${escapeHtml(action.why || action.detail || '')}</span>
      ${evidence}${value}${feedback}
    </article>`;
  }).join('');
  wireFeedback(actions);
}

function renderAlerts() {
  const container = document.getElementById('alerts');
  const alerts = [];
  (portalState.data.blocks || []).forEach((block) => {
    if (block.frost_severity && block.frost_severity !== 'None') alerts.push([`${block.frost_severity} frost — ${block.block_name}`, `${formatNumber(block.frost_min)}°C from ${block.frost_start || 'unknown'} to ${block.frost_end || 'unknown'}.`]);
    if (Number(block.rain_total_24h) > 8) alerts.push([`Heavy rain — ${block.block_name}`, `${formatNumber(block.rain_total_24h)} mm expected, peak ${formatNumber(block.peak_mm)} mm/hr.`]);
    if (Number(block.max_gust) > 40) alerts.push([`Strong gusts — ${block.block_name}`, `Gusts may reach ${formatNumber(block.max_gust, 0)} km/h.`]);
    if (block.pugging_risk === 'HIGH') alerts.push([`High pugging risk — ${block.block_name}`, 'Keep stock off vulnerable paddocks where practical.']);
  });

  setText('alert-count', String(alerts.length));
  if (!alerts.length) {
    container.innerHTML = '<div class="alert info"><strong>No critical alerts</strong><span>Current conditions are inside configured thresholds.</span></div>';
    return;
  }
  container.innerHTML = alerts.map(([title, detail]) => `<div class="alert"><strong>${escapeHtml(title)}</strong><span>${escapeHtml(detail)}</span></div>`).join('');
}

function renderPlanner() {
  const body = document.getElementById('planner-body');
  const planner = portalState.data.blocks?.[0]?.planner || [];
  body.innerHTML = planner.map((day) => `
    <tr><td><strong>${escapeHtml(day.day)}</strong><br><span>${escapeHtml(day.date)}</span></td><td>${escapeHtml(formatNumber(day.high, 0))}° / ${escapeHtml(formatNumber(day.low, 0))}°</td><td>${escapeHtml(formatNumber(day.rain))} mm</td><td>${escapeHtml(day.spray || '—')}</td><td>${escapeHtml(day.graze || '—')}</td><td>${escapeHtml(day.pugging || '—')}</td></tr>
  `).join('');
}

function renderTrialEvidence() {
  const container = document.getElementById('trial-evidence');
  const tracking = decisionIntel()?.value_tracking;
  if (!tracking) {
    container.innerHTML = '<div class="evidence-card"><strong>Calibration begins with the next decision-intelligence cycle.</strong><span>Field feedback will be kept separate from modelled estimates.</span></div>';
    return;
  }
  const rows = [
    ['Recommendations this cycle', String(tracking.recommendations_this_cycle ?? '—')],
    ['Priority actions', String(tracking.high_priority_actions ?? '—')],
    ['Modelled pasture value', tracking.modelled_pasture_value_nzd_per_ha_day == null ? 'Not available' : `${formatMoney(tracking.modelled_pasture_value_nzd_per_ha_day)}/ha/day`],
    ['Configured value at risk', tracking.configured_value_at_risk_nzd == null ? 'Not configured' : formatMoney(tracking.configured_value_at_risk_nzd)],
    ['Verified trial value', tracking.verified_value_nzd == null ? 'Awaiting field verification' : formatMoney(tracking.verified_value_nzd)],
  ];
  container.innerHTML = `<div class="summary evidence-summary">${rows.map(([label, value]) => `<div class="summary-row"><span>${escapeHtml(label)}</span><span>${escapeHtml(value)}</span></div>`).join('')}</div><p class="evidence-note">${escapeHtml(tracking.note || 'Modelled values are not treated as realised savings until field outcomes confirm them.')}</p>`;
}

function renderSummary() {
  const blocks = portalState.data.blocks || [];
  const profile = decisionIntel()?.profile_context || {};
  const rows = [
    ['Client', portalState.client.name || portalState.data.client?.name || portalState.client.id],
    ['Region', portalState.client.region || portalState.data.client?.region || '—'],
    ['Farm type', profile.farm_type || 'Not yet configured'],
    ['Effective area', profile.effective_hectares == null ? 'Not yet configured' : `${profile.effective_hectares} ha`],
    ['Blocks', blocks.map((block) => block.block_name).join(', ') || '—'],
    ['Average growth', `${formatNumber(average(blocks.map((block) => block.est_growth)))} kg DM/ha/day`],
    ['Modelled pasture value', `${formatMoney(average(blocks.map((block) => block.revenue)))}/ha/day`],
    ['Payout assumption', `$${formatNumber(portalState.data.payout_kgms, 2)}/kg MS`],
    ['Weather source', portalState.data.weather_provider || blocks[0]?.weather_provider || '—'],
    ['Data mode', portalState.data.data_quality || '—'],
    ['Last report', portalState.data.generated_display || '—'],
  ];
  document.getElementById('summary').innerHTML = rows.map(([label, value]) => `<div class="summary-row"><span>${escapeHtml(label)}</span><span>${escapeHtml(value)}</span></div>`).join('');
}

function popupForBlock(block, title = block.block_name) {
  const decision = blockDecision(block.farm_id);
  const decisionRows = decision ? `<div class="popup-decision"><span>Today</span><strong>${escapeHtml(decision.primary_action)}</strong><small>${escapeHtml(decision.reason)}</small></div>` : '';
  return `<div class="popup-title">${escapeHtml(title)}</div>${decisionRows}<div class="popup-grid">
    <div><span>Temperature</span><strong>${escapeHtml(formatNumber(block.temp_now))}°C</strong></div>
    <div><span>Feels like</span><strong>${escapeHtml(formatNumber(block.feels_like))}°C</strong></div>
    <div><span>Soil moisture</span><strong>${escapeHtml(formatNumber(block.soil_m))}%</strong></div>
    <div><span>Soil temp</span><strong>${escapeHtml(formatNumber(block.soil_t))}°C</strong></div>
    <div><span>Growth</span><strong>${escapeHtml(formatNumber(block.est_growth))} kg DM</strong></div>
    <div><span>Pasture value</span><strong>${escapeHtml(formatMoney(block.revenue))}/ha</strong></div>
    <div><span>Rain 24h</span><strong>${escapeHtml(formatNumber(block.rain_total_24h))} mm</strong></div>
    <div><span>Pugging</span><strong>${escapeHtml(block.pugging_risk || '—')}</strong></div>
  </div>`;
}

function mapStyleForBlock(blockId) {
  const state = blockDecision(blockId)?.map_state || 'caution';
  if (state === 'go') return { color: '#59d48d', fillColor: '#59d48d', weight: 2, fillOpacity: .16 };
  if (state === 'hold') return { color: '#ff7474', fillColor: '#ff7474', weight: 2.5, fillOpacity: .18 };
  return { color: '#f3bd55', fillColor: '#f3bd55', weight: 2, fillOpacity: .14 };
}

function renderMap() {
  if (!window.L) return;
  if (portalState.map) portalState.map.remove();

  const blocks = portalState.data.blocks || [];
  const lat = average(blocks.map((block) => block.lat)) ?? -40.9;
  const lon = average(blocks.map((block) => block.lon)) ?? 174.9;
  const map = L.map('map', { center: [lat, lon], zoom: 13, zoomControl: false, attributionControl: false });
  portalState.map = map;
  L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { maxZoom: 19 }).addTo(map);
  L.tileLayer('https://services.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}', { maxZoom: 19, opacity: .62 }).addTo(map);
  L.control.zoom({ position: 'bottomleft' }).addTo(map);
  L.control.attribution({ prefix: false, position: 'bottomright' }).addAttribution('Esri, Maxar, LINZ | Pythology').addTo(map);

  const bounds = [];
  const features = portalState.paddocks?.features || [];
  if (features.length) {
    portalState.paddockLayer = L.geoJSON(portalState.paddocks, {
      style(feature) {
        const properties = feature?.properties || {};
        const block = blockById(properties.block || properties.block_id || properties.farm_id);
        return mapStyleForBlock(block?.farm_id);
      },
      onEachFeature(feature, layer) {
        const properties = feature.properties || {};
        const block = blockById(properties.block || properties.block_id || properties.farm_id);
        if (block) layer.bindPopup(popupForBlock(block, properties.name || properties.paddock || block.block_name), { maxWidth: 320 });
      },
    }).addTo(map);
    const layerBounds = portalState.paddockLayer.getBounds();
    if (layerBounds.isValid()) map.fitBounds(layerBounds.pad(.08));
    document.getElementById('map-note').textContent = `${features.length} mapped paddock${features.length === 1 ? '' : 's'} loaded. Colours show the current block decision state, not a sensor reading from each polygon.`;
  } else {
    blocks.forEach((block) => {
      if (!Number.isFinite(Number(block.lat)) || !Number.isFinite(Number(block.lon))) return;
      bounds.push([Number(block.lat), Number(block.lon)]);
      const style = mapStyleForBlock(block.farm_id);
      L.circleMarker([Number(block.lat), Number(block.lon)], { radius: 9, color: style.color, fillColor: style.fillColor, fillOpacity: .75, weight: 2 }).addTo(map).bindPopup(popupForBlock(block), { maxWidth: 320 });
    });
    if (bounds.length > 1) map.fitBounds(bounds, { padding: [60, 60] });
    document.getElementById('map-note').textContent = 'Block decision locations loaded. Detailed paddock boundaries appear after the farm map is processed.';
  }
}

function renderPortal() {
  const client = portalState.client;
  const dataClient = portalState.data.client || {};
  const displayName = client.name || dataClient.name || client.id;
  const contactName = client.contact_name || dataClient.contact_name || '';
  setText('farm-name', displayName);
  setText('farm-subtitle', [contactName ? `Welcome, ${contactName}` : '', client.region || dataClient.region || ''].filter(Boolean).join(' · '));
  setText('updated', portalState.data.generated_display ? `Updated ${portalState.data.generated_display}` : 'Report time unavailable');
  renderDecisionBanner();
  renderStats();
  renderRecommendations();
  renderAlerts();
  renderPlanner();
  renderTrialEvidence();
  renderSummary();
  renderMap();
}

document.addEventListener('DOMContentLoaded', () => {
  const gate = document.getElementById('gate');
  const portal = document.getElementById('portal');
  const form = document.getElementById('access-form');
  const clientInput = document.getElementById('client-id');
  const codeInput = document.getElementById('access-code');
  const error = document.getElementById('access-error');
  const button = form.querySelector('button[type="submit"]');
  const requestedClient = new URLSearchParams(window.location.search).get('client');
  if (requestedClient) clientInput.value = requestedClient;

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const clientId = clientInput.value.trim().toLowerCase();
    const accessCode = codeInput.value.trim();
    if (!clientId || !accessCode) return;
    error.textContent = '';
    button.disabled = true;
    button.textContent = 'Opening farm intelligence…';
    try {
      await openFarm(clientId, accessCode);
      history.replaceState({}, '', `${window.location.pathname}?client=${encodeURIComponent(clientId)}`);
      codeInput.value = '';
      gate.classList.add('hidden');
      portal.classList.remove('hidden');
      renderPortal();
    } catch (failure) {
      error.textContent = failure.message || 'Farm intelligence could not be opened.';
    } finally {
      button.disabled = false;
      button.textContent = 'Open private farm portal';
    }
  });

  document.getElementById('logout').addEventListener('click', () => {
    portalState.client = null;
    portalState.data = null;
    portalState.paddocks = null;
    portalState.accessCode = '';
    if (portalState.map) portalState.map.remove();
    portalState.map = null;
    portal.classList.add('hidden');
    gate.classList.remove('hidden');
    codeInput.value = '';
    codeInput.focus();
  });
});
