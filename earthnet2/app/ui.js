import { esc, fmtAgo, catColor, eventColor, band } from './util.js';
import { GROUP_ORDER, SEVERITY_BANDS } from './config.js';
import { healthColor } from './solar.js';

/** Sidebar: live status, filters, and the ranked list of what matters now. */
export class Sidebar {
  constructor(el, store, { onSelect, onHoverItem } = {}) {
    this.el = el;
    this.store = store;
    this.onSelect = onSelect;
    this.onHoverItem = onHoverItem;
    this.listEl = el.querySelector('#list');
    this.railEl = el.querySelector('#rail');
    // The status pill lives in the top bar, not inside the sidebar element.
    this.statusEl = document.getElementById('status');
    this.sheetStatusEl = document.getElementById('sheet-status');

    // The sheet is collapsed to a 46px lip on phones; tapping the handle is the
    // only obvious way to reach the event list, so it must open and close it.
    const handle = el.querySelector('#sheet-handle');
    handle?.addEventListener('click', () => {
      const open = el.classList.toggle('open');
      handle.setAttribute('aria-expanded', String(open));
      if (!open) el.querySelector('#search')?.blur();
    });

    el.querySelector('#search').addEventListener('input', (e) => {
      this.store.setFilter({ query: e.target.value.trim() });
    });
    el.querySelector('#sev').addEventListener('input', (e) => {
      el.querySelector('#sev-val').textContent = e.target.value;
      this.store.setFilter({ minSeverity: Number(e.target.value) });
    });
    el.querySelector('#nz-only').addEventListener('change', (e) => this.store.setFilter({ nzOnly: e.target.checked }));
    el.querySelector('#active-only').addEventListener('change', (e) => this.store.setFilter({ activeOnly: e.target.checked }));
    el.querySelector('#cats-all').addEventListener('click', () => this.store.showAllCategories());
    el.querySelector('#cats-none').addEventListener('click', () => this.store.hideAllCategories());

    this.railEl.addEventListener('click', (e) => {
      const b = e.target.closest('[data-cat]');
      if (!b) return;
      // Alt-click isolates a single layer, which is far quicker than switching
      // seventeen others off one at a time when you want to study just one.
      if (e.altKey || e.metaKey) this.store.soloCategory(b.dataset.cat);
      else this.store.toggleCategory(b.dataset.cat);
    });

    this.listEl.addEventListener('click', (e) => {
      const li = e.target.closest('[data-id]');
      if (li) this.onSelect?.(this.store.byId(li.dataset.id));
    });
    this.listEl.addEventListener('pointerover', (e) => {
      const li = e.target.closest('[data-id]');
      this.onHoverItem?.(li ? li.dataset.id : null);
    });
  }

  renderStatus() {
    const m = this.store.meta;
    const n = this.store.filtered().length;
    const total = this.store.events.length;
    const feedHealth = this.store.feedHealth;
    const live = feedHealth === 'ok';
    const label = live ? 'EARTHNET LIVE'
      : feedHealth === 'stale' ? 'EARTHNET STALE'
      : 'EARTHNET FEED OFFLINE';
    const html = `
      <span class="pulse"></span>
      <span class="live">${label}</span>
      <span class="sep">·</span>
      <span>${n === total ? `${total} events` : `${n} of ${total}`}</span>
      ${m?.generatedAt ? `<span class="sep upd">·</span><span class="upd" title="${esc(m.generatedAt)}">updated ${fmtAgo(m.generatedAt)}</span>` : ''}
      ${m?.nz != null ? `<span class="sep">·</span><span class="nzc">${m.nz} in NZ</span>` : ''}`;
    this.statusEl.innerHTML = html;
    // The topbar has no room for this below 900px, so the mobile bottom sheet
    // carries its own copy on the handle. Only one of the two is ever visible.
    if (this.sheetStatusEl) this.sheetStatusEl.innerHTML = html;
  }

  /**
   * The map legend: one panel per hazard type, each lit along its edge in the
   * exact colour its markers are drawn in and named in that same colour, so the
   * eye can go straight from a light on the globe to the row that explains it.
   * All switched on to begin with, and every panel is a switch. Categories with
   * nothing in them right now are still listed — the point of a legend is to
   * decode the globe, so it has to be complete and it has to stay put between
   * refreshes rather than reshuffling as counts change.
   */
  renderRail() {
    const counts = this.store.countsForRail();
    const hidden = this.store.filters.hidden;

    const groups = new Map();
    for (const k of this.store.categoryKeys()) {
      const g = this.store.categoryGroup(k);
      if (!groups.has(g)) groups.set(g, []);
      groups.get(g).push(k);
    }
    const rank = (g) => (GROUP_ORDER.indexOf(g) < 0 ? 99 : GROUP_ORDER.indexOf(g));
    const ordered = [...groups.entries()].sort((a, b) => rank(a[0]) - rank(b[0]));

    this.railEl.innerHTML = ordered
      .map(
        ([group, cats]) => `
        <section class="rail-group">
          <h4>${esc(group)}</h4>
          ${cats
            .map((k) => {
              const off = hidden.has(`earthnet:${k}`);
              const n = counts[k] || 0;
              const label = this.store.categoryLabel(k);
              return `<button class="lyr${off ? ' off' : ''}${n ? '' : ' empty'}" data-cat="${esc(k)}"
                style="--c:${catColor(k)}" aria-pressed="${!off}"
                title="${esc(label)} — ${n} on the globe. Click to ${off ? 'show' : 'hide'} · Alt-click for this layer only">
                <span class="lyr-name">${esc(label)}${this.store.isDerived(k) ? '<i class="drv" title="Derived index">~</i>' : ''}</span>
                <span class="lyr-count">${n}</span>
              </button>`;
            })
            .join('')}
        </section>`,
      )
      .join('');

    this.el.querySelector('#cats-all').hidden = hidden.size === 0;
    this.el.querySelector('#cats-none').hidden = hidden.size > 0;
  }

  renderList(selectedId) {
    const items = this.store.ranked(80);
    if (!items.length) {
      this.listEl.innerHTML = `<li class="empty">Nothing matches these filters.</li>`;
      return;
    }
    this.listEl.innerHTML = items
      .map((e) => {
        const b = band(e.severity);
        return `<li data-id="${esc(e.id)}" class="${e.id === selectedId ? 'sel' : ''}${e.nz ? ' nz' : ''}">
          <span class="bar" style="background:${eventColor(e)}"></span>
          <div class="li-main">
            <div class="li-top">
              <span class="li-cat" style="color:${eventColor(e)}">${esc(this.store.labelForEvent(e))}</span>
              ${e.nz ? '<span class="li-nz">NZ</span>' : ''}
              <span class="li-age">${fmtAgo(e.updatedAt || e.lastSeen)}</span>
            </div>
            <div class="li-title">${esc(e.title)}</div>
            ${e.headline ? `<div class="li-head">${esc(e.headline)}</div>` : ''}
          </div>
          <div class="li-sev" style="color:${b.color}" title="${esc(e.severityLabel || b.label)}">${e.severity}</div>
        </li>`;
      })
      .join('');
  }

  renderLegend(el) {
    // Named explicitly: markers are coloured by hazard type (that key is the
    // rail on the left), and these are the severity bands. Two colour scales on
    // one screen have to say which is which.
    el.innerHTML =
      `<b>Severity</b>${SEVERITY_BANDS.slice()
        .reverse()
        .map((b) => `<span><i style="background:${b.color}"></i>${b.label}</span>`)
        .join('')}`;
  }
}

/** Hover tooltip pinned to a marker's screen position. */
export class Tooltip {
  constructor(el, store) {
    this.el = el;
    this.store = store;
  }

  show(event, x, y) {
    if (!event) return this.hide();
    const b = band(event.severity);
    this.el.innerHTML = `
      <div class="tt-cat" style="color:${eventColor(event)}">${esc(this.store.labelForEvent(event))}</div>
      <div class="tt-title">${esc(event.title)}</div>
      <div class="tt-foot"><span style="color:${b.color}">${event.severity} ${esc(event.severityLabel || b.label)}</span>
        <span>${fmtAgo(event.updatedAt || event.lastSeen)}</span></div>`;
    this._place(x, y);
  }

  /**
   * The Sun. It is the one thing on screen that is clickable without being a
   * marker, so the tooltip has to say so out loud — otherwise it reads as
   * scenery and nobody ever tries.
   */
  showSun(solar, x, y) {
    const h = solar?.health;
    const color = h?.key ? healthColor(h.key) : '#ffcb84';
    this.el.innerHTML = `
      <div class="tt-cat" style="color:${color}">The Sun</div>
      <div class="tt-title">${esc(h?.label ? `Solar activity — ${h.label.toLowerCase()}` : 'Solar activity')}</div>
      <div class="tt-foot">
        <span style="color:${color}">${solar?.xray?.class ? `X-ray ${esc(solar.xray.class)}` : 'Live from SDO'}</span>
        <span>click for detail</span></div>`;
    this._place(x, y);
  }

  _place(x, y) {
    this.el.style.transform = `translate(${x + 16}px, ${y - 12}px)`;
    this.el.classList.add('on');
    // Flip to the left of the cursor when it would otherwise run off screen.
    const w = this.el.offsetWidth;
    if (x + 16 + w > window.innerWidth - 12) this.el.style.transform = `translate(${x - w - 16}px, ${y - 12}px)`;
  }

  hide() {
    this.el.classList.remove('on');
  }
}
