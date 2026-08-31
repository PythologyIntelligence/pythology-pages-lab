/* Brookfield/Newfield farmer-handover layer.
   Uses farmer-supplied Aeromap geometry for the visual paddock plan and a
   direct Open-Meteo overlay for current block-level weather/soil context.
   It deliberately does NOT claim paddock-level measured conditions. */
(function installMarkHandover() {
  const CLIENT_ID = 'brookfield-newfield-pilot';
  const calving = new Set(['Back', 'Tank', 'Greens']);
  let selectedFarm = 'brookfield';
  let selectedPaddock = 'Back';
  let liveRefreshStarted = false;
  let liveOverlayAt = null;

  const farms = {
    brookfield: {
      name: 'Brookfield',
      hectares: 116.7,
      viewBox: '120 45 850 1430',
      paddocks: [
        ['Yard',0.4,'M200,158 L200,160 L241,200 L246,200 L253,202 L251,196 L251,189 L253,186 L252,187 L248,187 L244,182 L244,180 L246,178 L244,174 L244,171 L247,169 L244,158 L235,156 L232,150 Z',230,173],
        ['House',0.2,'M290,159 L290,156 L287,153 L285,139 L280,139 L275,141 L266,142 L265,143 L262,143 L257,145 L253,145 L252,146 L237,149 L238,152 L246,153 L248,155 L251,165 L259,165 L261,168 L262,174 L275,171 L274,169 L276,167 L285,165 L285,164 Z',266,153],
        ['Gully',1.5,'M460,160 L456,136 L435,124 L395,112 L389,86 L336,125 L290,137 L293,153 L296,146 L301,146 L304,152 L325,146 L347,154 L358,146 L369,144 L374,148 Z',355,118],
        ['Lachlan',1.9,'M394,84 L398,108 L440,121 L459,132 L464,163 L489,183 L496,183 L501,176 L504,123 L501,120 L501,115 L506,112 L510,67 L430,75 L407,79 Z',438,100],
        ['3Hay',2.0,'M516,66 L510,111 L512,119 L509,122 L506,175 L514,172 L522,172 L539,178 L542,175 L548,175 L551,182 L576,195 L575,207 L577,208 L578,123 L574,120 L574,114 L579,111 L581,61 L579,58 Z',527,110],
        ['Dam',1.6,'M350,158 L353,173 L367,177 L380,190 L401,195 L421,193 L431,205 L460,218 L468,230 L486,242 L497,228 L495,203 L498,199 L494,189 L487,187 L458,165 L375,152 L366,155 L362,150 Z',451,189],
        ['Doc',1.0,'M354,178 L358,200 L355,236 L421,249 L440,214 L428,209 L419,198 L396,199 L378,194 L364,181 Z',383,210],
        ["Richard's",3.5,'M146,176 L145,185 L155,188 L158,193 L151,208 L161,217 L170,234 L191,251 L199,268 L200,331 L241,357 L275,355 L261,248 L270,237 L271,226 L265,202 L257,198 L256,207 L237,203 L195,159 L158,168 Z',222,245],
        ["Mary's",1.6,'M324,244 L276,257 L278,260 L275,266 L268,265 L277,323 L279,354 L319,352 L332,335 Z',290,287],
        ["Pete's",3.5,'M329,241 L337,332 L379,323 L417,324 L497,341 L512,354 L528,381 L536,413 L569,424 L570,386 L541,362 L528,332 L485,310 L421,254 L355,240 Z',386,280],
        ['Gum',1.4,'M504,180 L498,188 L502,195 L503,203 L510,205 L518,223 L506,260 L506,267 L576,289 L577,228 L572,225 L572,220 L577,217 L577,213 L561,199 L511,188 L506,185 Z',528,228],
        ['Bull',2.2,'M444,217 L425,252 L489,307 L532,329 L545,359 L571,381 L576,295 L501,270 L513,226 L505,207 L500,208 L502,229 L489,247 L464,233 L457,222 Z',503,289],
        ['Rimu',1.8,'M200,337 L225,356 L232,367 L238,385 L250,389 L272,409 L289,415 L307,444 L347,396 L370,362 L369,358 L355,350 L327,350 L321,356 L240,362 L218,346 Z',310,367],
        ['Desolation',1.9,'M330,345 L358,346 L380,359 L402,377 L423,371 L452,386 L483,392 L531,411 L524,384 L507,356 L493,345 L456,339 L435,330 L388,328 L338,336 Z',452,344],
        ['Flat',2.6,'M199,344 L197,371 L192,389 L171,424 L183,469 L193,478 L246,494 L261,495 L270,488 L269,470 L273,456 L303,446 L287,419 L269,413 L249,394 L235,389 L222,360 Z',220,414],
        ['Laneway',2.0,'M310,447 L363,459 L418,451 L449,461 L464,475 L457,499 L481,596 L493,609 L519,625 L534,621 L504,512 L478,474 L457,455 L420,443 L357,451 L335,448 L318,438 Z',480,540],
        ['Rock Haven',13.5,'M417,675 L372,754 L355,810 L324,834 L302,840 L288,859 L304,890 L341,896 L367,940 L363,978 L391,994 L437,1002 L476,989 L518,987 L556,998 L555,806 L473,678 Z',426,830],
        ['Greens',1.7,'M691,547 L686,582 L682,594 L682,604 L711,628 L746,628 L758,630 L765,634 L766,640 L772,637 L776,627 L788,626 L787,620 L783,620 L780,617 L780,612 L786,609 L782,573 L749,560 Z',704,567],
        ['Culvert',1.9,'M680,624 L668,680 L704,730 L714,750 L730,751 L737,725 L765,676 L761,673 L761,669 L765,665 L771,666 L787,631 L779,631 L778,637 L772,644 L717,644 L697,638 Z',688,651],
        ['Tank',6.5,'M568,682 L559,874 L584,874 L587,866 L593,866 L596,874 L730,874 L730,789 L699,731 L665,683 L616,701 Z',617,747],
        ['Bush',11.3,'M787,573 L790,608 L799,616 L792,620 L781,658 L737,737 L734,780 L943,882 L952,815 L947,772 L953,601 L912,576 Z',810,690],
        ['Middle',17.4,'M734,786 L733,878 L629,879 L706,998 L718,1037 L743,1077 L768,1083 L823,1153 L934,1217 L945,1049 L943,888 Z',808,930],
        ['Back',35.3,'M559,878 L552,1444 L931,1466 L934,1222 L822,1158 L765,1087 L740,1081 L624,879 Z',685,1215],
      ],
    },
    newfield: {
      name: 'Newfield',
      hectares: 32.7,
      viewBox: '125 75 1270 980',
      paddocks: [
        ['Hospital',1.4,'M376,105 L247,108 L251,261 L242,289 L235,391 L229,407 L282,382 L374,377 Z',309,248],
        ['Road 4',1.3,'M506,103 L438,104 L434,118 L424,116 L422,104 L381,106 L379,377 L502,374 Z',442,241],
        ['Road 3',1.3,'M634,102 L511,104 L508,375 L624,375 L631,371 Z',571,239],
        ['Road 2',1.3,'M766,101 L640,102 L638,373 L739,373 L757,369 Z',700,237],
        ['Road 1',1.3,'M904,99 L772,101 L763,370 L879,369 Z',830,233],
        ['Fenella',1.6,'M910,95 L886,360 L1035,357 L1034,373 L1064,372 L1100,274 L1107,216 L1019,210 L1012,94 Z',984,245],
        ['Dairy',1.6,'M1113,105 L1089,208 L1112,213 L1107,271 L1367,284 L1364,176 L1348,166 L1299,163 L1299,92 L1124,93 Z',1226,192],
        ['Josh',1.1,'M1070,372 L1369,389 L1368,290 L1105,276 Z',1228,333],
        ['Anna',1.1,'M1053,380 L1047,466 L1061,480 L1371,477 L1368,393 L1066,377 Z',1206,433],
        ['George',1.3,'M1043,516 L1040,590 L1374,612 L1372,500 L1063,499 L1048,507 Z',1214,550],
        ['Pony',1.5,'M394,394 L287,395 L233,423 L223,653 L247,652 L278,659 L389,647 Z',312,526],
        ['Stacey',1.5,'M560,389 L427,391 L400,396 L395,646 L540,636 L568,630 Z',481,516],
        ['Wendy',1.7,'M768,387 L587,389 L590,629 L794,614 Z',684,506],
        ['Nigels',1.8,'M998,380 L773,387 L800,613 L1002,599 L1004,460 L991,457 Z',892,493],
        ['Archie',1.7,'M390,652 L286,663 L245,657 L160,662 L150,860 L394,842 Z',272,756],
        ['Harry',1.2,'M568,635 L544,641 L394,652 L399,842 L571,829 Z',483,740],
        ['Kimberley',1.6,'M795,619 L590,634 L594,828 L819,813 Z',700,725],
        ['House',1.1,'M1018,603 L800,618 L824,812 L900,806 L912,713 L1002,718 Z',897,689],
        ['Nathanael',2.0,'M992,822 L1206,831 L1206,677 L1375,672 L1374,617 L1038,595 L1004,809 L994,807 Z',1148,703],
        ['Tundra',1.6,'M394,847 L150,865 L143,1042 L399,1023 Z',271,945],
        ['Clives',1.1,'M571,834 L399,847 L405,1022 L575,1012 Z',488,929],
        ['Siobhan',1.7,'M820,818 L577,834 L580,1013 L841,992 Z',704,915],
        ['Dump',0.9,'M826,817 L846,991 L971,982 L994,828 L914,829 L901,812 Z',907,900],
      ],
    },
  };

  function isMarkPilot() {
    return portalState?.client?.id === CLIENT_ID;
  }

  function blockFor(farmId) {
    return portalState?.data?.blocks?.find((block) => block.farm_id === farmId) || null;
  }

  function mapState(farmId) {
    return decisionIntel()?.paddock_decisions?.find((item) => item.block_id === farmId)?.map_state || 'go';
  }

  function formatLive(value, suffix = '', decimals = 1) {
    return Number.isFinite(Number(value)) ? `${Number(value).toFixed(decimals)}${suffix}` : '—';
  }

  function frostSeverity(minTemp) {
    const value = Number(minTemp);
    if (!Number.isFinite(value)) return 'Unknown';
    if (value <= 0) return 'Hard';
    if (value < 2) return 'Light';
    return 'None';
  }

  function dailyLabel(date, index) {
    if (index === 0) return 'Today';
    if (index === 1) return 'Tomorrow';
    try { return new Date(`${date}T12:00:00`).toLocaleDateString('en-NZ', { weekday: 'short' }); }
    catch { return date; }
  }

  function weatherActions(blocks) {
    const actions = [];
    for (const block of blocks) {
      if (block.frost_severity && block.frost_severity !== 'None' && block.frost_severity !== 'Unknown') {
        actions.push({
          id: `${block.farm_id}:live-frost`, priority: 'urgent', category: 'livestock',
          block_id: block.farm_id, block_name: block.block_name,
          action: `Protect vulnerable stock around ${block.block_name} during the forecast frost window.`,
          why: `${block.frost_severity} frost risk is present in the current block forecast.`,
          evidence: [`Minimum: ${formatLive(block.frost_min, '°C')}`, 'Source: live Open-Meteo block forecast'],
          verification: 'live_weather_overlay_pending_field_feedback',
        });
      }
      if (Number(block.rain_total_24h) >= 12) {
        actions.push({
          id: `${block.farm_id}:live-rain`, priority: 'today', category: 'weather',
          block_id: block.farm_id, block_name: block.block_name,
          action: `Review wet-ground exposure around ${block.block_name}.`,
          why: `${formatLive(block.rain_total_24h, ' mm')} is forecast today.`,
          evidence: ['Block-level forecast only; paddock saturation model is not yet connected.'],
          verification: 'live_weather_overlay_pending_field_feedback',
        });
      }
      if (Number(block.max_gust) >= 45) {
        actions.push({
          id: `${block.farm_id}:live-wind`, priority: 'today', category: 'weather',
          block_id: block.farm_id, block_name: block.block_name,
          action: `Allow for strong gusts around ${block.block_name}.`,
          why: `Forecast gusts reach ${formatLive(block.max_gust, ' km/h', 0)}.`,
          evidence: ['Block-level forecast only; paddock exposure modelling is not yet connected.'],
          verification: 'live_weather_overlay_pending_field_feedback',
        });
      }
    }
    return actions;
  }

  function liveDecision(block) {
    const severeWeather = Number(block.rain_total_24h) >= 30 || Number(block.max_gust) >= 65;
    const caution = block.frost_severity !== 'None' || Number(block.rain_total_24h) >= 10 || Number(block.max_gust) >= 35;
    const state = severeWeather ? 'hold' : caution ? 'caution' : 'go';
    return {
      block_id: block.farm_id,
      block_name: block.block_name,
      map_state: state,
      primary_action: state === 'hold' ? 'Weather conditions warrant a conservative operating hold.' : state === 'caution' ? 'Proceed with extra care around the current weather risks.' : 'No block-level weather hold is indicated.',
      reason: 'Live weather overlay only. Field observations and paddock conditions remain authoritative.',
      decisions: { graze: state === 'hold' ? 'HOLD' : state === 'caution' ? 'CAUTION' : 'GO', spray: 'N/A', effluent: 'N/A', pugging: block.pugging_risk || 'Unverified' },
    };
  }

  async function fetchBlockLive(block) {
    const params = new URLSearchParams({
      latitude: String(block.lat),
      longitude: String(block.lon),
      timezone: 'Pacific/Auckland',
      forecast_days: '3',
      current: 'temperature_2m,apparent_temperature,dew_point_2m,wind_speed_10m,wind_gusts_10m,soil_temperature_0cm,soil_moisture_0_to_1cm',
      hourly: 'et0_fao_evapotranspiration',
      daily: 'temperature_2m_max,temperature_2m_min,precipitation_sum,wind_speed_10m_max,wind_gusts_10m_max',
    });
    const response = await fetch(`https://api.open-meteo.com/v1/forecast?${params.toString()}`, { cache: 'no-store' });
    if (!response.ok) throw new Error(`Open-Meteo returned ${response.status}`);
    const live = await response.json();
    const current = live.current || {};
    const daily = live.daily || {};
    const et = (live.hourly?.et0_fao_evapotranspiration || []).slice(0, 24).reduce((sum, value) => sum + (Number(value) || 0), 0);
    const rain = Number(daily.precipitation_sum?.[0]);
    const soilFraction = Number(current.soil_moisture_0_to_1cm);
    const minTemp = Number(daily.temperature_2m_min?.[0]);
    const dewSpread = Number(current.temperature_2m) - Number(current.dew_point_2m);
    const planner = (daily.time || []).slice(0, 3).map((date, index) => ({
      day: dailyLabel(date, index),
      date: String(date).slice(5).split('-').reverse().join('/'),
      rain: Number(daily.precipitation_sum?.[index]) || 0,
      wind: Number(daily.wind_speed_10m_max?.[index]) || 0,
      spray: '—', graze: '—', pugging: '—',
      high: Number(daily.temperature_2m_max?.[index]),
      low: Number(daily.temperature_2m_min?.[index]),
    }));
    return {
      ...block,
      weather_provider: 'Open-Meteo live overlay',
      temp_now: Number(current.temperature_2m),
      feels_like: Number(current.apparent_temperature),
      high: Number(daily.temperature_2m_max?.[0]),
      low: minTemp,
      frost_min: minTemp,
      frost_severity: frostSeverity(minTemp),
      rain_total_24h: Number.isFinite(rain) ? rain : 0,
      rain_arrival: null,
      rain_end: null,
      max_wind: Number(daily.wind_speed_10m_max?.[0]),
      max_gust: Number(daily.wind_gusts_10m_max?.[0]),
      soil_t: Number(current.soil_temperature_0cm),
      soil_m: Number.isFinite(soilFraction) ? soilFraction * 100 : block.soil_m,
      et_24h: et,
      moisture_balance: Number.isFinite(rain) ? rain - et : block.moisture_balance,
      balance_status: Number.isFinite(rain) ? (rain - et < -1 ? 'Deficit' : rain - et > 1 ? 'Surplus' : 'Balanced') : block.balance_status,
      dew_spread: Number.isFinite(dewSpread) ? dewSpread : block.dew_spread,
      planner,
    };
  }

  function renderLiveBar(farmId) {
    const block = blockFor(farmId) || {};
    const target = document.getElementById('mark-map-live');
    if (!target) return;
    target.innerHTML = `
      <div><span>Temperature</span><strong>${formatLive(block.temp_now, '°C')}</strong></div>
      <div><span>Frost risk</span><strong>${escapeHtml(block.frost_severity || '—')}</strong></div>
      <div><span>Wind gust</span><strong>${formatLive(block.max_gust, ' km/h', 0)}</strong></div>
      <div><span>Soil moisture</span><strong>${formatLive(block.soil_m, '%', 0)}</strong></div>
      <div><span>Pasture growth</span><strong>${formatLive(block.est_growth, ' kg DM')}</strong></div>`;
  }

  function renderPaddockDetail(farmId, paddockName) {
    const farm = farms[farmId];
    const paddock = farm?.paddocks.find((item) => item[0] === paddockName) || farm?.paddocks[0];
    const block = blockFor(farmId) || {};
    const state = mapState(farmId);
    const target = document.getElementById('mark-map-detail');
    if (!target || !paddock) return;
    target.innerHTML = `
      <div><span>Selected paddock</span><strong>${escapeHtml(paddock[0])} · ${formatLive(paddock[1], ' ha')}</strong></div>
      <div><span>Current operating state</span><strong>${escapeHtml(state.toUpperCase())} · block-level live weather</strong></div>
      <div><span>Paddock intelligence</span><strong>${calving.has(paddock[0]) ? 'Saved for calving · ' : ''}Boundary confirmed from supplied plan; paddock-level terrain/soil variation comes next.</strong></div>`;
  }

  function renderFarmSvg(farmId) {
    const farm = farms[farmId];
    const stage = document.getElementById('mark-map-stage');
    if (!stage || !farm) return;
    const state = mapState(farmId);
    const paths = farm.paddocks.map(([name, hectares, path, x, y]) => {
      const selected = name === selectedPaddock ? ' selected' : '';
      const calvingClass = calving.has(name) ? ' calving' : '';
      const font = hectares >= 10 ? 20 : hectares >= 2 ? 16 : hectares >= 1 ? 13 : 10;
      const showHa = hectares >= 0.9;
      return `<g data-mark-paddock="${escapeHtml(name)}"><path class="mark-paddock ${escapeHtml(state)}${calvingClass}${selected}" d="${path}" data-paddock="${escapeHtml(name)}"></path><text class="mark-label" x="${x}" y="${y}" font-size="${font}">${escapeHtml(name)}</text>${showHa ? `<text class="mark-label-ha" x="${x}" y="${y + font + 3}" font-size="${Math.max(8, font - 4)}">${formatLive(hectares, ' ha')}</text>` : ''}</g>`;
    }).join('');
    stage.innerHTML = `<svg viewBox="${farm.viewBox}" role="img" aria-label="${escapeHtml(farm.name)} paddock boundary plan" preserveAspectRatio="xMidYMid meet">${paths}</svg>`;
    stage.querySelectorAll('[data-paddock]').forEach((path) => path.addEventListener('click', () => {
      selectedPaddock = path.dataset.paddock;
      renderFarmSvg(farmId);
      renderPaddockDetail(farmId, selectedPaddock);
    }));
    renderLiveBar(farmId);
    renderPaddockDetail(farmId, selectedPaddock);
  }

  function installFarmMap() {
    if (!isMarkPilot()) return;
    if (portalState.map) {
      try { portalState.map.remove(); } catch {}
      portalState.map = null;
    }
    const panel = document.querySelector('.map-panel');
    if (!panel) return;
    const currentFarm = farms[selectedFarm];
    panel.innerHTML = `<div class="mark-farm-map">
      <div class="mark-map-toolbar">
        <div class="mark-map-switch"><label for="mark-block-select">Farm block</label><select id="mark-block-select"><option value="brookfield"${selectedFarm === 'brookfield' ? ' selected' : ''}>Brookfield · 116.7 ha</option><option value="newfield"${selectedFarm === 'newfield' ? ' selected' : ''}>Newfield · 32.7 ha</option></select></div>
        <span class="mark-map-badge">Farmer-supplied paddock plan</span>
      </div>
      <div class="mark-map-live" id="mark-map-live"></div>
      <div class="mark-map-stage" id="mark-map-stage"></div>
      <div class="mark-map-detail" id="mark-map-detail"></div>
      <div class="mark-map-note"><span class="mark-map-key"><span><i class="go"></i>GO</span><span><i class="caution"></i>CAUTION</span><span><i class="hold"></i>HOLD</span></span> · Boundaries digitised from Mark’s supplied Aeromap plans. Live conditions are currently calculated at block level. We do not claim paddock-level frost, wind or soil variation until the terrain/satellite layer is connected.</div>
    </div>`;
    document.getElementById('mark-block-select')?.addEventListener('change', (event) => {
      selectedFarm = event.target.value;
      selectedPaddock = selectedFarm === 'brookfield' ? 'Back' : 'Hospital';
      renderFarmSvg(selectedFarm);
    });
    if (!currentFarm.paddocks.some((item) => item[0] === selectedPaddock)) selectedPaddock = currentFarm.paddocks[0][0];
    renderFarmSvg(selectedFarm);
  }

  function showLiveBanner(message, good = false) {
    const banner = document.getElementById('weather-refresh-banner');
    if (!banner) return;
    banner.hidden = false;
    banner.classList.toggle('mark-live-banner', good);
    banner.innerHTML = message;
  }

  function decorateUpdated() {
    if (!isMarkPilot()) return;
    const updated = document.getElementById('updated');
    if (!updated) return;
    const engine = portalState.data?.generated_display || 'last reviewed cycle';
    if (liveOverlayAt) {
      updated.textContent = `LIVE WEATHER ${liveOverlayAt.toLocaleTimeString('en-NZ', { hour: 'numeric', minute: '2-digit' })} · ENGINE ${engine}`;
    }
  }

  async function refreshLiveOverlay(baseRenderPortal) {
    if (!isMarkPilot()) return;
    const blocks = portalState.data?.blocks || [];
    if (!blocks.length) return;
    showLiveBanner('Refreshing current Brookfield and Newfield weather & soil context…');
    try {
      const refreshed = await Promise.all(blocks.map(fetchBlockLive));
      portalState.data.blocks = refreshed;
      const actions = weatherActions(refreshed);
      if (portalState.data.decision_intelligence) {
        portalState.data.decision_intelligence.action_board = actions;
        portalState.data.decision_intelligence.paddock_decisions = refreshed.map(liveDecision);
        if (portalState.data.decision_intelligence.value_tracking) {
          portalState.data.decision_intelligence.value_tracking.recommendations_this_cycle = actions.length;
          portalState.data.decision_intelligence.value_tracking.high_priority_actions = actions.filter((item) => item.priority === 'urgent').length;
        }
      }
      liveOverlayAt = new Date();
      portalState.data.weather_refresh = { status: 'live_overlay', last_success: liveOverlayAt.toISOString(), message: 'Live Open-Meteo overlay active.' };
      baseRenderPortal();
      installFarmMap();
      decorateUpdated();
      const engine = escapeHtml(portalState.data?.generated_display || 'last reviewed engine cycle');
      showLiveBanner(`<strong>Live weather & soil active.</strong> Brookfield and Newfield refreshed from Open-Meteo at ${escapeHtml(liveOverlayAt.toLocaleTimeString('en-NZ', { hour: 'numeric', minute: '2-digit' }))}. Pasture-growth/feed intelligence remains on the validated engine model (${engine}) until the private hourly publisher credential is connected.`, true);
    } catch (error) {
      console.warn('Mark pilot live overlay failed', error);
      installFarmMap();
      showLiveBanner('Live weather refresh is temporarily unavailable — showing the last validated farm snapshot.');
    }
  }

  const baseRenderPortal = window.renderPortal;
  window.renderPortal = function renderMarkHandoverPortal() {
    baseRenderPortal();
    if (!isMarkPilot()) return;
    installFarmMap();
    decorateUpdated();
    if (!liveRefreshStarted) {
      liveRefreshStarted = true;
      refreshLiveOverlay(baseRenderPortal);
      window.setInterval(() => refreshLiveOverlay(baseRenderPortal), 15 * 60 * 1000);
    }
  };
})();
