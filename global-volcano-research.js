/* Public read-only Global Volcanic Research status — observational, not forecasts.
   Must never turn absence of source data into a "quiet" or "safe" volcano claim. */
(() => {
  'use strict';
  const root = document.querySelector('[data-global-volcano-research]');
  if (!root) return;

  const set = (name, value) => {
    const el = root.querySelector('[data-gv-' + name + ']');
    if (el) el.textContent = value == null ? '—' : String(value);
  };
  const validCount = (x) => Number.isSafeInteger(x) && x >= 0 ? x.toLocaleString() : '—';
  const status = root.querySelector('[data-gv-status]');
  const list = root.querySelector('[data-gv-notices]');
  const note = root.querySelector('[data-gv-note]');
  const failed = (msg) => {
    if (status) { status.textContent = 'SOURCE STATUS UNAVAILABLE'; status.dataset.state = 'stale'; }
    if (note) note.textContent = msg;
  };

  async function load() {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 10000);
    try {
      const res = await fetch('data/global_volcano_research.json', {cache: 'no-store', signal: ctl.signal});
      if (!res.ok) throw new Error('Public research snapshot not published (HTTP ' + res.status + ')');
      const json = await res.json();
      if (!json || json.schema !== 'pythology.subterranean.global-volcano-public.v0.1' ||
          json.research_only !== true) throw new Error('Public research snapshot failed schema checks');

      const at = Date.parse(json.generated_at_utc || '');
      const age = (Date.now() - at) / 3600000;
      const fresh = Number.isFinite(age) && age >= -1 && age <= 18;
      if (status) {
        status.textContent = fresh ? 'RESEARCH SOURCES RECEIVED' : 'SNAPSHOT OLD — CHECKING REQUIRED';
        status.dataset.state = fresh ? 'good' : 'stale';
      }
      set('catalogue', validCount(json.historical_volcanoes_catalogued));
      set('eruptions', validCount(json.historical_eruption_records_since_1960));
      set('usgs', validCount(json.volcanoes_matched_to_usgs_hans));
      set('nearby', validCount(json.nearby_m2_5_plus_earthquake_associations));
      set('with-nearby', validCount(json.volcanoes_with_geographic_earthquake_associations));
      set('recent-notices', validCount(json.usgs_official_recent_elevated_notices));
      set('precursors', validCount(json.volcanoes_with_validated_precursors));
      set('instrumented', validCount(json.instrumental_volcanoes_individually_verified));
      set('updated', Number.isFinite(at) ? new Date(at).toLocaleString(undefined, {dateStyle: 'medium', timeStyle: 'short'}) : 'Time unavailable');
      if (note) note.textContent = fresh
        ? 'The Smithsonian catalogue, USGS volcano notices and USGS earthquake feed were collected. Historical context and spatial associations are observations, not eruption forecasts.'
        : 'This saved observation snapshot is older than 18 hours. Figures describe the last saved scan, not current volcanic conditions.';
      if (list) {
        const examples = Array.isArray(json.usgs_elevated_notice_examples) ? json.usgs_elevated_notice_examples : [];
        list.replaceChildren();
        if (!examples.length) {
          const item = document.createElement('li');
          item.textContent = 'No recent elevated official USGS notices included in this snapshot. This does not establish worldwide calm.';
          list.append(item);
        }
        for (const rec of examples.slice(0, 5)) {
          if (!rec || typeof rec !== 'object') continue;
          const item = document.createElement('li');
          const name = String(rec.name || 'Unnamed volcanic system').slice(0, 100);
          const level = String(rec.reported_alert_level || 'unknown').slice(0, 30);
          const when = Date.parse(rec.notice_at_utc || '');
          item.textContent = name + ' · USGS ' + level + (Number.isFinite(when) ? ' · notice ' + new Date(when).toLocaleDateString() : '');
          list.append(item);
        }
      }
    } catch (e) {
      failed('We cannot verify the latest global volcanic research snapshot. Existing NZ Volcano Pulse and other research remain separate.');
    } finally {
      clearTimeout(timer);
    }
  }
  load();
  setInterval(load, 30 * 60 * 1000);
})();
