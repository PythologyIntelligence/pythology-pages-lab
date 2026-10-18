/**
 * EarthNet 3D incident contract. No guessed perimeters or unlabelled forecasts.
 *
 * An optional /media/feed/incident3d.json contains:
 * { schemaVersion: 1, incidents: { [eventId]: {
 *   frames: [{validTime, evidenceClass, source, polygons: [GeoJSON geometry]}],
 *   assessment: {status, summary, evidenceRefs: [], generatedAt, uncertainty},
 *   overlays: [{id, label, evidenceClass, purpose, validTime, source,
 *      geometry: GeoJSON geometry, reviewed: false}]
 * } } }
 *
 * Firebreaks, future spread, smoke zones, etc. may ONLY enter via explicit
 * modelled / hypothetical / proposed overlays; not from observations alone.
 */

import { normalizeWindFields } from "./storm-footprint.js";
import { THREE_D_CATEGORIES } from "../app/incident3d-link.js";

// Exactly the same terrestrial categories as the EarthNet globe's 3D link.
export const INCIDENT_CATEGORIES = THREE_D_CATEGORIES;
export const EVIDENCE = new Set([
  "observed", "official", "modelled", "derived", "hypothetical", "proposed", "screened"
]);
const MAX_FEATURES = 50;
const MAX_POINTS = 5000;

function finiteLonLat(point) {
  return Array.isArray(point) && point.length >= 2 &&
    Number.isFinite(Number(point[0])) && Math.abs(Number(point[0])) <= 180 &&
    Number.isFinite(Number(point[1])) && Math.abs(Number(point[1])) <= 90;
}

function point3(point) {
  return [Number(point[0]), Number(point[1]), Number.isFinite(Number(point[2])) ? Number(point[2]) : 0];
}

export function geojsonGeometries(input) {
  if (!input) return [];
  if (input.type === "FeatureCollection") {
    return (input.features || []).slice(0, MAX_FEATURES).flatMap(geojsonGeometries);
  }
  if (input.type === "Feature") return geojsonGeometries(input.geometry);
  if (input.type === "GeometryCollection") {
    return (input.geometries || []).slice(0, MAX_FEATURES).flatMap(geojsonGeometries);
  }
  if (input.type === "Polygon") {
    const rings = (input.coordinates || [])
      .filter(r => Array.isArray(r) && r.length >= 3 && r.length <= MAX_POINTS && r.every(finiteLonLat))
      .map(r => r.map(point3));
    return rings.length ? [{type: "POLYGON", coordinates: rings}] : [];
  }
  if (input.type === "MultiPolygon") {
    return (input.coordinates || []).slice(0, MAX_FEATURES).flatMap(rings =>
      geojsonGeometries({type: "Polygon", coordinates: rings}));
  }
  if (input.type === "LineString") {
    const coords = input.coordinates || [];
    return coords.length >= 2 && coords.length <= MAX_POINTS && coords.every(finiteLonLat)
      ? [{type: "LINESTRING", coordinates: coords.map(point3)}] : [];
  }
  if (input.type === "MultiLineString") {
    return (input.coordinates || []).slice(0, MAX_FEATURES).flatMap(coords =>
      geojsonGeometries({type: "LineString", coordinates: coords}));
  }
  return [];
}

export function sourceLabel(event, detail) {
  if (event?.category === "wildfire") {
    // EONET can provide event areas, and FIRMS hot spots are not perimeters.
    // Do not call an unverified area a confirmed operational fire perimeter.
    return detail?.polygon
      ? "SOURCE GEOMETRY · not independently verified as fire perimeter"
      : "NO MAPPED FIRE PERIMETER";
  }
  return detail?.polygon ? "SOURCE EVENT GEOMETRY" : "NO EVENT POLYGON";
}

export function trackPoints(input) {
  if (!Array.isArray(input)) return [];
  return input.slice(0, MAX_POINTS).filter(p =>
    p && finiteLonLat([p.lon, p.lat]))
    .map(p => ({
      lon: Number(p.lon), lat: Number(p.lat), ts: p.ts || null,
      value: Number.isFinite(Number(p.value)) ? Number(p.value) : null,
      unit: p.unit || null,
      windFields: normalizeWindFields(p.windFields, p.ts)
    }));
}

export function normalizeFrames(value) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 240).flatMap(frame => {
    const validTime = frame?.validTime && Date.parse(frame.validTime) ? frame.validTime : null;
    const evidenceClass = String(frame?.evidenceClass || "").toLowerCase();
    if (!validTime || !frame?.source || !EVIDENCE.has(evidenceClass)) return [];
    const geometries = (frame.polygons || []).slice(0, MAX_FEATURES).flatMap(geojsonGeometries)
      .filter(g => g.type === "POLYGON");
    return geometries.length ? [{
      validTime, evidenceClass, geometries, source: String(frame.source),
      sourceUrl: frame.sourceUrl || null
    }] : [];
  }).sort((a,b) => Date.parse(a.validTime) - Date.parse(b.validTime));
}

export function normalizeOverlays(value) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, MAX_FEATURES).flatMap(o => {
    const evidenceClass = String(o?.evidenceClass || "").toLowerCase();
    if (!EVIDENCE.has(evidenceClass) || !o?.geometry || !o?.source) return [];
    const geometries = geojsonGeometries(o.geometry);
    if (!geometries.length) return [];
    // Proposals are visual investigation aids; the browser never authorises
    // construction, evacuation, or other field action.
    return [{id: String(o.id || "overlay"), label: String(o.label || "Overlay"),
      evidenceClass, purpose: String(o.purpose || "Context"), source: String(o.source),
      validTime: o.validTime || null, reviewed: o.reviewed === true, geometries}];
  });
}

export function normalizeIncident(event, detail = {}, extra = {}) {
  if (!event || !INCIDENT_CATEGORIES.has(event.category)) throw new Error("Unsupported incident");
  const lat = Number(event.lat), lon = Number(event.lon);
  if (!Number.isFinite(lat) || Math.abs(lat) > 90 ||
      !Number.isFinite(lon) || Math.abs(lon) > 180) throw new Error("Invalid incident coordinates");
  const frames = normalizeFrames(extra.frames);
  return {
    id: String(event.id), title: String(event.title || "Unnamed event"),
    category: event.category, subtype: event.subtype || "",
    summary: event.summary || "", place: event.place || event.country || "",
    source: event.source || "Unspecified", sourceUrl: event.sourceUrl || null,
    lat, lon, updatedAt: event.updatedAt || event.lastSeen || null,
    firstSeen: event.startsAt || event.firstSeen || null,
    derived: event.derived === true,
    metrics: Array.isArray(event.metrics) ? event.metrics.slice(0,12).map(m => ({
      label: String(m.label || "Metric"), value: String(m.value ?? "—"), unit: String(m.unit || "")
    })) : [], frames,
    geometry: geojsonGeometries(detail.polygon).filter(g => g.type === "POLYGON"),
    geometryLabel: sourceLabel(event, detail),
    track: trackPoints(detail.track || event.track),
    overlays: normalizeOverlays(extra.overlays),
    assessment: normalizeAssessment(extra.assessment)
  };
}

function normalizeAssessment(a) {
  if (!a || !a.summary || !Array.isArray(a.evidenceRefs) || !a.evidenceRefs.length) return null;
  return {
    status: a.status === "validated" ? "validated" : "research / unvalidated",
    summary: String(a.summary),
    generatedAt: a.generatedAt || null,
    uncertainty: a.uncertainty ? String(a.uncertainty) : "Not specified",
    evidenceRefs: a.evidenceRefs.slice(0, 20).map(String),
    source: String(a.source || "Unspecified analytical system")
  };
}

export function readableTime(value) {
  const d = new Date(value);
  return Number.isFinite(d.getTime()) ? d.toLocaleString("en-NZ", {
    day:"numeric", month:"short", year:"numeric", hour:"2-digit", minute:"2-digit",
    timeZone:"UTC", timeZoneName:"short"
  }) : "Unknown";
}

/** Prefer actual snapshots over invented interpolated fire-spread frames. */
export function playback(incident) {
  if (incident.frames.length) return {kind:"frames", items:incident.frames};
  if (incident.track.length >= 2) return {kind:"track", items:incident.track};
  return {kind:"none", items:[]};
}

/**
 * Reject broken/stale or misleading live research documents BEFORE presenting
 * analytical text. CDN failures do not turn into fake "latest" intelligence.
 * An unrecognised producer never gets attributed to Prometheus.
 */
export function usableResearchSnapshot(snapshot, feedGeneratedAt, nowMs = Date.now()) {
  if (snapshot?.schemaVersion !== 1 || !snapshot?.meta ||
      snapshot.meta.producer !== 'Prometheus Subterranean / EnviroArc research bridge' ||
      snapshot.meta.containsForecasts !== false ||
      snapshot.meta.containsApprovedInterventions !== false ||
      snapshot.meta.realTime !== false ||
      snapshot.meta.methodology !== 'deterministic source-record screening; unvalidated; no hazard predictions' ||
      !snapshot.incidents || typeof snapshot.incidents !== 'object' || Array.isArray(snapshot.incidents))
    return {incidents:{},status:'invalid',generatedAt:null};
  const created = Date.parse(snapshot.meta.generatedAt);
  const source = Date.parse(snapshot.meta.sourceGeneratedAt);
  const feed = Date.parse(feedGeneratedAt);
  if (![created,source,feed,nowMs].every(Number.isFinite) ||
      created > nowMs + 10 * 60_000 ||
      source > created + 10 * 60_000 ||
      nowMs - created > 3 * 60 * 60_000 ||
      created - source > 3 * 60 * 60_000 ||
      source > feed + 10 * 60_000 ||
      feed - source > 3 * 60 * 60_000) {
    return {incidents:{},status:'stale',generatedAt:snapshot.meta.generatedAt || null};
  }
  const out={};
  for (const [id, payload] of Object.entries(snapshot.incidents).slice(0, 800)) {
    if (!payload || typeof payload !== 'object') continue;
    const a=payload.assessment;
    // First operational bridge is SCREENING ONLY: do not allow this feed to
    // smuggle forecasts, interventions or spurious "validated" conclusions.
    if (Array.isArray(payload.frames) && payload.frames.length) continue;
    if (Array.isArray(payload.overlays) && payload.overlays.length) continue;
    if (!a || a.status !== 'research' ||
        a.source !== 'Prometheus EnviroArc evidence screen v1 (deterministic, not a causal model)' ||
        !Array.isArray(a.evidenceRefs) ||
        !a.evidenceRefs.includes('earthnet-event:' + id)) continue;
    out[id]={assessment:a,frames:[],overlays:[]};
  }
  return {incidents:out,status:'available',generatedAt:snapshot.meta.generatedAt};
}
