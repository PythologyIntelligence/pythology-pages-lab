import { Globe } from './globe.js';
import { Store } from './store.js';
import { Sidebar, Tooltip } from './ui.js';
import { Panel } from './panel.js';
import { catColor, eventColor, subsolarPoint } from './util.js';
import { loadSolar, healthColor } from './solar.js';
import { NZ_VIEW, HOME_VIEW } from './config.js';

const store = new Store();
const canvas = document.getElementById('globe');
const loader = document.getElementById('loader');
const loaderNote = document.getElementById('loader-note');

const tooltip = new Tooltip(document.getElementById('tooltip'), store);

const globe = new Globe(canvas, {
  onPick: (hit) => (hit?.sun ? openSun() : select(hit?.event || null, { fly: false })),
  onHover: (hit) => {
    if (!hit) return tooltip.hide();
    if (hit.sun) return tooltip.showSun(solar, hit.sx, hit.sy);
    tooltip.show(hit.event, hit.sx, hit.sy);
  },
});

const panel = new Panel(document.getElementById('panel'), store, {
  onFocus: (e) => e && globe.flyTo(e.lat, e.lon, 1.75),
  onClose: () => {
    selectedId = null;
    globe.select(null);
    document.getElementById('btn-sun')?.classList.remove('on');
  },
});

const sidebar = new Sidebar(document.getElementById('sidebar'), store, {
  onSelect: (e) => select(e, { fly: true }),
});
sidebar.renderLegend(document.getElementById('legend'));

/* Optional compact Layers menu. The original rail remains available if it fails. */
import('./layer-menu.js')
  .then(({ initLayerMenu }) => initLayerMenu(store))
  .catch((err) => console.warn('Optional intelligence layer menu unavailable:', err));


let selectedId = null;
let solar = null;
const enviroarcVisibility = { currents: true, salinity: false, sst: false };

function renderEnviroArc() {
  globe.setEnviroArcLayers(store.enviroarc, enviroarcVisibility);
  const state = document.getElementById('enviroarc-state');
  if (state) {
    state.classList.remove('ok', 'warn');
    if (store.enviroarc) {
      const e = store.enviroarc;
      const n = e.ocean?.currents?.vectors?.length || 0;
      const currentError = e.ocean?.currents?.error || null;
      const salinityN = e.ocean?.salinity?.cells?.length || 0;
      const sstN = e.ocean?.sst?.cells?.length || 0;
      const when = e.generatedAt ? new Date(e.generatedAt).toUTCString().slice(5, 22) + ' UTC' : 'latest snapshot';

      const currentToggle = document.getElementById('env-currents');
      if (currentToggle) {
        currentToggle.disabled = n === 0;
        currentToggle.title = n === 0
          ? (currentError ? `Current provider unavailable: ${currentError}` : 'No current vectors in this snapshot')
          : 'Toggle ocean-current vectors';
      }

      if (n > 0) {
        state.textContent = `Linked · ${n} current vectors · ${when}`;
        state.classList.add('ok');
      } else {
        state.textContent = `Currents unavailable · salinity ${salinityN} · SST ${sstN} · ${when}`;
        state.classList.add('warn');
      }
    } else if (store.enviroarcError) {
      state.textContent = 'Linked layers unavailable — hazard feed unaffected.';
      state.classList.add('warn');
    } else {
      state.textContent = 'Loading linked ocean / cryosphere context…';
    }
  }
  if (panel.mode === 'enviroarc') {
    panel.openEnviroArc(store.enviroarc, { error: store.enviroarcError });
  }
}

/* ---------------- the Sun ---------------- */

/**
 * The solar snapshot is published separately from the hazard feed and is never
 * required for the globe to work, so a failure here is silent on the globe and
 * only visible if the reader actually opens the panel.
 */
async function loadSolarSnapshot() {
  try {
    solar = await loadSolar();
    globe.setSolar(solar);
    renderSunChip();
    if (panel.mode === 'solar') panel.openSolar(solar);
  } catch (err) {
    console.warn('solar snapshot unavailable', err);
    if (panel.mode === 'solar') panel.openSolar(null, { error: 'Space-weather data is temporarily unavailable.' });
  }
}

function renderSunChip() {
  const chip = document.getElementById('btn-sun');
  if (!chip) return;
  const h = solar?.health;
  const color = h?.key ? healthColor(h.key) : '#ffcb84';
  chip.style.setProperty('--c', color);
  chip.querySelector('.sun-chip-val').textContent = h?.label || 'Sun';
  chip.title = h ? `Solar activity — ${h.label}. ${h.note || ''}` : 'Solar activity';
  chip.hidden = false;
}

function openSun({ reveal = false } = {}) {
  select(null);
  panel.openSolar(solar, { loading: !solar });
  document.getElementById('btn-sun')?.classList.add('on');
  // Opening from the chip when the Sun is off screen or behind the Earth also
  // goes and finds it, so the answer to "where is it?" is given once and the
  // reader can click the Sun itself from then on.
  if (reveal && !globe.sunVisible()) globe.flyToSun();
  if (!solar) loadSolarSnapshot();
}

function select(event, { fly = false } = {}) {
  if (event) document.getElementById('btn-sun')?.classList.remove('on');
  selectedId = event?.id || null;
  globe.select(selectedId);
  sidebar.renderList(selectedId);
  if (!event) {
    panel.close();
    globe.setOverlays([]);
    return;
  }
  panel.open(event);
  const d = store.detailFor(event.id);
  globe.setOverlays(d ? [{ track: d.track, polygon: d.polygon, color: eventColor(event) }] : []);
  if (fly && event.lat != null) {
    // Keep the current altitude unless we are further out than the event needs.
    const dist = Math.min(globe.camera.position.length(), 2.4);
    globe.flyTo(event.lat, event.lon, Math.max(1.6, dist));
  }
}

function refreshView() {
  const visible = store.filtered();
  globe.setEvents(visible);
  sidebar.renderRail();
  sidebar.renderList(selectedId);
  sidebar.renderStatus();
}

store.addEventListener('filters', refreshView);
store.addEventListener('feed', refreshView);
store.addEventListener('enviroarc', renderEnviroArc);
store.addEventListener('detail', () => {
  if (selectedId) {
    const e = store.byId(selectedId);
    const d = store.detailFor(selectedId);
    if (e && d) {
      globe.setOverlays([{ track: d.track, polygon: d.polygon, color: eventColor(e) }]);
      panel.render();
    }
  }
});

/* ---------------- controls ---------------- */

document.getElementById('btn-nz').addEventListener('click', () => {
  const on = !store.filters.nzOnly;
  document.getElementById('nz-only').checked = on;
  store.setFilter({ nzOnly: on });
  globe.flyTo(NZ_VIEW.lat, NZ_VIEW.lon, NZ_VIEW.distance);
  document.getElementById('btn-nz').classList.toggle('on', on);
});

document.getElementById('btn-home').addEventListener('click', () => {
  // Reset to the daylit face rather than a fixed longitude, matching the opening
  // shot — a "reset" that lands on the night side reads as a broken globe.
  const sun = subsolarPoint(new Date());
  globe.flyTo(sun.lat * 0.3 - 14, sun.lon + 40, HOME_VIEW.distance);
});

document.getElementById('btn-spin').addEventListener('click', (e) => {
  const spinning = (globe.controls.autoRotate = !globe.controls.autoRotate);
  e.currentTarget.classList.toggle('on', spinning);
  // The tooltip names the action, not the state, so it has to flip with it —
  // a stopped globe under a "Pause rotation" tooltip reads as a broken button.
  e.currentTarget.title = spinning ? 'Pause rotation' : 'Resume rotation';
  e.currentTarget.setAttribute('aria-pressed', String(spinning));
});

// Default to readable geography. This only adjusts the globe shader; the
// reported day/night, actual sun position, markers and evidence do not change.
const btnGeo = document.getElementById('btn-geography');
btnGeo?.addEventListener('click', () => {
  const enabled = btnGeo.getAttribute('aria-pressed') !== 'true';
  globe.setGeographyMode(enabled);
  btnGeo.setAttribute('aria-pressed', String(enabled));
  btnGeo.classList.toggle('on', enabled);
  btnGeo.title = enabled
    ? 'Visible Earth: illuminated map of oceans and continents (not actual daylight). Click for astronomical day/night.'
    : 'Astronomical day/night lighting. Click to reveal ocean and continent geography everywhere.';
  const caption = btnGeo.querySelector('span');
  if (caption) caption.textContent = enabled ? 'Visible Earth' : 'Day / Night';
});

const btnTC = document.getElementById('btn-truecolor');
btnTC.addEventListener('click', async () => {
  const on = !btnTC.classList.contains('on');
  btnTC.classList.toggle('on', on);
  if (on) {
    btnTC.classList.add('loading');
    const date = await globe.loadTrueColor();
    btnTC.classList.remove('loading');
    btnTC.title = `VIIRS true colour, ${date}`;
    document.getElementById('imagery-note').textContent = `Today's imagery · VIIRS ${date}`;
  } else {
    document.getElementById('imagery-note').textContent = 'Blue Marble · shaded relief and bathymetry';
  }
  globe.setTrueColorMix(on ? 1 : 0);
});

for (const [id, key] of [
  ['env-currents', 'currents'],
  ['env-salinity', 'salinity'],
  ['env-sst', 'sst'],
]) {
  document.getElementById(id)?.addEventListener('change', (e) => {
    enviroarcVisibility[key] = e.target.checked;
    renderEnviroArc();
  });
}

document.getElementById('env-mechanisms')?.addEventListener('click', () => {
  selectedId = null;
  globe.select(null);
  globe.setOverlays([]);
  document.getElementById('btn-sun')?.classList.remove('on');
  panel.openEnviroArc(store.enviroarc, { error: store.enviroarcError });
});

document.getElementById('btn-sun').addEventListener('click', () => {
  if (panel.mode === 'solar') return panel.close();
  // Auto-rotation would carry the Sun straight back out of frame, so stop it —
  // and say so on the button, which names the action rather than the state.
  const spin = document.getElementById('btn-spin');
  globe.controls.autoRotate = false;
  spin.classList.remove('on');
  spin.title = 'Resume rotation';
  spin.setAttribute('aria-pressed', 'false');
  openSun({ reveal: true });
});

window.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  if (panel.mode === 'solar' || panel.mode === 'enviroarc') panel.close();
  else select(null);
});

/* ---------------- boot ---------------- */

(async function boot() {
  try {
    loaderNote.textContent = 'Loading hazard feed';
    await store.load();
    loaderNote.textContent = 'Assembling NASA imagery';
    await globe.loadImagery((stage) => {
      if (stage === 'base') loader.classList.add('fading');
    });
    loader.classList.add('done');
    document.body.classList.add('ready');
    // Deliberately after the globe is up: the Sun is already drawn at a default
    // tint, and nobody should wait on space weather to see the Earth.
    loadSolarSnapshot();
  } catch (err) {
    console.error(err);
    loaderNote.innerHTML = `Could not load the feed.<br><small>${String(err.message || err)}</small>`;
    loader.classList.add('error');
  }
})();

// The ingest function republishes every 15 minutes; pick that up without a reload.
setInterval(() => {
  store.load().catch(() => {});
  loadSolarSnapshot();
}, 5 * 60 * 1000);
