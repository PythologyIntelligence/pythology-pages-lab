/* Read-only public research cards. The site does not run the collectors. */
(() => {
  'use strict';
  const cards = Array.from(document.querySelectorAll('[data-py-lab]'));
  if (!cards.length) return;
  const NZ = new Intl.DateTimeFormat('en-NZ', { timeZone: 'Pacific/Auckland', dateStyle: 'medium', timeStyle: 'short' });
  const fmt = raw => { const t = Date.parse(raw || ''); return Number.isFinite(t) ? NZ.format(t) + ' NZ' : 'Timestamp unavailable'; };
  const number = value => value !== null && value !== undefined && Number.isFinite(Number(value)) ? Number(value).toLocaleString('en-NZ') : '—';
  function show(card, key, value) { const n=card.querySelector('[data-py-' + key + ']'); if(n) n.textContent=value; }
  function state(card, label, status) { const n=card.querySelector('[data-py-state]'); if(n){n.textContent=label;n.dataset.state=status;} }
  function renderWeather(data) {
    if (!data || data.schema !== 'pythology.weather-public-screening.v1') throw Error('Unverified weather projection');
    const ageH=(Date.now()-Date.parse(data.generated_at||''))/36e5;
    const current=Number.isFinite(ageH) && ageH>=-0.1 && ageH<=6;
    cards.filter(c=>c.dataset.pyLab==='weather').forEach(card=>{
      state(card, current?'RECENT RESEARCH SNAPSHOT':'LAST PUBLISHED · NOT CURRENT', current?'current':'stale');
      show(card,'count-1',number(data.global?.source_event_rows));
      show(card,'count-2',number(data.global?.matched_rows));
      show(card,'count-3',number(data.global?.unique_signals));
      show(card,'nz',number(data.new_zealand?.exploratory_context_count));
      show(card,'time',fmt(data.generated_at));
      show(card,'detail',`Global: ${data.global?.status || 'unknown'}. NZ: ${data.new_zealand?.status || 'unknown'}. Records shown are screening candidates, not validated event forecasts.`);
    });
  }
  function renderGeology(data) {
    if (!data || data.research_only !== true) throw Error('Unverified geological research');
    const ageM=(Date.now()-Date.parse(data.observed_utc||''))/60000;
    const current=data.status==='ok' && data.source_health?.USGS==='OK' && data.source_health?.GVP==='OK' && Number.isFinite(ageM) && ageM>=-2 && ageM<=180;
    cards.filter(c=>c.dataset.pyLab==='geology').forEach(card=>{
      state(card,current?'CURRENT HOURLY SCREEN':'STALE / SOURCE UNVERIFIED',current?'current':'stale');
      show(card,'count-1',number(data.counts?.analysed_centres));
      show(card,'count-2',number(data.counts?.multi_signal_centres));
      show(card,'count-3',number(data.counts?.active_candidate_centres));
      show(card,'time',fmt(data.observed_utc));
      show(card,'detail','Patterns from an earthquake catalogue, not an earthquake or eruption prediction.');
    });
  }
  function fail(kind){cards.filter(c=>c.dataset.pyLab===kind).forEach(card=>{state(card,'PUBLIC FEED UNAVAILABLE','stale');show(card,'time','Public research data could not be verified.');show(card,'detail','The underlying researcher may still be active; no safety or inactivity conclusion follows.');});}
  async function retrieve(url, kind, fn) {
    const ctrl = new AbortController();const timer=setTimeout(()=>ctrl.abort(),12000);
    try {
      const r=await fetch(url,{cache:'no-store',credentials:'omit',signal:ctrl.signal});
      if(!r.ok)throw Error('HTTP '+r.status);
      fn(await r.json());
    }catch(_){fail(kind);}finally{clearTimeout(timer);}
  }
  function refresh(){void retrieve('data/prometheus_weather_research.json','weather',renderWeather);void retrieve('https://atlas.pythology.co.nz/public-research/precursor.json','geology',renderGeology);}
  refresh();setInterval(()=>{if(!document.hidden)refresh()},5*60*1000);
})();