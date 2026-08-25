import fs from "node:fs";
import path from "node:path";

const OUTPUT = path.resolve("data/system-health.json");
const TIMEOUT_MS = 12_000;
const CERBERUS_STALE_MS = 18 * 60 * 60 * 1000;
const EARTHNET_STALE_MS = 8 * 60 * 60 * 1000;
const PAGES_BASE = "https://pythologyintelligence.github.io/pythology-pages-lab";

function nowIso() { return new Date().toISOString(); }
function safeMessage(error) {
  const message = error instanceof Error ? error.message : String(error || "Unknown error");
  return message.replace(/https?:\/\/[^\s]+/g, "remote endpoint").slice(0, 140);
}

async function timedFetch(url, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  const started = performance.now();
  try {
    const response = await fetch(url, { ...options, signal: controller.signal, redirect: "follow", cache: "no-store" });
    return { response, latencyMs: Math.round(performance.now() - started) };
  } finally { clearTimeout(timer); }
}

async function probePage(id, label, url) {
  try {
    const { response, latencyMs } = await timedFetch(url, { headers: { "User-Agent": "Pythology-System-Monitor/1.0" } });
    return {
      id, label, status: response.ok ? "operational" : "down", latencyMs,
      httpStatus: response.status, checkedAt: nowIso(),
      note: response.ok ? undefined : "The synthetic reachability check returned an HTTP error.",
    };
  } catch (error) {
    return {
      id, label, status: "degraded", checkedAt: nowIso(),
      note: error?.name === "AbortError" ? "Synthetic runner timed out after 12 seconds." : safeMessage(error),
    };
  }
}

async function probeJson(id, label, url, validator = () => true) {
  try {
    const { response, latencyMs } = await timedFetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 Pythology-System-Monitor/1.0", Accept: "application/json" },
    });
    if (!response.ok) {
      const runnerRestricted = response.status === 451 || response.status === 403;
      return {
        id, label, status: runnerRestricted ? "degraded" : "down", latencyMs,
        httpStatus: response.status, checkedAt: nowIso(),
        note: runnerRestricted ? "Synthetic runner is restricted by this provider." : "Endpoint returned an HTTP error.",
      };
    }
    const payload = await response.json();
    const valid = Boolean(validator(payload));
    return {
      id, label, status: valid ? "operational" : "degraded", latencyMs,
      httpStatus: response.status, checkedAt: nowIso(),
      note: valid ? undefined : "Endpoint responded but its health payload was not nominal.",
    };
  } catch (error) {
    return { id, label, status: "down", checkedAt: nowIso(), note: safeMessage(error) };
  }
}

function parseTimestamp(raw) {
  if (!raw || typeof raw !== "string") return null;
  const normalized = raw.includes("T") ? raw : raw.replace(" ", "T");
  const parsed = Date.parse(normalized.endsWith("Z") || /[+-]\d\d:\d\d$/.test(normalized) ? normalized : `${normalized}Z`);
  return Number.isFinite(parsed) ? parsed : null;
}

async function probeCerberusSnapshot() {
  const url = "https://pythology.co.nz/data/cerberus_latest.json";
  try {
    const { response, latencyMs } = await timedFetch(url, { headers: { "User-Agent": "Pythology-System-Monitor/1.0", Accept: "application/json" } });
    if (!response.ok) return { id: "snapshot", label: "Forecast snapshot", status: "down", latencyMs, httpStatus: response.status, checkedAt: nowIso() };
    const payload = await response.json();
    const timestamp = parseTimestamp(payload?.generated_at_utc || payload?.generated_at || payload?.last_updated);
    const ageMs = timestamp === null ? null : Math.max(0, Date.now() - timestamp);
    const stale = ageMs === null || ageMs > CERBERUS_STALE_MS;
    return {
      id: "snapshot", label: "Forecast snapshot", status: stale ? "degraded" : "operational", latencyMs,
      httpStatus: response.status, checkedAt: nowIso(),
      dataUpdatedAt: timestamp === null ? null : new Date(timestamp).toISOString(),
      ageMinutes: ageMs === null ? null : Math.round(ageMs / 60_000),
      instrumentCount: Array.isArray(payload?.instruments) ? payload.instruments.length : 0,
      freshnessLimitMinutes: Math.round(CERBERUS_STALE_MS / 60_000),
      note: stale ? "Snapshot is outside the Cerberus freshness guard." : undefined,
    };
  } catch (error) {
    return { id: "snapshot", label: "Forecast snapshot", status: "down", checkedAt: nowIso(), note: safeMessage(error) };
  }
}

async function probeEarthNetSnapshot() {
  const url = `${PAGES_BASE}/data/earthnet_status.json`;
  try {
    const { response, latencyMs } = await timedFetch(url, { headers: { "User-Agent": "Pythology-System-Monitor/1.0", Accept: "application/json" } });
    if (!response.ok) return { id: "earthnet-snapshot", label: "EarthNet intelligence cycle", status: "down", latencyMs, httpStatus: response.status, checkedAt: nowIso() };
    const payload = await response.json();
    const timestamp = parseTimestamp(payload?.live_data_plane?.published_at || payload?.cycle_completed_at || payload?.generated);
    const ageMs = timestamp === null ? null : Math.max(0, Date.now() - timestamp);
    const failedEngines = Object.keys(payload?.failed_engines || {});
    const published = payload?.live_data_plane?.published !== false;
    const healthyPayload = payload?.success === true && payload?.degraded !== true && failedEngines.length === 0 && published;
    const stale = ageMs === null || ageMs > EARTHNET_STALE_MS;
    return {
      id: "earthnet-snapshot", label: "EarthNet intelligence cycle", status: healthyPayload && !stale ? "operational" : "degraded",
      latencyMs, httpStatus: response.status, checkedAt: nowIso(),
      dataUpdatedAt: timestamp === null ? null : new Date(timestamp).toISOString(),
      ageMinutes: ageMs === null ? null : Math.round(ageMs / 60_000),
      freshnessLimitMinutes: Math.round(EARTHNET_STALE_MS / 60_000),
      engineCount: Number(payload?.engine_count) || 0, eventCount: Number(payload?.event_count) || 0,
      failedEngineCount: failedEngines.length, published,
      note: !healthyPayload ? "EarthNet reported a degraded cycle, failed engine, or unpublished snapshot." : stale ? "EarthNet snapshot is outside the scheduled-cycle freshness guard." : undefined,
    };
  } catch (error) {
    return { id: "earthnet-snapshot", label: "EarthNet intelligence cycle", status: "down", checkedAt: nowIso(), note: safeMessage(error) };
  }
}

function averageLatency(checks) {
  const values = checks.map((item) => item.latencyMs).filter(Number.isFinite);
  return values.length ? Math.round(values.reduce((a, b) => a + b, 0) / values.length) : null;
}

function simpleSystem(id, name, checks, operationalSummary, degradedSummary) {
  const operational = checks.filter((c) => c.status === "operational").length;
  const hardDown = checks.filter((c) => c.status === "down").length;
  const status = operational === checks.length ? "operational" : hardDown === checks.length ? "down" : "degraded";
  return {
    id, name, status,
    summary: status === "operational" ? operationalSummary : status === "down" ? `${name} could not be reached by the synthetic monitor.` : degradedSummary,
    checkedAt: nowIso(), averageLatencyMs: averageLatency(checks), checks,
  };
}

function fleetCounts(systems) {
  const counts = { operational: 0, degraded: 0, down: 0, unmonitored: 0, initialising: 0 };
  for (const system of systems) if (Object.hasOwn(counts, system.status)) counts[system.status] += 1;
  return counts;
}

async function main() {
  const results = await Promise.all([
    probePage("app", "Cerberus interface", "https://pythology.co.nz/cerberus-app/"),
    probeCerberusSnapshot(),
    probeJson("binance", "Binance crypto feed", "https://api.binance.com/api/v3/ticker/24hr?symbol=BTCUSDT", (p) => Number(p?.lastPrice) > 0),
    probeJson("yahoo", "Yahoo market feed", "https://query1.finance.yahoo.com/v8/finance/chart/%5EGSPC?interval=15m&range=1d", (p) => Number(p?.chart?.result?.[0]?.meta?.regularMarketPrice) > 0),
    probeJson("xaus", "XAUS metals feed", "https://xaus.com/api/v1/spot?compact=1", (p) => Number(p?.spot_usd_oz) > 0),
    probePage("earthnet-app", "EarthNet interface", `${PAGES_BASE}/earthnet-v3.html`),
    probeEarthNetSnapshot(),
    probePage("agri-app", "Agri interface", "https://pythology.co.nz/agri-portal.html"),
    probePage("agri-data", "Agri data service", "https://pythology.co.nz/api/agri-data?client=brookfield-newfield-pilot"),
    probePage("poseidon-app", "Poseidon marine map", "https://pythology.co.nz/marine-map.html"),
    probePage("ve-app", "Verry Elleegant interface", "https://verry-elleegant-ai.vercel.app/"),
    probeJson("ve-health", "Verry Elleegant health", "https://verry-elleegant-ai.vercel.app/api/health", (p) => p && typeof p === "object" && p?.ok !== false && !["down", "error", "failed"].includes(String(p?.status || "").toLowerCase())),
    probePage("sentinel-app", "Sentinel command interface", "https://pythology.co.nz/sentinel-command.html"),
    probePage("sentinel-runtime", "Sentinel runtime", "https://pythology.co.nz/sentinel-command.js"),
  ]);

  const [app, snapshot, binance, yahoo, xaus, earthnetApp, earthnetSnapshot, agriApp, agriData, poseidonApp, veApp, veHealth, sentinelApp, sentinelRuntime] = results;
  const providers = [binance, yahoo, xaus];
  const providerOperational = providers.filter((item) => item.status === "operational").length;
  const providerAvailable = providers.filter((item) => item.status !== "down").length;

  let cerberusStatus = "operational";
  if (app.status === "down" && snapshot.status === "down") cerberusStatus = "down";
  else if (snapshot.status !== "operational" || app.status !== "operational" || providerOperational < 2 || providerAvailable < 2) cerberusStatus = "degraded";
  const cerberusChecks = [app, snapshot, ...providers];
  const cerberus = {
    id: "cerberus", name: "Cerberus", status: cerberusStatus,
    summary: cerberusStatus === "operational" ? "Interface, snapshot and core market providers are responding." : cerberusStatus === "degraded" ? "Cerberus remains reachable, but one synthetic check or provider path needs attention." : "Multiple Cerberus health surfaces are unavailable.",
    checkedAt: nowIso(), averageLatencyMs: averageLatency(cerberusChecks),
    providersOperational: providerOperational, providersAvailable: providerAvailable, providersTotal: providers.length,
    snapshotAgeMinutes: snapshot.ageMinutes ?? null, snapshotUpdatedAt: snapshot.dataUpdatedAt ?? null,
    instrumentCount: snapshot.instrumentCount ?? null, checks: cerberusChecks,
  };

  let earthnetStatus = "operational";
  if (earthnetApp.status === "down" && earthnetSnapshot.status === "down") earthnetStatus = "down";
  else if (earthnetSnapshot.status !== "operational" || earthnetApp.status !== "operational") earthnetStatus = "degraded";
  const earthnetChecks = [earthnetApp, earthnetSnapshot];
  const earthnet = {
    id: "earthnet", name: "EarthNet", status: earthnetStatus,
    summary: earthnetStatus === "operational" ? `${earthnetSnapshot.engineCount ?? 0} engines completed the latest published intelligence cycle with ${earthnetSnapshot.eventCount ?? 0} events and no engine failures.` : earthnetStatus === "degraded" ? "EarthNet's GitHub Pages interface is reachable, but its published intelligence snapshot is stale or reporting a degraded assertion." : "Multiple EarthNet health surfaces are unavailable.",
    checkedAt: nowIso(), averageLatencyMs: averageLatency(earthnetChecks),
    snapshotAgeMinutes: earthnetSnapshot.ageMinutes ?? null, snapshotUpdatedAt: earthnetSnapshot.dataUpdatedAt ?? null,
    engineCount: earthnetSnapshot.engineCount ?? null, eventCount: earthnetSnapshot.eventCount ?? null,
    failedEngineCount: earthnetSnapshot.failedEngineCount ?? null, checks: earthnetChecks,
  };

  const agri = simpleSystem("agri", "Agri", [agriApp, agriData], "Interface and agricultural data service are responding.", "Agri is reachable, but either the frontend or data service needs attention.");
  const poseidon = simpleSystem("poseidon", "Poseidon", [poseidonApp], "Marine operational surface is responding; deeper provider telemetry is the next adapter layer.", "Poseidon's marine surface is only partially reachable.");
  const verryElleegant = simpleSystem("verry-elleegant", "Verry Elleegant", [veApp, veHealth], "Race-intelligence interface and health endpoint are responding.", "Verry Elleegant is reachable, but either the interface or health endpoint needs attention.");
  const sentinel = simpleSystem("sentinel", "Sentinel", [sentinelApp, sentinelRuntime], "Command interface and browser intelligence runtime are responding.", "Sentinel is reachable, but one command-runtime surface needs attention.");
  const yggdrasil = { id: "yggdrasil", name: "Yggdrasil", status: "unmonitored", summary: "VPS heartbeat bridge pending. Local MT5 telemetry stays private until a sanitised transport is attached." };

  const systems = [cerberus, earthnet, agri, poseidon, verryElleegant, sentinel, yggdrasil];
  const counts = fleetCounts(systems);
  const fleetStatus = counts.down > 0 ? "down" : counts.degraded > 0 ? "degraded" : counts.operational > 0 ? "operational" : "initialising";
  const output = { schemaVersion: 2, generatedAt: nowIso(), fleet: { status: fleetStatus, ...counts }, systems };

  fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
  fs.writeFileSync(OUTPUT, `${JSON.stringify(output, null, 2)}\n`, "utf8");
  console.log(`Fleet snapshot: ${systems.map((s) => `${s.name}=${s.status}`).join(", ")}`);
}

main().catch((error) => { console.error("System health check failed:", safeMessage(error)); process.exitCode = 1; });
