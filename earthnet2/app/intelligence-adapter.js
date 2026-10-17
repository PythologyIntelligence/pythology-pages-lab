/**
 * Read-only external intelligence projections for the EarthNet 2.0 globe.
 * Source-of-truth services remain independent. No LLM calls, no writes.
 * ARCUS theatres are model-inferred, never labelled as observed incidents.
 * Nemesis uses a public-safe event projection only, not watchlists/cameras.
 */

function num(x) {
  return x === '' || x === null || x === undefined ? null : Number(x);
}
function coords(lat, lon) {
  const y = num(lat), x = num(lon);
  return Number.isFinite(y) && Number.isFinite(x) && y >= -90 && y <= 90 && x >= -180 && x <= 180
    ? { lat: y, lon: x } : null;
}
function safeDate(input, fallback) {
  if (input === null || input === undefined || input === '') return fallback;
  const n = typeof input === 'number' ? input : Date.parse(input);
  const ts = typeof input === 'number' ? (input < 100000000000 ? input * 1000 : input) : n;
  return Number.isFinite(ts) ? new Date(ts).toISOString() : fallback;
}
const clip = (x, max=1700) => String(x ?? '').slice(0,max);
const severity = (n, fallback = 45) => n === null || n === undefined || n === ''
  ? fallback : Math.max(0, Math.min(100, Number(n) || 0));
function cleanId(x) { return clip(x,200).replace(/[^a-z0-9_:.\-/]/gi, '_'); }

export function arcusEvents(doc) {
  const theatres = Array.isArray(doc?.theaters) ? doc.theaters : [];
  const when = safeDate(doc?.generatedAt, null);
  // Only render actual, explicitly geolocated ARCUS assessment theatres.
  return theatres.slice(0,100).flatMap((t) => {
    const loc = coords(t.lat,t.lon);
    if (!loc || !t.id || !t.name) return [];
    return [{
      ...loc, id: 'arcus:' + cleanId(t.id), sourceSystem:'arcus',
      category: cleanId(t.category || 'geopolitical_theatre').toLowerCase(),
      categoryLabel: clip(t.category || 'Conflict theatre',90),
      title: clip(t.name,180), summary: clip(t.summary || t.status),
      source: 'ARCUS · model-inferred synthesis',
      sourceUrl: null, // Links to individual sources must be validated upstream.
      place: clip(t.country || t.region || '',120), country: clip(t.country || '',100),
      subtype: clip(t.tier || t.trend || '',100),
      severity:severity(t.severity,50), confidence:t.confidence,
      derived:true, evidenceClass:'inferred',
      active:true, firstSeen:when, lastSeen:when, updatedAt:when,
      sourceHealth: doc.degraded ? 'degraded' : 'available',
      method:'ARCUS geolocated analytic theatre; inference, not a directly observed ground incident.'
    }];
  });
}

export function nemesisEvents(doc) {
  const events = Array.isArray(doc?.events) ? doc.events : [];
  return events.slice(0,2500).flatMap((e) => {
    const loc = coords(e.lat,e.lon);
    const cat = cleanId(e.c ?? e.category ?? 'other').toLowerCase();
    // Deliberate privacy boundary: no watchlist/identity/camera or actors.
    if (!loc || !e.id || !e.title) return [];
    const raw = num(e.s ?? e.severity);
    // Nemesis severity is on a 1-10 scale, EarthNet uses 0-100.
    const sev = raw === null ? 40 : Math.round(Math.max(0,Math.min(10,raw)) * 10);
    const precision = num(e.gp ?? e.geo_precision);
    // Drop unknown and country-only coordinates that would misleadingly look exact.
    if (precision === null || precision < 2) return [];
    const time = safeDate(e.t ?? e.occurred_at, null);
    return [{
      ...loc,id:'nemesis:' + cleanId(e.id),sourceSystem:'nemesis',
      category:cat,categoryLabel:cat.replaceAll('_',' '),
      title:clip(e.title,200),summary:clip(e.summary || ''),
      source:clip(e.src || 'Nemesis · reported incident',100),
      sourceUrl:/^https:\/\//i.test(String(e.url||'')) ? String(e.url).slice(0,500) : null,
      place:clip(e.place || '',140),country:clip(e.country_name || '',100),
      subtype:cat,severity:sev, confidence:e.conf,
      evidenceClass:'reported',geoPrecision:precision,derived:false,
      active:true,firstSeen:time,lastSeen:time,updatedAt:time,
      method:'Nemesis reported incident; location is approximate and evidence may be unverified.'
    }];
  });
}

export function mergeIntelligence(base, external) {
  const out = new Map();
  for (const ev of [...base,...external]) if(ev?.id) out.set(String(ev.id),ev);
  return [...out.values()];
}
