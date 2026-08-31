import fs from "node:fs";
import path from "node:path";

const FILE = path.resolve("data/system-health.json");
const PAGES = "https://pythologyintelligence.github.io/pythology-pages-lab";
const CERBERUS = "https://cerberus.pythology.co.nz";
const VERRY = "https://verry.pythology.co.nz";
const TIMEOUT_MS = 12_000;
const EARTHNET_STALE_MS = 8 * 60 * 60 * 1000;

function readJson(file) {
  try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch { return null; }
}
function nowIso() { return new Date().toISOString(); }
async function probe(id, label, url, json = false) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  const start = performance.now();
  try {
    const r = await fetch(url, { signal: ctl.signal, cache: "no-store", headers: { "User-Agent": "Pythology-System-Monitor/1.1" } });
    const latencyMs = Math.round(performance.now() - start);
    if (!r.ok) return { id, label, status: "down", latencyMs, httpStatus: r.status, checkedAt: nowIso() };
    if (json) await r.json();
    return { id, label, status: "operational", latencyMs, httpStatus: r.status, checkedAt: nowIso() };
  } catch (e) {
    return { id, label, status: "degraded", checkedAt: nowIso(), note: e?.name === "AbortError" ? "Probe timed out." : String(e).slice(0, 120) };
  } finally { clearTimeout(timer); }
}
function systemStatus(checks) {
  const ok = checks.filter(c => c.status === "operational").length;
  const down = checks.filter(c => c.status === "down").length;
  return ok === checks.length ? "operational" : down === checks.length ? "down" : "degraded";
}
function average(checks) {
  const xs = checks.map(c => c.latencyMs).filter(Number.isFinite);
  return xs.length ? Math.round(xs.reduce((a,b) => a+b, 0) / xs.length) : null;
}
function replace(health, id, patch) {
  const i = health.systems.findIndex(s => s.id === id);
  if (i >= 0) health.systems[i] = { ...health.systems[i], ...patch };
}
function parseTs(p) {
  const raw = p?.live_data_plane?.published_at || p?.cycle_completed_at || p?.generated;
  const ms = Date.parse(raw || "");
  return Number.isFinite(ms) ? ms : null;
}
function recount(health) {
  const c = { operational: 0, degraded: 0, down: 0, unmonitored: 0, initialising: 0 };
  for (const s of health.systems) if (Object.hasOwn(c, s.status)) c[s.status] += 1;
  health.fleet = { status: c.down ? "down" : c.degraded ? "degraded" : c.operational ? "operational" : "initialising", ...c };
}

const health = readJson(FILE);
if (!health || !Array.isArray(health.systems)) process.exit(0);

const [
  agriApp,
  agriData,
  poseidon,
  sentinelApp,
  sentinelRuntime,
  cerberusApp,
  cerberusHealth,
  cerberusSnapshot,
  verryApp,
  verryHealth,
] = await Promise.all([
  probe("agri-app", "Agri Pages interface", `${PAGES}/agri-portal.html`),
  probe("agri-data", "Agri safe Pages data", `${PAGES}/data/agri_lab.json`, true),
  probe("poseidon-app", "Poseidon Pages marine map", `${PAGES}/marine-map.html`),
  probe("sentinel-app", "Sentinel Pages command interface", `${PAGES}/sentinel-command.html`),
  probe("sentinel-runtime", "Sentinel Pages runtime", `${PAGES}/sentinel-command.js`),
  probe("cerberus-app", "Cerberus VPS interface", `${CERBERUS}/`),
  probe("cerberus-health", "Cerberus VPS health", `${CERBERUS}/api/health`, true),
  probe("cerberus-snapshot", "Cerberus live snapshot", `${CERBERUS}/data/cerberus_latest.json`, true),
  probe("ve-app", "Verry Elleegant VPS interface", `${VERRY}/`),
  probe("ve-health", "Verry Elleegant VPS health", `${VERRY}/api/health`, true),
]);

for (const [id, name, checks, okSummary, badSummary] of [
  ["agri", "Agri", [agriApp, agriData], "GitHub Pages interface and safe agricultural telemetry are responding.", "Agri's Pages copy is only partially reachable."],
  ["poseidon", "Poseidon", [poseidon], "GitHub Pages marine operational surface is responding.", "Poseidon's Pages copy is not fully reachable."],
  ["sentinel", "Sentinel", [sentinelApp, sentinelRuntime], "GitHub Pages command interface and browser runtime are responding.", "Sentinel's Pages copy is only partially reachable."],
]) {
  const status = systemStatus(checks);
  replace(health, id, { name, status, summary: status === "operational" ? okSummary : badSummary, checkedAt: nowIso(), averageLatencyMs: average(checks), checks });
}

// Cerberus now lives on the VPS. Judge core service health from the service itself,
// not from the retired Pages path or third-party providers that may block GitHub runners.
const cerberusChecks = [cerberusApp, cerberusHealth, cerberusSnapshot];
const cerberusStatus = systemStatus(cerberusChecks);
replace(health, "cerberus", {
  name: "Cerberus",
  status: cerberusStatus,
  summary: cerberusStatus === "operational"
    ? "VPS interface, health endpoint and live Cerberus snapshot are responding."
    : cerberusStatus === "down"
      ? "Cerberus VPS could not be reached by the synthetic monitor."
      : "Cerberus VPS is reachable, but one live service surface needs attention.",
  checkedAt: nowIso(),
  averageLatencyMs: average(cerberusChecks),
  providersOperational: null,
  providersAvailable: null,
  providersTotal: null,
  snapshotAgeMinutes: null,
  snapshotUpdatedAt: null,
  instrumentCount: null,
  checks: cerberusChecks,
});

// Verry Elleegant moved from Vercel to the VPS/Caddy route.
const verryChecks = [verryApp, verryHealth];
const verryStatus = systemStatus(verryChecks);
replace(health, "verry-elleegant", {
  name: "Verry Elleegant",
  status: verryStatus,
  summary: verryStatus === "operational"
    ? "VPS race-intelligence interface and health endpoint are responding."
    : verryStatus === "down"
      ? "Verry Elleegant's VPS interface could not be reached by the synthetic monitor."
      : "Verry Elleegant's VPS interface or health endpoint needs attention.",
  checkedAt: nowIso(),
  averageLatencyMs: average(verryChecks),
  checks: verryChecks,
});

// Prefer the safe EarthNet status relayed into this repository over the old-host
// transport embedded in the synthetic checker. This file contains operational
// counts/freshness only; no credentials or private client data.
const earth = readJson(path.resolve("data/earthnet_status.json"));
if (earth) {
  const ts = parseTs(earth);
  const ageMs = ts == null ? Infinity : Math.max(0, Date.now() - ts);
  const failures = Object.keys(earth?.failed_engines || {}).length;
  const published = earth?.live_data_plane?.published !== false;
  const payloadHealthy = earth?.success === true && earth?.degraded !== true && failures === 0 && published;
  const fresh = ageMs <= EARTHNET_STALE_MS;
  const status = payloadHealthy && fresh ? "operational" : "degraded";
  replace(health, "earthnet", {
    status,
    summary: status === "operational"
      ? `${Number(earth.engine_count || 0)} engines completed the latest EarthNet cycle with ${Number(earth.event_count || 0)} events and no engine failures.`
      : "EarthNet's latest relayed cycle is stale or reporting a degraded assertion.",
    checkedAt: nowIso(),
    snapshotAgeMinutes: Number.isFinite(ageMs) ? Math.round(ageMs / 60000) : null,
    snapshotUpdatedAt: ts == null ? null : new Date(ts).toISOString(),
    engineCount: Number(earth.engine_count || 0),
    eventCount: Number(earth.event_count || 0),
    failedEngineCount: failures,
  });
}

recount(health);
health.schemaVersion = Math.max(Number(health.schemaVersion || 0), 4);
fs.writeFileSync(FILE, `${JSON.stringify(health, null, 2)}\n`, "utf8");
console.log(`Repaired Fleet health: Cerberus=${cerberusStatus}, Verry=${verryStatus}, Agri=${systemStatus([agriApp, agriData])}, Poseidon=${systemStatus([poseidon])}, Sentinel=${systemStatus([sentinelApp, sentinelRuntime])}`);
