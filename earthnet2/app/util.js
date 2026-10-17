import { SEVERITY_BANDS, CATEGORY_COLOR } from './config.js';

export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
export const DEG = Math.PI / 180;

export const catColor = (c) => CATEGORY_COLOR[c] || CATEGORY_COLOR.other;
/** Preserve distinct visual families on one globe; do not recolour legacy hazards. */
export function eventColor(e) {
  if (!e || !e.sourceSystem || e.sourceSystem === 'earthnet') return catColor(e?.category);
  if (e.sourceSystem === 'arcus') {
    const tier = String(e.subtype || '').toUpperCase();
    if (tier.includes('CRITICAL')) return '#d03b3b';
    if (tier.includes('SEVERE')) return '#ec835a';
    if (tier.includes('WATCH')) return '#45b997';
    return '#fab219';
  }
  if (e.sourceSystem === 'nemesis') {
    const c = e.category;
    if (['armed_conflict'].includes(c)) return '#3987e5';
    if (['homicide','assassination','mass_violence','bombing'].includes(c)) return '#d95926';
    if (['arrest','other'].includes(c)) return '#199e70';
    if (['property_crime','fraud','cybercrime','trafficking','organized_crime'].includes(c)) return '#c98500';
    if (['assault','sexual_violence','torture','kidnapping','other_violence'].includes(c)) return '#d55181';
    if (['riot','repression'].includes(c)) return '#9085e9';
  }
  return catColor(e.category);
}

export const band = (s) => SEVERITY_BANDS.find((b) => s >= b.min) || SEVERITY_BANDS.at(-1);

/**
 * Geographic coordinates to a point on the unit sphere, matching the UV layout
 * of THREE.SphereGeometry with an equirectangular texture: u runs east from the
 * antimeridian, v runs south from the north pole.
 */
export function latLonToVec3(lat, lon, radius = 1, out = { x: 0, y: 0, z: 0 }) {
  const phi = (90 - lat) * DEG;
  const theta = (lon + 180) * DEG;
  const sp = Math.sin(phi);
  out.x = -radius * sp * Math.cos(theta);
  out.y = radius * Math.cos(phi);
  out.z = radius * sp * Math.sin(theta);
  return out;
}

/** Subsolar point, accurate to a few arc-minutes — enough to draw a terminator. */
export function subsolarPoint(date = new Date()) {
  const jd = date.getTime() / 86400000 + 2440587.5;
  const n = jd - 2451545.0;
  const L = (280.46 + 0.9856474 * n) % 360;
  const g = ((357.528 + 0.9856003 * n) % 360) * DEG;
  const lambda = (L + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * DEG;
  const eps = (23.439 - 0.0000004 * n) * DEG;
  const dec = Math.asin(Math.sin(eps) * Math.sin(lambda)) / DEG;
  // Equation of time, in degrees of rotation.
  const ra = Math.atan2(Math.cos(eps) * Math.sin(lambda), Math.cos(lambda)) / DEG;
  const eot = ((L - ra + 540) % 360) - 180;
  const utcHours = date.getUTCHours() + date.getUTCMinutes() / 60 + date.getUTCSeconds() / 3600;
  const lonSun = -(15 * (utcHours - 12) + eot);
  return { lat: dec, lon: ((lonSun + 540) % 360) - 180 };
}

export function fmtAgo(iso) {
  if (!iso) return '';
  const ms = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(ms)) return '';
  const m = Math.round(ms / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h} h ago`;
  return `${Math.round(h / 24)} d ago`;
}

export function fmtCoord(lat, lon) {
  // Near-Earth objects have no ground position — printing 0.00°N 0.00°E for one
  // would put an asteroid in the Gulf of Guinea.
  if (lat == null || lon == null) return '';
  const la = `${Math.abs(lat).toFixed(2)}°${lat >= 0 ? 'N' : 'S'}`;
  const lo = `${Math.abs(lon).toFixed(2)}°${lon >= 0 ? 'E' : 'W'}`;
  return `${la} ${lo}`;
}

export const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function debounce(fn, ms) {
  let t;
  return (...a) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...a), ms);
  };
}

/** Inclusive sparkline path for an array of {ts,val} or numbers. */
export function sparkPath(values, w, h, pad = 2) {
  const nums = values.map((v) => (typeof v === 'number' ? v : v.val ?? v.value)).filter(Number.isFinite);
  if (nums.length < 2) return null;
  const min = Math.min(...nums);
  const max = Math.max(...nums);
  const span = max - min || 1;
  const step = (w - pad * 2) / (nums.length - 1);
  const pts = nums.map((v, i) => [pad + i * step, pad + (h - pad * 2) * (1 - (v - min) / span)]);
  return {
    d: pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' '),
    area: `M${pts[0][0].toFixed(1)} ${h} ` + pts.map((p) => `L${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' ') + ` L${pts.at(-1)[0].toFixed(1)} ${h} Z`,
    min,
    max,
    last: nums.at(-1),
  };
}
