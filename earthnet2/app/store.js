import { FEED_URL, DETAIL_URL, ENVIROARC_URL, CATEGORY_LABEL } from './config.js';
import { layerKeyForEvent, buildLayerCatalogue } from './layer-registry.js';
import { arcusEvents, nemesisEvents, mergeIntelligence } from './intelligence-adapter.js';

/**
 * Feed state. The marker feed and the heavy per-event detail are separate
 * files: the globe renders as soon as the first lands, and detail is merged in
 * behind it without blocking anything the user can already see.
 */
export class Store extends EventTarget {
  constructor() {
    super();
    this.events = [];
    this.baseEvents = [];
    this.intelligence = { arcus: [], nemesis: [] };
    this.intelligenceHealth = { arcus: 'pending', nemesis: 'pending' };
    this._externalFetchInFlight = false;
    this.detail = {};
    this.meta = null;
    this.feedHealth = 'pending';
    this.feedError = null;
    this.enviroarc = null;
    this.enviroarcError = null;
    this.filters = {
      // Every hazard layer is on until the user switches one off, so this holds
      // what is *hidden* rather than what is selected. An include-set would mean
      // the legend starts with nothing lit, which reads as "no data".
      hidden: new Set(),
      minSeverity: 0,
      nzOnly: false,
      activeOnly: true,
      query: '',
    };
  }

  emit(name, detail) {
    this.dispatchEvent(new CustomEvent(name, { detail }));
  }

  async load() {
    // A missing EarthNet snapshot must not take down the globe or prevent
    // independent ARCUS/Nemesis evidence from appearing.
    try {
      const res = await fetch(`${FEED_URL}?t=${Math.floor(Date.now() / 60000)}`,
        { signal: AbortSignal.timeout(8000), cache: 'no-store' });
      if (!res.ok) throw new Error(`feed HTTP ${res.status}`);
      const body = await res.json();
      if (!Array.isArray(body?.events)) throw new Error('Invalid EarthNet feed schema');
      this.meta = body.meta || null;
      this.baseEvents = body.events;
      const generated = Date.parse(body.meta?.generatedAt || body.generatedAt || '');
      const outdated = !Number.isFinite(generated) || Date.now() - generated > 90 * 60_000;
      this.feedHealth = outdated ? 'stale' : 'ok';
      this.feedError = null;
    } catch (err) {
      // Retain the last known snapshot (if any). Never claim zero hazards.
      this.feedHealth = this.baseEvents.length ? 'stale' : 'unavailable';
      this.feedError = String(err?.message || err);
      console.warn('EarthNet hazard feed unavailable, independent layers continue:', this.feedError);
    }
    this.rebuildEvents();
    this.emit('feedHealth', this.feedHealth);
    // External layers remain independent even when the original feed is down.
    this.loadIntelligence().catch(() => {});

    // Earth-system gridded layers are independent of the event feed. If the
    // field snapshot is stale or unavailable, hazards still load normally and
    // the layer controls simply report that state.
    fetch(`${ENVIROARC_URL}?t=${Math.floor(Date.now() / 300000)}`)
      .then((r) => {
        if (!r.ok) throw new Error(`enviroarc ${r.status}`);
        return r.json();
      })
      .then((body) => {
        this.enviroarc = body;
        this.enviroarcError = null;
        this.emit('enviroarc', body);
      })
      .catch((err) => {
        this.enviroarcError = err.message;
        this.emit('enviroarc', null);
      });

    // Detail is optional: if it fails, every marker still works, it just has
    // fewer charts. Never let it take the globe down with it.
    fetch(`${DETAIL_URL}?t=${Math.floor(Date.now() / 60000)}`)
      .then((r) => (r.ok ? r.json() : {}))
      .then((d) => {
        this.detail = d || {};
        this.emit('detail', this.detail);
      })
      .catch(() => {});

    return this.events;
  }

  rebuildEvents() {
    this.events = mergeIntelligence(this.baseEvents, [
      ...this.intelligence.arcus, ...this.intelligence.nemesis
    ]);
    this.emit('feed', this.events);
  }

  async loadIntelligence() {
    if (this._externalFetchInFlight) return;
    this._externalFetchInFlight = true;
    try {
      await Promise.all(['arcus','nemesis'].map(async (source) => {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 5000);
        try {
          const res = await fetch(`./data/enviroarc/${source}.json`, {
            signal: controller.signal, cache: 'no-store'
          });
          if (!res.ok) throw Error('HTTP ' + res.status);
          const doc = await res.json();
          if (!doc || !(source === 'arcus' ? Array.isArray(doc.theaters) : Array.isArray(doc.events))) throw Error('Invalid projection');
          this.intelligence[source] = source === 'arcus'
            ? arcusEvents(doc) : nemesisEvents(doc);
          this.intelligenceHealth[source] = doc.unavailable ? 'unavailable' : doc.degraded ? 'stale' : 'ok';
        } catch (_) {
          // Do not silently present an outage as a live empty layer.
          // Retain last good snapshot only when explicitly marked stale.
          this.intelligenceHealth[source] = 'unavailable';
        } finally {
          clearTimeout(timeout);
        }
      }));
      this.rebuildEvents();
      this.emit('intelligenceHealth', this.intelligenceHealth);
    } finally {
      this._externalFetchInFlight = false;
    }
  }

  /** Every category in the taxonomy, in taxonomy order — the legend lists all
   *  of them, including the ones with nothing in them right now, so the colour
   *  key stays complete and stops jumping around between refreshes. */
  categoryKeys() {
    const fromMeta = Object.keys(this.meta?.categories || {});
    return fromMeta.length ? fromMeta : Object.keys(CATEGORY_LABEL);
  }

  categoryLabel(key) {
    return this.meta?.categories?.[key]?.label || CATEGORY_LABEL[key] || key;
  }

  labelForEvent(event) {
    return event?.categoryLabel || this.categoryLabel(event?.category);
  }

  categoryGroup(key) {
    return this.meta?.categories?.[key]?.group || 'Other';
  }

  isDerived(key) {
    const c = this.meta?.categories?.[key];
    return c ? c.observed === false : false;
  }

  counts() {
    const out = {};
    for (const e of this.events) out[e.category] = (out[e.category] || 0) + 1;
    return out;
  }

  /** Counts after every filter except the category filter itself, so the rail
   *  shows what selecting a category would actually give you. */
  countsForRail() {
    const out = {};
    for (const e of this.events) {
      if (!this.matchesExceptCategory(e)) continue;
      out[e.category] = (out[e.category] || 0) + 1;
    }
    return out;
  }

  matchesExceptCategory(e) {
    const f = this.filters;
    if (f.activeOnly && e.active === false) return false;
    if (f.nzOnly && !e.nz) return false;
    if (e.severity < f.minSeverity) return false;
    if (f.query) {
      const q = f.query.toLowerCase();
      const hay = `${e.title} ${e.place || ''} ${e.country || ''} ${e.subtype || ''} ${e.source}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  }

  matches(e) {
    const f = this.filters;
    if (f.hidden.has(layerKeyForEvent(e))) return false;
    return this.matchesExceptCategory(e);
  }

  filtered() {
    return this.events.filter((e) => this.matches(e));
  }

  ranked(limit = 60) {
    return this.filtered()
      .slice()
      .sort((a, b) => b.severity - a.severity || new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0))
      .slice(0, limit);
  }

  byId(id) {
    return this.events.find((e) => e.id === id) || null;
  }

  detailFor(id) {
    return this.detail[id] || null;
  }

  setFilter(patch) {
    Object.assign(this.filters, patch);
    this.emit('filters', this.filters);
  }

  /** Namespaced keys keep ARCUS and Nemesis categories independent. */
  layerKeys() {
    return buildLayerCatalogue(this.events, this.meta?.categories || {})
      .flatMap((group) => group.layers.map((layer) => layer.key));
  }

  canonicalLayerKey(key) {
    const value = String(key);
    return value.includes(':') ? value : `earthnet:${value}`;
  }

  toggleLayer(key) {
    const id = this.canonicalLayerKey(key);
    if (this.filters.hidden.has(id)) this.filters.hidden.delete(id);
    else this.filters.hidden.add(id);
    this.emit('filters', this.filters);
  }

  /** Existing sidebar uses bare EarthNet category names. */
  toggleCategory(key) {
    this.toggleLayer(key);
  }

  soloCategory(key) {
    const selected = this.canonicalLayerKey(key);
    this.filters.hidden = new Set(this.layerKeys().filter((id) => id !== selected));
    this.emit('filters', this.filters);
  }

  /** One atomic filter update for the dropdown presets. */
  setVisibleLayerKeys(keys) {
    const included = new Set(keys);
    this.filters.hidden = new Set(this.layerKeys().filter((key) => !included.has(key)));
    this.emit('filters', this.filters);
  }

  showAllCategories() {
    this.filters.hidden.clear();
    this.emit('filters', this.filters);
  }

  hideAllCategories() {
    this.filters.hidden = new Set(this.layerKeys());
    this.emit('filters', this.filters);
  }
}
