/**
 * EnviroArc-native EarthNet module definitions.
 *
 * These are product/intelligence layers, not necessarily one-to-one event
 * categories. A layer may be observational, modelled, derived, or a combination
 * as long as the evidence class remains explicit in the data object.
 */

export const EVIDENCE_CLASS = Object.freeze({
  OBSERVED: 'observed',
  OFFICIAL: 'official',
  MODELLED: 'modelled',
  REANALYSIS: 'reanalysis',
  PROXY: 'proxy',
  DERIVED: 'derived',
  SCREENED: 'screened',
});

export const FRESHNESS_STATE = Object.freeze({
  LIVE: 'live',
  RECENT: 'recent',
  STALE: 'stale',
  UNAVAILABLE: 'unavailable',
});

export const EARTHNET_MODULES = Object.freeze({
  geophysical: { id: 'geophysical', label: 'Geophysical Intelligence' },
  atmosphere: { id: 'atmosphere', label: 'Atmospheric Intelligence' },
  hydrological: { id: 'hydrological', label: 'Hydrological Intelligence' },
  ocean: { id: 'ocean', label: 'Ocean Circulation Intelligence' },
  cryosphere: { id: 'cryosphere', label: 'Cryosphere Intelligence' },
  biosphere: { id: 'biosphere', label: 'Biosphere Intelligence' },
  impact: { id: 'impact', label: 'Impact & Exposure' },
  space: { id: 'space', label: 'Space Weather' },
});

export const EARTHNET_LAYERS = Object.freeze([
  // Cryosphere
  { id: 'arctic_sea_ice_extent', module: 'cryosphere', label: 'Arctic sea-ice extent', renderer: 'polygon', baseline: true, status: 'planned' },
  { id: 'antarctic_sea_ice_extent', module: 'cryosphere', label: 'Antarctic sea-ice extent', renderer: 'polygon', baseline: true, status: 'planned' },
  { id: 'sea_ice_concentration', module: 'cryosphere', label: 'Sea-ice concentration', renderer: 'raster', baseline: true, status: 'planned' },
  { id: 'sea_ice_thickness', module: 'cryosphere', label: 'Sea-ice thickness', renderer: 'raster', baseline: true, status: 'planned' },
  { id: 'ice_mass_balance', module: 'cryosphere', label: 'Glacier / ice-sheet mass balance', renderer: 'timeseries', baseline: true, status: 'planned' },
  { id: 'melt_rate', module: 'cryosphere', label: 'Ice melt rate', renderer: 'timeseries', baseline: true, status: 'planned' },
  { id: 'grounding_line_retreat', module: 'cryosphere', label: 'Grounding-line retreat', renderer: 'line', baseline: true, status: 'planned' },
  { id: 'ice_shelf_retreat', module: 'cryosphere', label: 'Ice-shelf retreat', renderer: 'polygon', baseline: true, status: 'planned' },
  { id: 'ice_surface_temperature', module: 'cryosphere', label: 'Ice surface temperature', renderer: 'raster', baseline: true, status: 'planned' },
  { id: 'ice_albedo', module: 'cryosphere', label: 'Ice / snow albedo', renderer: 'raster', baseline: true, status: 'planned' },
  { id: 'major_calving', module: 'cryosphere', label: 'Major calving events', renderer: 'event', baseline: false, status: 'planned' },

  // Ocean circulation
  { id: 'amoc_indicators', module: 'ocean', label: 'AMOC indicators', renderer: 'timeseries', baseline: true, status: 'planned' },
  { id: 'gulf_stream_path', module: 'ocean', label: 'Gulf Stream / North Atlantic Current', renderer: 'streamline', baseline: true, status: 'planned' },
  { id: 'antarctic_circumpolar_current', module: 'ocean', label: 'Antarctic Circumpolar Current', renderer: 'streamline', baseline: true, status: 'planned' },
  { id: 'pacific_circulation', module: 'ocean', label: 'Pacific circulation', renderer: 'streamline', baseline: true, status: 'planned' },
  { id: 'upwelling', module: 'ocean', label: 'Upwelling zones', renderer: 'raster', baseline: true, status: 'planned' },
  { id: 'current_velocity', module: 'ocean', label: 'Current speed & direction', renderer: 'vector', baseline: true, status: 'planned' },
  { id: 'sst', module: 'ocean', label: 'Sea-surface temperature', renderer: 'raster', baseline: true, status: 'planned' },
  { id: 'salinity', module: 'ocean', label: 'Ocean salinity', renderer: 'raster', baseline: true, status: 'planned' },
  { id: 'sea_level_anomaly', module: 'ocean', label: 'Sea-level anomaly', renderer: 'raster', baseline: true, status: 'planned' },
  { id: 'marine_heatwave', module: 'ocean', label: 'Marine heatwaves', renderer: 'polygon', baseline: true, status: 'planned' },
]);

export const MECHANISM_REGISTRY = Object.freeze([
  {
    id: 'cryosphere_freshwater_circulation',
    label: 'Cryosphere freshwater → ocean circulation',
    hypothesis: 'Ice loss can alter freshwater input, salinity/density structure and circulation, with downstream regional impacts.',
    edges: [
      { from: 'ice_loss', to: 'freshwater_input', mechanism: 'meltwater / discharge', expectedDirection: 'increase', lag: 'days-years' },
      { from: 'freshwater_input', to: 'salinity_density', mechanism: 'freshening / density change', expectedDirection: 'decrease', lag: 'days-years' },
      { from: 'salinity_density', to: 'circulation_response', mechanism: 'buoyancy / overturning / pathway response', expectedDirection: 'context-dependent', lag: 'months-decades' },
      { from: 'circulation_response', to: 'regional_impacts', mechanism: 'heat / nutrient / moisture transport change', expectedDirection: 'context-dependent', lag: 'months-decades' },
    ],
  },
]);


const h = (v) => String(v ?? '').replace(/[&<>"']/g, (ch) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]
));

const signed = (v, dp = 2) => {
  const n = Number(v);
  return Number.isFinite(n) ? `${n >= 0 ? '+' : ''}${n.toFixed(dp)}` : '—';
};

const plain = (v, dp = 2) => {
  const n = Number(v);
  return Number.isFinite(n) ? n.toFixed(dp) : '—';
};

function nodeLabel(id) {
  return {
    ice_loss: 'Cryosphere state',
    freshwater_input: 'Freshwater input',
    salinity_density: 'Salinity / density',
    circulation_response: 'Current behaviour',
    regional_impacts: 'Regional impacts',
  }[id] || id;
}

function nodeStateClass(state) {
  if (state === 'evidence-gap' || state === 'unavailable') return 'gap';
  if (state === 'open') return 'open';
  return 'measured';
}

function polarCard(label, p) {
  if (!p) return `
    <article class="env-polar-card">
      <span>${h(label)}</span><strong>Unavailable</strong>
      <small>No current polar snapshot was published.</small>
    </article>`;

  const tr = p.trend || {};
  return `
    <article class="env-polar-card">
      <span>${h(label)}</span>
      <strong>${signed(p.anomalyMkm2)} million km²</strong>
      <small>${plain(p.extentMkm2)} million km² extent · ${p.rank ? h(String(p.rank)) + ' / ' + h(String(p.years || '—')) + ' lowest rank' : 'rank unavailable'}</small>
      <div class="env-mini-metrics">
        <i><b>${signed(tr.rate7dMkm2PerDay, 3)}</b> M km²/day <em>7-day rate</em></i>
        <i><b>${signed(tr.accelerationMkm2PerDay2, 4)}</b> M km²/day² <em>rate change</em></i>
      </div>
    </article>`;
}

export function enviroarcMarkup(snapshot, { error = null } = {}) {
  if (error && !snapshot) {
    return `
      <button class="panel-close" data-act="close" aria-label="Close">&times;</button>
      <div class="panel-scroll">
        <header class="panel-head" style="--accent:#14b8a6">
          <div class="chips"><span class="chip cat">EnviroArc</span><span class="chip sub">Earth-system mechanisms</span></div>
          <h2>Linked environmental intelligence</h2>
        </header>
        <div class="env-boundary">The Earth-system layer snapshot is temporarily unavailable. Hazard monitoring remains operational.</div>
      </div>`;
  }

  if (!snapshot) {
    return `
      <button class="panel-close" data-act="close" aria-label="Close">&times;</button>
      <div class="panel-scroll">
        <header class="panel-head" style="--accent:#14b8a6">
          <div class="chips"><span class="chip cat">EnviroArc</span></div>
          <h2>Loading Earth-system mechanisms…</h2>
        </header>
      </div>`;
  }

  const mechanisms = snapshot.mechanisms || [];
  return `
    <button class="panel-close" data-act="close" aria-label="Close">&times;</button>
    <div class="panel-scroll">
      <header class="panel-head" style="--accent:#14b8a6">
        <div class="chips">
          <span class="chip cat">EnviroArc</span>
          <span class="chip sub">Cryosphere ↔ Ocean</span>
        </div>
        <h2>Connected Earth-system mechanisms</h2>
        <p class="panel-summary">Watch the chain, not just the layers: ice state → freshwater evidence → salinity/density → current behaviour → downstream impacts.</p>
      </header>

      <div class="env-boundary">
        <strong>Evidence boundary</strong>
        <span>${h(snapshot.evidenceBoundary || 'Coincident signals are not causal attribution.')}</span>
      </div>

      <section class="env-polar-grid">
        ${polarCard('Arctic sea ice', snapshot.cryosphere?.arctic)}
        ${polarCard('Antarctic sea ice', snapshot.cryosphere?.antarctic)}
      </section>

      <section class="env-layer-health">
        <h3>Live layer state</h3>
        <div class="panel-facts">
          <div><span>Surface currents</span>${snapshot.ocean?.currents?.vectors?.length ?? 0}<em>NOAA display vectors</em></div>
          <div><span>Salinity</span>${snapshot.ocean?.salinity?.cells?.length ?? 0}<em>SMOS anomaly samples</em></div>
          <div><span>SST</span>${snapshot.ocean?.sst?.cells?.length ?? 0}<em>CRW anomaly samples</em></div>
          <div><span>Generated</span>${snapshot.generatedAt ? h(new Date(snapshot.generatedAt).toUTCString().slice(5, 22)) + ' UTC' : '—'}<em>layer snapshot</em></div>
        </div>
      </section>

      <section class="env-layer-health">
        <h3>Major circulation context</h3>
        <div class="env-current-systems">
          ${(snapshot.ocean?.currents?.systems || []).map((s) => `
            <article>
              <span>${h(s.name)}</span>
              <strong>${s.speed?.mean != null ? plain(s.speed.mean, 3) + ' m/s' : 'unavailable'}</strong>
              <small>${s.change30d != null ? '30-day comparison ' + signed(s.change30d, 3) + ' m/s · ' : ''}${h(s.note || '')}</small>
            </article>
          `).join('')}
        </div>
      </section>

      <section class="env-mechanisms">
        <h3>Coupled signals</h3>
        ${mechanisms.map((m) => `
          <article class="env-mechanism">
            <div class="env-mech-head">
              <span>${h(m.region || 'system')}</span>
              <strong>${h((m.status || 'unknown').replaceAll('-', ' '))}</strong>
            </div>
            <p>${h(m.assessment || '')}</p>
            <div class="env-chain">
              ${(m.nodes || []).map((node, i) => `
                <div class="env-node ${nodeStateClass(node.state)}">
                  <span>${h(nodeLabel(node.id))}</span>
                  <strong>${node.value == null ? h(node.state || '—') : h(String(node.value))}</strong>
                  ${node.unit ? `<em>${h(node.unit)}</em>` : ''}
                  <small>${h(node.note || '')}</small>
                </div>
                ${i < (m.nodes || []).length - 1 ? '<b class="env-arrow">→</b>' : ''}
              `).join('')}
            </div>
          </article>
        `).join('')}
      </section>

      <section class="method">
        <h3>Sources &amp; interpretation</h3>
        <p>Sea-ice extent: NSIDC Sea Ice Index v4. Surface currents: NOAA CoastWatch/AOML. Salinity anomaly: NOAA CoastWatch SMOS versus World Ocean Atlas. SST anomaly: NOAA Coral Reef Watch.</p>
        <p><strong>Important:</strong> North Atlantic surface-current context is not a direct AMOC-strength measurement, and Southern Ocean surface-current speed is not a full-depth ACC transport estimate. Those require dedicated observing products before EarthNet should make stronger claims.</p>
      </section>
    </div>`;
}
