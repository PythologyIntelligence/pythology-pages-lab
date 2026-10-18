import { esc, fmtAgo, fmtCoord, catColor, eventColor, band, sparkPath } from './util.js';
import { setsFor, snapshotUrl, worldviewUrl, imageryDate } from './imagery.js';
import { solarMarkup, CHANNELS } from './solar.js';
import { API_BASE } from './config.js';
import { enviroarcMarkup } from './enviroarc.js';
import { incident3DUrl } from './incident3d-link.js';

/**
 * The event detail panel. Everything shown here is either in the feed already
 * or fetched lazily when the panel opens, so opening an event never blocks the
 * globe and closing one cancels nothing the user still needs.
 */
export class Panel {
  constructor(root, store, { onFocus, onClose } = {}) {
    this.root = root;
    this.store = store;
    this.onFocus = onFocus;
    this.onClose = onClose;
    this.current = null;
    this.imagerySet = 0;
    // Event, solar and EnviroArc mechanism views deliberately use separate
    // modes so a coupled Earth-system assessment is never presented as if it
    // were a single hazard observation.
    this.mode = 'event';
    this.sunChannel = CHANNELS[0].key;
    this.sunPlaying = false;
    // Channels whose time-lapse this browser turned out not to be able to
    // decode. Kept per channel rather than globally — one missing movie says
    // nothing about the other three.
    this.sunNoMovie = new Set();
    this.root.addEventListener('click', (e) => this._onClick(e));
  }

  close() {
    this.current = null;
    this.mode = 'event';
    this.sunPlaying = false;
    this.root.classList.remove('open', 'solar', 'enviroarc');
    this.root.innerHTML = '';
    this.onClose?.();
  }

  /** The Sun. `snapshot` may be null while the fetch is still in flight. */
  openSolar(snapshot, { loading = false, error = null } = {}) {
    const fresh = this.mode !== 'solar';
    this.mode = 'solar';
    this.current = null;
    this.solar = snapshot || this.solar || null;
    this.solarLoading = loading;
    this.solarError = error;
    if (fresh) {
      this.sunPlaying = false;
      const prev = this.root.querySelector('.panel-scroll');
      if (prev) prev.scrollTop = 0;
    }
    this.root.classList.add('open', 'solar');
    this.render();
  }

  openEnviroArc(snapshot, { error = null } = {}) {
    this.mode = 'enviroarc';
    this.current = null;
    this.enviroarc = snapshot || this.enviroarc || null;
    this.enviroarcError = error;
    this.root.classList.remove('solar');
    this.root.classList.add('open', 'enviroarc');
    const prev = this.root.querySelector('.panel-scroll');
    if (prev) prev.scrollTop = 0;
    this.render();
  }

  open(event) {
    if (!event) return this.close();
    this.mode = 'event';
    this.root.classList.remove('solar', 'enviroarc');
    this.current = event;
    this.imagerySet = 0;
    // A new event starts at the top; the scroll carried over below is only
    // meant to survive a re-render of the *same* event.
    const prev = this.root.querySelector('.panel-scroll');
    if (prev) prev.scrollTop = 0;
    this.root.classList.add('open');
    this.render();
    this._loadContext(event);
  }

  _onClick(e) {
    const t = e.target.closest('[data-act]');
    if (!t) return;
    const act = t.dataset.act;
    if (act === 'close') this.close();
    if (act === 'focus') this.onFocus?.(this.current);
    if (act === 'imagery') {
      this.imagerySet = Number(t.dataset.i);
      this.render();
    }
    if (act === 'sun-ch') {
      // Switching channel drops back to the still. The loop is 24 hours of one
      // wavelength; carrying "playing" across a switch would autoplay a video
      // the reader never asked for.
      this.sunChannel = t.dataset.ch;
      this.sunPlaying = false;
      this.render();
    }
    if (act === 'sun-play') {
      this.sunPlaying = true;
      this.render();
    }
  }

  /** News and the AI brief come from the api function; both are optional. */
  async _loadContext(event) {
    const id = event.id;
    this._context = null;
    // External ARCUS/Nemesis records are already a projection. The old
    // EarthNet context endpoint has no matching IDs; never hang on an AI call.
    if (!API_BASE || (event.sourceSystem && event.sourceSystem !== 'earthnet')) {
      this._contextLoading = false;
      this._context = null;
      this.render();
      return;
    }
    // A cold brief takes ten seconds or more to write. Showing a placeholder is
    // the difference between "the panel is still working" and "this event has
    // no coverage", which are very different messages.
    this._contextLoading = true;
    this.render();
    try {
      const r = await fetch(`${API_BASE}/context?id=${encodeURIComponent(id)}`);
      if (!r.ok) return;
      const body = await r.json();
      if (this.current?.id !== id) return;
      this._context = body;
    } catch {
      /* offline or api unavailable: the panel is complete without it */
    } finally {
      if (this.current?.id === id) {
        this._contextLoading = false;
        this.render();
      }
    }
  }

  render() {
    // The brief lands seconds after the panel opens and re-renders the whole
    // body. Without this the reader is yanked back to the top mid-scroll, which
    // on a long event feels like the panel reloaded under them.
    const keepScroll = this.root.querySelector('.panel-scroll')?.scrollTop || 0;

    if (this.mode === 'enviroarc') {
      this.root.innerHTML = enviroarcMarkup(this.enviroarc, { error: this.enviroarcError });
      if (keepScroll) this.root.querySelector('.panel-scroll').scrollTop = keepScroll;
      return;
    }

    if (this.mode === 'solar') {
      this.root.innerHTML = solarMarkup(this.solar, {
        channel: this.sunChannel,
        playing: this.sunPlaying,
        loading: this.solarLoading && !this.solar,
        error: this.solarError,
        movieError: this.sunNoMovie.has(this.sunChannel),
      });
      if (keepScroll) this.root.querySelector('.panel-scroll').scrollTop = keepScroll;
      // An undecodable movie must drop back to the still frame rather than
      // leave an empty box that blames the spacecraft.
      const video = this.root.querySelector('.sun-fig video');
      if (video) {
        const ch = this.sunChannel;
        video.addEventListener('error', () => {
          this.sunNoMovie.add(ch);
          if (this.mode === 'solar' && this.sunChannel === ch) {
            this.sunPlaying = false;
            this.render();
          }
        });
      }
      return;
    }

    const e = this.current;
    if (!e) return;
    const d = this.store.detailFor(e.id) || {};
    const extra = d.extra || {};
    const color = eventColor(e);
    const b = band(e.severity);
    const terrainHref = incident3DUrl(e);
    const sets = setsFor(e.category);
    const set = sets[Math.min(this.imagerySet, sets.length - 1)];

    this.root.innerHTML = `
      <button class="panel-close" data-act="close" aria-label="Close">&times;</button>
      <div class="panel-scroll">
        <header class="panel-head" style="--accent:${color}">
          <div class="chips">
            <span class="chip cat">${esc(this.store.labelForEvent(e))}</span>
            ${e.subtype ? `<span class="chip sub">${esc(e.subtype)}</span>` : ''}
            ${e.sourceSystem ? `<span class="chip derived">${esc(e.sourceSystem.toUpperCase())} · ${esc(e.evidenceClass || "reported")}</span>` : e.derived ? '<span class="chip derived" title="A modelled index, not a direct observation">Derived index</span>' : ''}
            ${e.active === false ? '<span class="chip ended">Ended</span>' : ''}
          </div>
          <h2>${esc(e.title)}</h2>
          <div class="sev-row">
            <div class="sev-num" style="color:${b.color}">${e.severity}</div>
            <div class="sev-meta">
              <div class="sev-label" style="color:${b.color}">${esc(e.severityLabel || b.label)}</div>
              <div class="sev-bar"><i style="width:${e.severity}%;background:${b.color}"></i></div>
              ${e.peakSeverity > e.severity ? `<div class="sev-peak">Peaked at ${e.peakSeverity}</div>` : ''}
            </div>
          </div>
        </header>

        ${terrainHref ? `<section class="incident-3d-entry">
          <a class="btn incident-3d-launch" href="${esc(terrainHref)}"
             aria-label="Explore ${esc(e.title)} in 3D terrain and research"
             title="Open this exact EarthNet event with its source geometry, terrain and Prometheus evidence">
             ◈ Explore this event in 3D <span aria-hidden="true">↗</span>
          </a>
          <small>Terrain + source evidence + Prometheus screening. Missing polygons stay labelled as unavailable.</small>
        </section>` : ''}

        <div class="panel-facts">
          <div><span>Location</span>${esc(e.place || e.country || '—')}<em>${e.orbit ? `${e.orbit.ld} lunar distances` : fmtCoord(e.lat, e.lon)}</em></div>
          <div><span>Updated</span>${fmtAgo(e.updatedAt || e.lastSeen)}<em>${e.updatedAt ? new Date(e.updatedAt).toUTCString().slice(5, 22) + ' UTC' : ''}</em></div>
          <div><span>First seen</span>${fmtAgo(e.firstSeen)}<em>tracked since</em></div>
          <div><span>Source</span>${e.sourceUrl ? `<a href="${esc(e.sourceUrl)}" target="_blank" rel="noopener">${esc(e.source)}</a>` : esc(e.source)}<em>${e.derived ? 'computed' : 'observed'}</em></div>
        </div>

        ${this._approach(e)}
        ${e.summary ? `<p class="panel-summary">${esc(e.summary)}</p>` : ''}

        ${this._metrics(e)}
        ${this._chart(e, extra, color)}
        ${this._imagery(e, set, sets)}
        ${this._series(extra, color)}
        ${this._brief()}
        ${this._news()}
        ${e.method ? `<details class="method"><summary>How this is measured</summary><p>${esc(e.method)}</p></details>` : ''}

        <div class="panel-actions">
          ${e.lat == null ? '' : '<button class="btn ghost" data-act="focus">Centre on globe</button>'}
          ${e.sourceUrl ? `<a class="btn ghost" href="${esc(e.sourceUrl)}" target="_blank" rel="noopener">Source data</a>` : ''}
        </div>
      </div>`;

    if (keepScroll) this.root.querySelector('.panel-scroll').scrollTop = keepScroll;
  }

  /**
   * Close-approach diagram for a near-Earth object. A miss distance in
   * kilometres means very little on its own; the same number set against the
   * Moon's orbit is immediately readable — inside it, or well outside it.
   */
  _approach(e) {
    const o = e.orbit;
    if (!o) return '';

    const when = e.startsAt ? new Date(e.startsAt) : null;
    const days = Number(o.days);
    const countdown =
      !Number.isFinite(days) ? ''
        : days < 0 ? 'Closest approach has passed'
          : days < 1 / 24 ? 'Closest approach within the hour'
            : days < 1 ? `Closest approach in ${Math.round(days * 24)} hours`
              : `Closest approach in ${days < 10 ? days.toFixed(1) : Math.round(days)} days`;

    // Same square-root compression as the globe ring, so the panel and the
    // marker agree about where the object sits.
    const ld = Math.max(0, Number(o.ld) || 0);
    const pos = (v) => Math.min(100, Math.sqrt(Math.min(v, 20) / 20) * 100);

    return `
      <div class="approach">
        <div class="approach-top">
          <b>${countdown}</b>
          ${when ? `<span>${when.toUTCString().slice(0, 22)} UTC</span>` : ''}
        </div>
        <div class="approach-scale">
          <i class="earth" title="Earth"></i>
          <i class="moon" style="left:${pos(1)}%" title="The Moon's orbit — 384,400 km"></i>
          <i class="obj" style="left:${pos(ld)}%;--c:${catColor(e.category)}"></i>
          <span class="tick" style="left:${pos(1)}%">Moon</span>
          <span class="tick end">20 LD</span>
        </div>
        <div class="approach-foot">
          <span>Passes at <b>${o.ld}</b> lunar distances${ld < 1 ? ' — inside the Moon\u2019s orbit' : ''}</span>
          ${o.kmps ? `<span><b>${o.kmps}</b> km/s relative</span>` : ''}
          ${o.pha ? '<span class="pha">Potentially hazardous asteroid</span>' : ''}
        </div>
      </div>`;
  }

  _metrics(e) {
    if (!e.metrics?.length) return '';
    return `<div class="metrics">${e.metrics
      .map(
        (m) => `<div class="metric"><span>${esc(m.label)}</span><strong>${esc(m.value)}${m.unit ? `<i>${esc(m.unit)}</i>` : ''}</strong></div>`,
      )
      .join('')}</div>`;
  }

  /** Sparkline for whichever timeseries this hazard actually carries. */
  _chart(e, extra, color) {
    const spark = extra.spark || extra.series;
    if (!Array.isArray(spark) || spark.length < 3) return '';
    const values = spark.map((p) => (typeof p === 'number' ? p : p.val ?? p.value ?? p.tmax ?? p.anomaly));
    const p = sparkPath(values, 620, 120, 8);
    if (!p) return '';
    const first = spark[0], last = spark.at(-1);
    const label = (x) => (typeof x === 'object' ? (x.ts || x.date || '') : '');
    const unit = extra.unit || (e.metrics?.[0]?.unit ?? '');
    return `
      <section class="block">
        <h3>Recent trend<em>${spark.length} readings</em></h3>
        <div class="chart">
          <svg viewBox="0 0 620 120" preserveAspectRatio="none" role="img" aria-label="Recent trend">
            <defs><linearGradient id="g-${esc(e.id).replace(/[^a-z0-9]/gi, '')}" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0" stop-color="${color}" stop-opacity="0.42"/>
              <stop offset="1" stop-color="${color}" stop-opacity="0"/>
            </linearGradient></defs>
            <path d="${p.area}" fill="url(#g-${esc(e.id).replace(/[^a-z0-9]/gi, '')})"/>
            <path d="${p.d}" fill="none" stroke="${color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
          </svg>
          <div class="chart-axis">
            <span>${esc(String(label(first)).slice(0, 16))}</span>
            <span class="mid">${p.min.toFixed(1)} – ${p.max.toFixed(1)}${unit ? ` ${esc(unit)}` : ''}</span>
            <span>${esc(String(label(last)).slice(0, 16))}</span>
          </div>
        </div>
      </section>`;
  }

  _imagery(e, set, sets) {
    if (!e.bbox) return '';
    const date = imageryDate(1);
    const url = snapshotUrl(e.bbox, set, { date });
    const wv = worldviewUrl(e.bbox, set, date);
    return `
      <section class="block">
        <h3>Satellite<em>NASA ${esc(date)}</em></h3>
        ${sets.length > 1 ? `<div class="seg">${sets
          .map((s, i) => `<button data-act="imagery" data-i="${i}" class="${s === set ? 'on' : ''}">${esc(s.label.split(' (')[0])}</button>`)
          .join('')}</div>` : ''}
        <figure class="sat">
          <img src="${esc(url)}" alt="Satellite view of ${esc(e.place || e.title)}" loading="lazy"
               onerror="this.closest('figure').classList.add('failed')">
          <figcaption>${esc(set.label)} · <a href="${esc(wv)}" target="_blank" rel="noopener">open in Worldview</a></figcaption>
        </figure>
      </section>`;
  }

  /** Companion sensors, e.g. the gas analysers alongside a fumarole probe. */
  _series(extra, color) {
    if (!Array.isArray(extra.series) || !extra.series.length || typeof extra.series[0] !== 'object' || !extra.series[0].label) return '';
    return `
      <section class="block">
        <h3>Other sensors at this site</h3>
        <ul class="sensors">
          ${extra.series
            .map(
              (s) => `<li><span class="dot" style="background:${color}"></span>
                <span class="sname">${esc(s.label)}</span>
                <span class="sval">${esc(s.value ?? '—')}</span>
                ${s.ageHours != null ? `<span class="sage">${Math.round(s.ageHours)} h ago</span>` : ''}</li>`,
            )
            .join('')}
        </ul>
      </section>`;
  }

  _brief() {
    if (this._contextLoading) {
      return `
        <section class="block brief loading">
          <h3>Situation brief<em>writing</em></h3>
          <p class="skeleton"><i></i><i></i><i></i></p>
        </section>`;
    }
    const b = this._context?.brief;
    if (!b) return '';
    return `
      <section class="block brief">
        <h3>Situation brief<em>AI generated</em></h3>
        <p>${esc(b.text)}</p>
        <small>Written from the source data on this page. Verify against the official source before acting on it.</small>
      </section>`;
  }

  _news() {
    const items = this._context?.news;
    if (!items?.length) return '';
    return `
      <section class="block">
        <h3>In the news<em>${items.length}</em></h3>
        <ul class="news">
          ${items
            .map(
              (n) => `<li><a href="${esc(n.url)}" target="_blank" rel="noopener">
                <span class="ntitle">${esc(n.title)}</span>
                <span class="nmeta">${esc(n.source || '')}${n.publishedAt ? ` · ${fmtAgo(n.publishedAt)}` : ''}</span></a></li>`,
            )
            .join('')}
        </ul>
      </section>`;
  }
}
