/** GitHub Pages Lab edition. Relative paths support both custom domains and /pythology-pages-lab/earthnet2/. */
/**
 * EarthNet Incident 3D — terrain-level investigation, not incident command.
 * OpenGlobus API used here comes from Pythology's forked source inspection:
 *   Globe / GlobusRgbTerrain / OpenStreetMap / Vector / Entity / LonLat.
 * Runtime is pinned to an independently published OpenGlobus package, not the
 * disposable source fork. See docs/INCIDENT_3D.md before deleting that fork.
 */
// Prefer the locally vendored engine on the Windows VPS / deployed site.
// A pinned CDN fallback keeps this development branch previewable until assets
// are committed to the published static site; it never depends on our fork.
const OG_LOCAL_URL = "../vendor/openglobus/og.es.js";
const OG_FALLBACK_URL = "https://cdn.jsdelivr.net/npm/@openglobus/og@0.28.7/lib/og.es.js";
let engineSource = "local";
let Globe, Vector, Entity, GlobusRgbTerrain, OpenStreetMap, LonLat;
import {
  INCIDENT_CATEGORIES, normalizeIncident, geojsonGeometries, playback, readableTime,
  usableResearchSnapshot
} from "./incident-data.js";
import { windFootprintGeoJSON, windSpanKm } from "./storm-footprint.js";
import {usableFireFeed,firePlayback} from "./fire-evolution.js";

const $ = id => document.getElementById(id);
const FEED = "../media/feed/feed.json";
const DETAIL = "../media/feed/detail.json";
const INCIDENT_EXTENSION = "../media/feed/incident3d.json"; // optional; never fabricate unavailable inputs
const FIRE_FEED = "../media/feed/fire3d.json"; // independent source geometry; optional
const FIRE_EXERCISE = "./fixtures/fire-evolution-exercise.json"; // synthetic-only, isolated
const isFireExercise = new URLSearchParams(location.search).get("exercise") === "fire";
const COLORS = {
  observed: [1, .28, .09, .24], official: [1, .27, .08, .28],
  modelled: [.99, .68, .22, .18], derived: [.88, .69, .37, .20],
  hypothetical: [.55, .45, 1, .15], proposed: [.35, .9, .8, .2],
  screened: [.75, .8, .96, .18]
};
let world, incident = null, playable = {kind:"none", items:[]};
let events = [], details = {}, enriched = {};
let researchState = {status:"unavailable",generatedAt:null};
let syntheticMode=false, unpublishedPreviewMode=false;
let fireSnapshots={}, fireState="unavailable";
let activeIndex = 0, pollBusy = false;
const detailedTerrain = new URLSearchParams(location.search).get("quality") === "high";
const WIND_STYLE = {
  34: {fill: [.12,.76,.91,.18], line: [.33,.9,.98, .92]},
  50: {fill: [.98,.75,.23,.17], line: [1,.8,.36, .95]},
  64: {fill: [1,.35,.24,.20], line: [1,.35,.24,.95]}
};

function setStatus(message, kind) {
  $("status").textContent = message;
  $("status").dataset.kind = kind || "info";
}

function text(id, value) { $(id).textContent = String(value ?? "—"); }
function safeExternal(url) {
  try {const u = new URL(url); return ["http:", "https:"].includes(u.protocol) ? u.href : null;}
  catch {return null;}
}
function external(id, url, label) {
  const target = $(id); target.replaceChildren();
  const good = safeExternal(url);
  if (!good) { target.textContent = label || "Source link unavailable"; return; }
  const a = document.createElement("a");
  a.href = good; a.target = "_blank"; a.rel = "noopener noreferrer";
  a.textContent = label || "Original source";
  target.append(a);
}

function createWorld() {
  const locationLayer = new Vector("Incident location", {clampToGround: true, relativeToGround: true});
  const perimeterLayer = new Vector("Source geometry", {clampToGround: true, relativeToGround: true});
  const burnedLayer = new Vector("Burned ground · blue", {clampToGround:true,relativeToGround:true});
  const burningLayer = new Vector("Mapped actively burning area · red", {clampToGround:true,relativeToGround:true});
  const windExtentLayer = new Vector("Wind speed threshold footprints", {
    clampToGround: true, relativeToGround: true
  });
  const trackLayer = new Vector("Incident tracks", {clampToGround: true, relativeToGround: true});
  const annotationsLayer = new Vector("Research and planning overlays", {
    clampToGround: true, relativeToGround: true
  });
  const globe = new Globe({
    target: "terrain",
    name: "EarthNet — Incident 3D",
    terrain: new GlobusRgbTerrain(),
    layers: [new OpenStreetMap(), locationLayer, perimeterLayer, burnedLayer, burningLayer, windExtentLayer, trackLayer, annotationsLayer],
    // Terrain performance is affected by remote DEM/imagery tiles and GPU
    // load. Balanced mode reduces geometry and pixel work; DNS alone cannot
    // remove the third-party elevation tile round trip.
    maxGridSize: detailedTerrain ? 128 : 64,
    pixelRatio: detailedTerrain
      ? Math.min(window.devicePixelRatio || 1, 1.5)
      : Math.min(window.devicePixelRatio || 1, 1),
    msaa: 0,
    atmosphereEnabled: detailedTerrain,
    resourcesSrc: engineSource === "local"
      ? "../vendor/openglobus/res"
      : "https://cdn.jsdelivr.net/npm/@openglobus/og@0.28.7/lib/res",
    fontsSrc: engineSource === "local"
      ? "../vendor/openglobus/res/fonts"
      : "https://cdn.jsdelivr.net/npm/@openglobus/og@0.28.7/lib/res/fonts"
  });
  return {globe, locationLayer, perimeterLayer, burnedLayer, burningLayer, windExtentLayer, trackLayer, annotationsLayer};
}

function focusCamera(mode = "oblique") {
  if (!world || !incident) return;
  const {lon, lat} = incident;
  // The synthetic exercise sits on mountainous Central North Island terrain.
  // Looking at elevation=0 aims UNDER the ground surface there, making
  // ground overlays appear missing from an oblique perspective. Prefer an
  // above-terrain demo look-at; actual terrain height remains source-dependent.
  const lookHeight = isFireExercise ? 1750 : 0;
  // Genuine OpenGlobus perspective: camera eye != ground look-at. The
  // previous high/near-vertical camera resembled a 2D map even though the
  // WebGL terrain was elevated. These views deliberately expose relief.
  // Heights are metres ASL; keep above NZ's highest mountainous terrain.
  const stormWithRadii = incident.category === "cyclone" &&
    incident.track.some(p => p.windFields?.length);
  const cosLat = Math.max(0.35, Math.cos(lat*Math.PI/180));
  let altitude, east, south;
  if (mode === "overhead") {
    altitude = lookHeight + 95000; east = 0; south = 0;
  } else if (mode === "terrain") {
    altitude = lookHeight + 9000; east = .075; south = .07;
  } else if (stormWithRadii) {
    altitude = lookHeight + 270000; east = .85; south = .75;
  } else {
    altitude = lookHeight + 21000; east = .18; south = .16;
  }
  const eyeLon = ((lon + east/cosLat + 180) % 360 + 360) % 360 - 180;
  const eyeLat = Math.max(-89.8,Math.min(89.8,lat-south));
  // setLonLat(position, lookPosition) is a REAL 3D view transform in
  // PlanetCamera; it is not just a map zoom or CSS perspective effect.
  world.globe.planet.camera.setLonLat(
    new LonLat(eyeLon,eyeLat,altitude),
    new LonLat(lon,lat,lookHeight)
  );
  $("camera-hint").textContent = mode === "overhead"
    ? "Overhead reference · choose 3D oblique or Terrain approach to see elevation"
    : mode === "terrain"
      ? "Low-angle 3D terrain perspective · drag to orbit/pan · scroll to zoom"
      : "3D oblique perspective · real elevation mesh · drag to move · scroll to zoom";
}
function featuresFor(geometries, evidenceClass, prefix, opacityScale = 1) {
  const color = COLORS[evidenceClass] || COLORS.derived;
  return (geometries || []).map((geom, index) => new Entity({
    name: prefix + " " + (index + 1),
    geometry: {
      type: geom.type,
      coordinates: geom.coordinates,
      style: {
        fillColor: [color[0],color[1],color[2],color[3] * opacityScale],
        lineColor: [color[0], color[1], color[2], 1],
        lineWidth: geom.type === "LINESTRING" ? 4 : 3
      }
    }
  }));
}
function drawOn(layer, geometries, evidence, label, scale = 1) {
  featuresFor(geometries, evidence, label, scale).forEach(e => layer.add(e));
}

function lineForTrack(points) {
  return geojsonGeometries({
    type: "LineString",
    coordinates: points.map(p => [p.lon, p.lat, 0])
  });
}

function drawTrack(points) {
  const geometry = lineForTrack(points);
  // The track is a centreline, not an impact zone. Match the blue legend
  // rather than reusing the orange polygon evidence colour.
  for (const g of geometry) {
    world.trackLayer.add(new Entity({
      name: "Source-recorded storm centre track",
      geometry: {type: g.type, coordinates: g.coordinates,
        style: {fillColor: [.15,.45,.75,.03],
          lineColor: [.36,.8,1,1], lineWidth: 3.5}}
    }));
  }
}

function drawLocationAt(lon, lat, label = "REPORTED EVENT CENTRE") {
  world.locationLayer.clear();
  world.locationLayer.add(new Entity({
    name: label,
    lonlat: new LonLat(lon, lat, 50),
    label: {text: "● " + label, face: "Arial", size: 13,
      color: "#ffbd83", outline: 2, outlineColor: "#07131f", align: "center"}
  }));
}

function drawWindFix(fix) {
  world.windExtentLayer.clear();
  const fields = fix?.windFields || [];
  const note = $("wind-extent-note");
  const label = $("wind-summary");
  if (!fields.length || incident.category !== "cyclone") {
    note.textContent = incident.category === "cyclone"
      ? "No threshold-wind radii for this recorded position. A centre track is not a wind or impact boundary."
      : "Wind threshold footprints are applicable only where storm radii are supplied.";
    label.textContent = "No sourced wind extents available.";
    return;
  }
  const descriptions = [];
  for (const field of fields) {
    const polygon = windFootprintGeoJSON(fix.lon, fix.lat, field);
    if (!polygon) continue;
    const style = WIND_STYLE[field.thresholdKt];
    if (!style) continue;
    for (const g of geojsonGeometries(polygon)) {
      world.windExtentLayer.add(new Entity({
        name: field.thresholdKt + " kt wind footprint",
        geometry: {type: g.type, coordinates: g.coordinates,
          style: {fillColor: style.fill, lineColor: style.line, lineWidth: 2}}
      }));
    }
    descriptions.push(field.thresholdKt + " kt ≈ " + windSpanKm(field) + " km");
  }
  const first = fields[0];
  label.textContent = descriptions.length
    ? descriptions.join(" · ") + " schematic maximum spans"
    : "Wind radii available, but footprint cannot be drawn safely at the date line.";
  note.textContent = first.evidenceClass.toUpperCase() + " WIND-RADIUS FOOTPRINT · " +
    first.source + " · " + readableTime(first.validTime) +
    " · Approximate wind-speed coverage, NOT storm cloud, rain, surge or damage area.";
}

function firePolygon(layer, item, kind) {
  if (!item?.geometries?.length) return;
  // Burned ground: cool, distinct blue; mapped active burning: soft red
  // fill with a THIN red edge. No fabricated fire front from an incident
  // perimeter or acreage. Burned and active polygons must be independently
  // provided by a qualified source.
  const red=kind==="active";
  const fill=red ? [1.0,.24,.28,.48] : [.14,.47,.98,.54];
  const line=red ? [1.0,.13,.16,1] : [.15,.62,1,.98];
  for (const [index,g] of item.geometries.entries()) {
    layer.add(new Entity({
      name:(red?"Mapped active burning":"Mapped burned ground")+" "+(index+1),
      geometry:{type:g.type,coordinates:g.coordinates,style:{
        fillColor:fill,lineColor:line,lineWidth:red?1.5:1.3
      }}
    }));
  }
}
function renderFireFrame(frame) {
  world.burnedLayer.clear();
  world.burningLayer.clear();
  firePolygon(world.burnedLayer,frame?.burnedArea,"burned");
  firePolygon(world.burningLayer,frame?.activeBurning,"active");
  const marks=[];
  if(frame?.activeBurning) {
    marks.push("RED: mapped actively burning · "+frame.activeBurning.evidenceClass.toUpperCase()+
      " · "+frame.activeBurning.source+" · "+readableTime(frame.activeBurning.validTime));
  }
  if(frame?.burnedArea) {
    marks.push("BLUE: mapped burned ground · "+frame.burnedArea.evidenceClass.toUpperCase()+
      " · "+frame.burnedArea.source+" · "+readableTime(frame.burnedArea.validTime));
  }
  text("fire-frame-provenance", marks.join(" | ") ||
    "No active-burning or burned-area source polygons available.");
  const redCount=frame?.activeBurning?.geometries?.length || 0;
  const blueCount=frame?.burnedArea?.geometries?.length || 0;
  text("fire-map-status", syntheticMode
    ? "GRAPHICS EXERCISE · " + redCount + " red actively burning polygon(s), " +
      blueCount + " blue burned-ground polygon(s) · NOT REAL"
    : "MAPPED SOURCE SNAPSHOT · " + redCount + " active · " + blueCount + " burned polygons");
  text("fire-availability", frame
    ? (syntheticMode ? "SYNTHETIC DEMO · " : "SOURCE SNAPSHOT · ") +
      redCount+" red active polygon(s) · "+blueCount+" blue burned-area polygon(s). " +
      "If red/blue shapes are not visible, try Overhead and check the browser console."
    : "No verified active-burning or burned-ground geometry received. An incident outline cannot substitute.");
  if (frame) {
    console.info("[EarthNet 3D] Fire evolution layers staged", {
      eventId:incident.id,time:frame.validTime,
      redPolygons:redCount,bluePolygons:blueCount,synthetic:syntheticMode
    });
  }
}

function showFrame(index) {
  if (!incident || !world) return;
  if (playable.kind === "none") return;
  activeIndex = Math.max(0, Math.min(index, playable.items.length - 1));
  const frame = playable.items[activeIndex];
  $("time-range").value = String(activeIndex);
  text("frame-time", playable.kind === "track"
    ? readableTime(frame.ts) : readableTime(frame.validTime));
  world.perimeterLayer.clear();
  world.trackLayer.clear();
  world.windExtentLayer.clear();
  world.burnedLayer.clear();
  world.burningLayer.clear();
  if (playable.kind === "fire") {
    renderFireFrame(frame);
    text("geometry-note","FIRE EVOLUTION · source snapshots · "+
      readableTime(frame.validTime)+" · "+(syntheticMode?"SYNTHETIC exercise":"Source verified classification required"));
    drawWindFix(null);
  } else if (playable.kind === "frames") {
    drawOn(world.perimeterLayer, frame.geometries, frame.evidenceClass, "Timestamped area");
    text("geometry-note", frame.evidenceClass.toUpperCase() + " FRAME · " + frame.source +
      " · " + readableTime(frame.validTime));
    if (incident.track.length >= 2) {
      const upToFrame = incident.track.filter(p => !p.ts || Date.parse(p.ts) <= Date.parse(frame.validTime));
      drawTrack(upToFrame);
      drawWindFix(upToFrame.at(-1));
    } else drawWindFix(null);
  } else if (playable.kind === "track") {
    drawOn(world.perimeterLayer, incident.geometry, "observed", "Source event geometry");
    drawTrack(incident.track.slice(0,activeIndex+1));
    drawLocationAt(frame.lon, frame.lat, "TRACK FIX");
    drawWindFix(frame);
    // Reset frame provenance on every selection (not inherited from previously
    // selected wildfires) and distinguish source metadata from measured area.
    text("geometry-note", "RECORDED TRACK FIX · " + readableTime(frame.ts) +
      " · Wind extents are shown separately when source radii exist.");
  }
  toggleLayers();
}

function toggleLayers() {
  if (!world) return;
  world.perimeterLayer.setVisibility($("toggle-area").checked);
  world.burnedLayer.setVisibility($("toggle-burned").checked);
  world.burningLayer.setVisibility($("toggle-burning").checked);
  world.windExtentLayer.setVisibility($("toggle-wind").checked);
  world.trackLayer.setVisibility($("toggle-track").checked);
  world.annotationsLayer.setVisibility($("toggle-research").checked);
}

function paintScene() {
  world.locationLayer.clear();
  world.perimeterLayer.clear();
  world.burnedLayer.clear();
  world.burningLayer.clear();
  world.windExtentLayer.clear();
  world.trackLayer.clear();
  world.annotationsLayer.clear();
  // A source location is an index point, NOT an impact boundary.
  drawLocationAt(incident.lon, incident.lat);

  incident.overlays.forEach(o => {
    drawOn(world.annotationsLayer, o.geometries, o.evidenceClass, o.label);
  });

  const fire = fireSnapshots[incident.id] || null;
  playable = firePlayback(incident,fire) || playback(incident);
  $("fire-panel").hidden = incident.category !== "wildfire";
  $("fire-map-status").hidden = incident.category !== "wildfire";
  if(incident.category === "wildfire") {
    text("fire-map-status", fire?.frames?.length
      ? "Fire geometry snapshots supplied · "+fire.frames.length+" recorded frames"
      : "No verified active-burning / burned-ground polygons supplied for this real wildfire");
    text("fire-availability", fire?.frames?.length
      ? fire.frames.length+" sourced fire-evolution snapshots available."
      : "No verified active-burning or burned-ground geometry available. A general incident perimeter is not the fire front.");
    text("fire-frame-provenance", fire?.frames?.length
      ? "Select a timestamp to inspect separately sourced burning/burned polygons."
      : "Fire evolution: "+fireState+". Burn scars, hotspots and incident boundaries are different evidence types.");
  }
  const visible = playable.items.length > 1;
  $("time-controls").hidden = !visible;
  $("time-range").max = String(Math.max(0,playable.items.length-1));
  activeIndex = Math.max(0,playable.items.length-1);

  if (visible || playable.kind === "fire") showFrame(activeIndex);
  else {
    drawOn(world.perimeterLayer, incident.geometry, "observed", "Source event geometry");
    if (incident.track.length >= 2) {
      drawTrack(incident.track);
    }
    drawWindFix(incident.track.at(-1));
    text("geometry-note", incident.geometryLabel);
    text("frame-time", "No timestamped progression available");
  }
  toggleLayers();
}

function showMetrics() {
  const root = $("reported-metrics"); root.replaceChildren();
  if (!incident.metrics.length) {root.textContent = "No source metrics supplied."; return;}
  incident.metrics.forEach(m => {
    const cell = document.createElement("div"); cell.className = "metric";
    const title = document.createElement("span"); title.textContent = m.label;
    const value = document.createElement("strong"); value.textContent = m.value + (m.unit ? " " + m.unit : "");
    cell.append(title, value);root.append(cell);
  });
}

function evidenceSummary() {
  const notes = [];
  if (incident.geometry.length) notes.push("One or more source polygons supplied.");
  else notes.push("No source perimeter/area geometry supplied; location marker only.");
  if (incident.track.length) notes.push(incident.track.length + " recorded track fixes.");
  else notes.push("No time-stamped track supplied.");
  if (incident.frames.length) notes.push(incident.frames.length + " time-stamped spatial frames.");
  if (incident.overlays.length) notes.push(incident.overlays.length + " annotated research overlays.");
  const radiiCount = incident.track.filter(p => p.windFields?.length).length;
  if (radiiCount) notes.push(radiiCount + " fixes with sourced threshold wind-radius metadata.");
  text("evidence", notes.join(" "));
  text("provenance", incident.source + " · " + readableTime(incident.updatedAt));
  text("geometry-label", incident.geometryLabel);
}

function showPrometheus() {
  const box = $("prometheus");
  box.replaceChildren();
  const heading = document.createElement("strong");
  heading.textContent = incident.assessment
    ? "Source evidence screening · NOT a causal model"
    : "Prometheus research assessment unavailable";
  box.append(heading);
  const p = document.createElement("p");
  if (incident.assessment) {
    const a = incident.assessment;
    p.textContent = a.summary;
    const meta = document.createElement("small");
    meta.textContent = a.status.toUpperCase() + " · " + a.source +
      " · " + readableTime(a.generatedAt) + " · Uncertainty: " + a.uncertainty;
    box.append(p,meta);
    const linkRefs = document.createElement("p");
    linkRefs.textContent = "Evidence references: " + a.evidenceRefs.join(", ");
    box.append(linkRefs);
  } else {
    p.textContent =
      researchState.status === "stale"
        ? "Prometheus research feed is stale. No old analysis will be shown as current. " +
          "EarthNet observations remain available separately."
        : researchState.status === "invalid"
          ? "Research feed provenance or evidence integrity check failed. Assessment withheld."
          : "Prometheus has not supplied a current, evidence-linked screening for this incident. " +
            "The causal hazard models, storm impact maps and fire-spread forecasts are not yet connected.";
    box.append(p);
  }

  const root = $("overlay-list"); root.replaceChildren();
  if (!incident.overlays.length) {
    root.textContent = "No modelled, proposed or reviewed planning geometries supplied.";
    return;
  }
  incident.overlays.forEach(o => {
    const row = document.createElement("div"); row.className = "overlay-item";
    const main = document.createElement("strong"); main.textContent = o.label;
    const meta = document.createElement("small");
    meta.textContent = o.evidenceClass.toUpperCase() + " · " + o.purpose +
      " · " + o.source + (o.reviewed ? " · review flag (unverified)" : " · unreviewed");
    row.append(main, meta); root.append(row);
  });
}

function selectedIncident(id, moveCamera = true) {
  const e = events.find(it => it.id === id);
  if (!e) {setStatus("Selected event not in current feed", "warn");return;}
  try {
    incident = normalizeIncident(e, details[id] || {}, enriched[id] || {});
  } catch (err) {setStatus(err.message || "Invalid event", "error");return;}
  $("incident-select").value = id;
  text("incident-name", incident.title);
  text("incident-place", incident.place || incident.subtype || incident.category);
  text("incident-type", incident.category.replaceAll("_", " ").toUpperCase());
  text("last-update", readableTime(incident.updatedAt));
  text("incident-summary", incident.summary || "No event summary supplied.");
  external("original-source", incident.sourceUrl, incident.source + " ↗");
  evidenceSummary();
  showMetrics();
  showPrometheus();
  paintScene();
  if (moveCamera) focusCamera();
  const targetUrl = new URL(location.href);
  targetUrl.searchParams.set("id", id);
  history.replaceState(null, "", targetUrl.pathname + targetUrl.search);
  setStatus(syntheticMode
    ? "SYNTHETIC EXERCISE · no real incidents"
    : unpublishedPreviewMode
      ? "REAL EarthNet events · Prometheus local preview (" + researchState.status + ")"
      : researchState.status === "available"
        ? "EarthNet live feed + Prometheus screening · periodically refreshed"
        : "EarthNet source feed · Prometheus " + researchState.status,
    !syntheticMode && !unpublishedPreviewMode && researchState.status === "available" ? "ok" : "warn");
}

function buildChoices(preferred) {
  const menu = $("incident-select");
  menu.replaceChildren();
  // Incident selection is source-dependent; preserve zero events distinctly.
  events.sort((a,b) => Date.parse(b.updatedAt || 0) - Date.parse(a.updatedAt || 0));
  events.forEach(e => {
    const o = document.createElement("option");
    o.value = e.id;
    o.textContent = (e.category || "").replaceAll("_"," ") + " · " + e.title;
    menu.append(o);
  });
  if (!events.length) {
    text("incident-name", "No suitable events in this feed");
    setStatus("No incident data available", "warn");
    return;
  }
  const id = events.some(e => e.id === preferred) ? preferred : events[0].id;
  selectedIncident(id, preferred !== incident?.id);
}

async function fetchJSON(url, optional = false) {
  const res = await fetch(url, {cache:"no-store"});
  if (optional && res.status === 404) return {};
  if (!res.ok) throw new Error("HTTP " + res.status + " from " + url);
  return res.json();
}

async function refresh(first = false) {
  if (pollBusy) return;
  pollBusy = true;
  setStatus("Updating EarthNet sources…");
  try {
    // The fire evolution feed is independent of Prometheus's conservative
    // source-only research contract. A missing polygon feed NEVER becomes an
    // automatically invented red/blue burn zone.
    const exerciseDoc = isFireExercise
      ? await fetchJSON(FIRE_EXERCISE+"?t="+Date.now())
      : null;
    const [feed, detail, addition, fireDoc] = exerciseDoc
      ? [{meta:{demo:true,generatedAt:new Date().toISOString()},
           events:exerciseDoc.events},
         exerciseDoc.detail, {},exerciseDoc.fire]
      : await Promise.all([
          fetchJSON(FEED+"?t="+Date.now()),
          fetchJSON(DETAIL+"?t="+Date.now()),
          fetchJSON(INCIDENT_EXTENSION+"?t="+Date.now(),true).catch(() => ({})),
          fetchJSON(FIRE_FEED+"?t="+Date.now(),true).catch(() => ({}))
        ]);
    const isDemoFeed = feed?.meta?.demo === true;
    syntheticMode = isDemoFeed;
    unpublishedPreviewMode = !isDemoFeed && feed?.meta?.localResearchPreview === true;
    $("demo-banner").hidden = !isDemoFeed && !unpublishedPreviewMode;
    $("demo-banner").textContent = isFireExercise
      ? "SYNTHETIC FIRE EVOLUTION EXERCISE — NOT A REAL FIRE OR FORECAST"
      : isDemoFeed
        ? "SYNTHETIC EXERCISE — NOT REAL INCIDENT DATA · LOCAL DEVELOPMENT PREVIEW"
        : "REAL EARTHNET EVENTS · UNPUBLISHED LOCAL PROMETHEUS RESEARCH PREVIEW";
    events = (feed.events || []).filter(e =>
      INCIDENT_CATEGORIES.has(e.category) && Number.isFinite(Number(e.lon)) &&
      Number.isFinite(Number(e.lat)));
    details = detail || {};
    const fireEnvelope=fireDoc?.schemaVersion === 1
      ? usableFireFeed(fireDoc,feed?.meta?.generatedAt,{demo:isFireExercise})
      : {status:"unavailable",incidents:{}};
    fireSnapshots=fireEnvelope.incidents;
    fireState=fireEnvelope.status;
    if (isDemoFeed) {
      // Demo intentionally includes fake annotations and may never masquerade
      // as a live source or be conflated with a Prometheus publication.
      enriched = addition?.schemaVersion === 1 && addition.incidents ? addition.incidents : {};
      researchState={status:"synthetic",generatedAt:null};
    } else {
      researchState = addition?.schemaVersion === 1
        ? usableResearchSnapshot(addition,feed?.meta?.generatedAt)
        : {incidents:{},status:"unavailable",generatedAt:null};
      enriched=researchState.incidents;
    }
    const queryId = new URLSearchParams(location.search).get("id");
    buildChoices(queryId || incident?.id);
    text("feed-time", isDemoFeed
      ? "SYNTHETIC TEST DATA" : readableTime(feed?.meta?.generatedAt || feed?.generatedAt));
  } catch(err) {
    setStatus("Data unavailable: " + (err.message || err), "error");
    if (first) {
      text("incident-name", "Could not load EarthNet event feed");
    }
  } finally {pollBusy = false;}
}

function bind() {
  $("incident-select").addEventListener("change", ev => selectedIncident(ev.target.value));
  ["toggle-area","toggle-track","toggle-wind","toggle-research","toggle-burning","toggle-burned"].forEach(id =>
    $(id).addEventListener("change",toggleLayers));
  $("time-range").addEventListener("input", e => showFrame(Number(e.target.value)));
  $("btn-overhead").addEventListener("click", () => focusCamera("overhead"));
  $("btn-focus").addEventListener("click", () => focusCamera("oblique"));
  $("btn-ground").addEventListener("click", () => focusCamera("terrain"));
  $("btn-refresh").addEventListener("click", () => refresh());
  $("btn-fire-exercise").addEventListener("click", () => {
    const url = new URL(location.href);
    url.searchParams.delete("id");
    if(isFireExercise) url.searchParams.delete("exercise");
    else url.searchParams.set("exercise","fire");
    location.assign(url.toString());
  });
  $("btn-quality").textContent = detailedTerrain ? "⚙ High detail" : "⚙ Balanced";
  $("btn-quality").title = detailedTerrain
    ? "Switch to faster balanced rendering"
    : "Switch to full terrain resolution (more GPU and tile work)";
  $("btn-quality").addEventListener("click", () => {
    const target = new URL(location.href);
    if (detailedTerrain) target.searchParams.delete("quality");
    else target.searchParams.set("quality", "high");
    location.assign(target.toString());
  });
  window.addEventListener("popstate", () => {
    const id = new URLSearchParams(location.search).get("id");
    if (id) selectedIncident(id);
  });
}

try {
  let og;
  try {
    og = await import(OG_LOCAL_URL);
  } catch (localError) {
    console.warn("[Incident3D] Local OpenGlobus unavailable; using pinned CDN fallback.", localError);
    engineSource = "cdn";
    og = await import(OG_FALLBACK_URL);
  }
  ({Globe, Vector, Entity, GlobusRgbTerrain, OpenStreetMap, LonLat} = og);
  if (![Globe, Vector, Entity, GlobusRgbTerrain, OpenStreetMap, LonLat]
    .every(value => typeof value === "function")) {
    throw new Error("OpenGlobus release lacks a required public export");
  }
  world = createWorld();
  bind();
  refresh(true);
  // EarthNet ingest is scheduled every 15 minutes; we check every 5 minutes.
  setInterval(() => {if (!document.hidden) refresh();}, 5*60*1000);
} catch (error) {
  setStatus("3D terrain could not start: " + (error.message || error), "error");
  console.error(error);
}
