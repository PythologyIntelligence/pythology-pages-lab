/**
 * Progressive enhancement: compact source-aware layer selector.
 *
 * Existing sidebar filter stays as a fallback if this optional module fails.
 * Only changes Store filters; it never fetches external feeds or invokes AI.
 */
import { buildLayerCatalogue } from './layer-registry.js';

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]
  ));
}

const PRESETS = [
  ['overview', 'Overview'],
  ['hazards', 'Natural hazards'],
  ['arcus', 'ARCUS'],
  ['nemesis', 'Nemesis'],
  ['all', 'All'],
  ['none', 'None'],
];

export function initLayerMenu(store) {
  const tools = document.querySelector('#topbar .tools');
  if (!tools || !store) return null;
  if (document.getElementById('btn-layers')) return null;

  const anchor = document.createElement('div');
  anchor.className = 'layer-menu-anchor';
  anchor.innerHTML = `
    <button id="btn-layers" class="tool" type="button"
            aria-haspopup="true" aria-expanded="false"
            aria-controls="layer-menu-panel" title="Select globe intelligence layers">
      <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor"
           stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
        <path d="m12 2 9 5-9 5-9-5 9-5Z"/>
        <path d="m3 12 9 5 9-5M3 17l9 5 9-5"/>
      </svg>
      <span>Layers</span>
      <b class="layer-menu-count" aria-hidden="true">0</b>
    </button>
    <section id="layer-menu-panel" class="layer-menu-panel" hidden
             aria-label="Globe intelligence layers">
      <div class="layer-menu-title">
        <strong>Intelligence layers</strong>
        <button type="button" class="layer-menu-close" data-close
                aria-label="Close layers">×</button>
      </div>
      <div class="layer-menu-presets" aria-label="Layer presets">
        ${PRESETS.map(([key,label]) => `<button type="button" data-preset="${key}">${label}</button>`).join('')}
      </div>
      <label class="layer-menu-search-label" for="layer-menu-search">Find a layer</label>
      <input type="search" id="layer-menu-search" placeholder="Search layers" autocomplete="off">
      <div class="layer-menu-items" id="layer-menu-items"></div>
      <p class="layer-menu-footer" id="layer-menu-health">Checking ARCUS and Nemesis…</p><p class="layer-menu-footer">Choose multiple layers. Offline is not the same as no incidents.</p>
    </section>`;

  // Insert before the NZ-focus button so the selected toolbar affordance
  // stays near the existing navigation rather than growing the side rail.
  tools.insertBefore(anchor, document.getElementById('btn-nz'));
  const button = anchor.querySelector('#btn-layers');
  const panel = anchor.querySelector('#layer-menu-panel');
  const list = anchor.querySelector('#layer-menu-items');
  const search = anchor.querySelector('#layer-menu-search');
  const openGroups = new Set(['geophysical']);
  let term = '';

  function catalogue() {
    return buildLayerCatalogue(store.events, store.meta?.categories || {});
  }

  function setOpen(open) {
    panel.hidden = !open;
    button.setAttribute('aria-expanded', String(open));
    button.classList.toggle('on', open);
    if (open) {
      draw();
      search.focus();
    } else {
      button.focus();
    }
  }

  function draw() {
    const groups = catalogue();
    const items = groups.flatMap((group) => group.layers);
    const hidden = store.filters.hidden;
    const enabled = items.filter((item) => !hidden.has(item.key)).length;
    anchor.querySelector('.layer-menu-count').textContent = String(enabled);
    button.title = `Globe layers: ${enabled} of ${items.length} enabled`;
    const health = store.intelligenceHealth || {};
    const status = (k) => health[k] === 'ok' ? 'available'
      : health[k] === 'stale' ? 'STALE'
      : health[k] === 'unavailable' ? 'OFFLINE'
      : 'checking';
    anchor.querySelector('#layer-menu-health').textContent =
      `ARCUS: ${status('arcus')} · Nemesis: ${status('nemesis')}`;


    list.innerHTML = groups.map((group) => {
      const visible = group.layers.filter((item) =>
        item.label.toLowerCase().includes(term) || group.label.toLowerCase().includes(term)
      );
      if (!visible.length) return '';
      const count = group.layers.filter((item) => !hidden.has(item.key)).length;
      const expanded = term || openGroups.has(group.id);
      return `<details data-group="${esc(group.id)}" ${expanded ? 'open' : ''}>
        <summary><span>${esc(group.label)}</span>
          <small>${count}/${group.layers.length}</small>
        </summary>
        <div class="layer-menu-rows">
          ${visible.map((item) => `<label class="layer-menu-row">
            <input type="checkbox" data-layer="${esc(item.key)}"
                   ${hidden.has(item.key) ? '' : 'checked'}>
            <span title="${esc(item.key)}">${esc(item.label)}</span>
            <small>${item.count}</small>
          </label>`).join('')}
        </div>
      </details>`;
    }).join('') || '<p class="layer-menu-empty">No matching layers.</p>';
  }

  function preset(name) {
    const all = catalogue().flatMap((group) => group.layers);
    let selected;
    switch (name) {
      case 'all': selected = all.map((item) => item.key); break;
      case 'none': selected = []; break;
      case 'arcus': selected = all.filter((item) => item.namespace === 'arcus').map((item) => item.key); break;
      case 'nemesis': selected = all.filter((item) => item.namespace === 'nemesis').map((item) => item.key); break;
      case 'hazards':
        selected = all.filter((item) => item.namespace === 'earthnet' &&
          ['geophysical','weather','environment','ocean','space'].includes(item.group))
          .map((item) => item.key);
        break;
      case 'overview':
        selected = all.filter((item) => item.namespace === 'earthnet' || item.namespace === 'arcus')
          .map((item) => item.key);
        break;
      default: return;
    }
    store.setVisibleLayerKeys(selected);
  }

  button.addEventListener('click', () => setOpen(panel.hidden));
  anchor.querySelector('[data-close]').addEventListener('click', () => setOpen(false));
  panel.querySelector('.layer-menu-presets').addEventListener('click', (event) => {
    const button = event.target.closest('[data-preset]');
    if (button) preset(button.dataset.preset);
  });
  search.addEventListener('input', () => { term = search.value.toLowerCase().trim(); draw(); });
  list.addEventListener('change', (event) => {
    const input = event.target.closest('input[data-layer]');
    if (input) store.toggleLayer(input.dataset.layer);
  });
  list.addEventListener('toggle', (event) => {
    const details = event.target.closest('details[data-group]');
    if (!details || term) return;
    if (details.open) openGroups.add(details.dataset.group);
    else openGroups.delete(details.dataset.group);
  }, true);

  document.addEventListener('pointerdown', (event) => {
    if (!panel.hidden && !anchor.contains(event.target)) setOpen(false);
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !panel.hidden) {
      event.stopPropagation();
      setOpen(false);
    }
  }, true);

  store.addEventListener('feed', draw);
  store.addEventListener('filters', draw);
  store.addEventListener('intelligenceHealth', draw);
  draw();

  // The rail remains mounted and functional, but isn't duplicated on-screen.
  // If this optional enhancement throws, the original rail stays visible.
  document.body.classList.add('layer-menu-enhanced');
  return { refresh: draw, close: () => setOpen(false) };
}
