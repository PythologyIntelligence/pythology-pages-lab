import fs from "node:fs";
import path from "node:path";

const healthPath = path.resolve("data/system-health.json");
const yggPath = path.resolve("data/yggdrasil_activity.json");
const FRESH_MS = 45 * 60 * 1000;
const DEGRADED_MS = 90 * 60 * 1000;

function readJson(file) {
  try { return JSON.parse(fs.readFileSync(file, "utf8")); }
  catch { return null; }
}

function stamp(payload) {
  const raw = payload?.publishedAt || payload?.generatedAt;
  const ms = Date.parse(raw || "");
  return Number.isFinite(ms) ? ms : null;
}

function counts(systems) {
  const out = { operational: 0, degraded: 0, down: 0, unmonitored: 0, initialising: 0 };
  for (const s of systems) if (Object.hasOwn(out, s.status)) out[s.status] += 1;
  return out;
}

const health = readJson(healthPath);
const ygg = readJson(yggPath);
if (!health || !Array.isArray(health.systems)) process.exit(0);

let status = "unmonitored";
let summary = "VPS heartbeat bridge pending.";
let checkedAt = new Date().toISOString();
let ageMinutes = null;
let live = {};

if (ygg && ygg.system === "Yggdrasil") {
  const ts = stamp(ygg);
  const age = ts === null ? Infinity : Math.max(0, Date.now() - ts);
  ageMinutes = Number.isFinite(age) ? Math.round(age / 60000) : null;
  live = ygg.live && typeof ygg.live === "object" ? ygg.live : {};
  const bridgeLive = String(ygg?.bridge?.status || "").toLowerCase() === "live";
  const appHealthy = String(ygg?.status || "").toLowerCase() === "operational" && live.mt5Connected === true && live.lastError !== true;

  if (bridgeLive && appHealthy && age <= FRESH_MS) {
    status = "operational";
    summary = `MT5 DEMO connected; live VPS heartbeat is fresh, ${Number(live.positions || 0)} open position(s), ${Number(live.tradesThisSession || 0)} trade(s) this session.`;
  } else if (age <= DEGRADED_MS) {
    status = "degraded";
    summary = bridgeLive ? "Yggdrasil heartbeat is present but stale or one runtime health assertion needs attention." : "Yggdrasil safe feed is present but the external bridge is not reporting live.";
  } else {
    status = "down";
    summary = "Yggdrasil VPS heartbeat is stale; check the MT5 terminal, engine and Fleet bridge process.";
  }
  checkedAt = ygg.publishedAt || ygg.generatedAt || checkedAt;
}

const entry = {
  id: "yggdrasil",
  name: "Yggdrasil",
  status,
  summary,
  checkedAt,
  snapshotAgeMinutes: ageMinutes,
  mode: ygg?.mode || "DEMO_ONLY",
  championCount: Array.isArray(ygg?.champions) ? ygg.champions.length : null,
  positions: live.positions ?? null,
  tradesThisSession: live.tradesThisSession ?? null,
  openRiskPct: live.openRiskPct ?? null,
  killSwitch: live.killSwitch ?? null,
  activityUrl: "monitor/yggdrasil.html",
};

const index = health.systems.findIndex((s) => s?.id === "yggdrasil");
if (index >= 0) health.systems[index] = entry;
else health.systems.push(entry);

// Poseidon is intentionally offline for now. Keep it visible in Fleet without
// treating an expected 404 as an outage. Once its public surface is reconnected,
// remove this parking override and let the synthetic probe determine health again.
const poseidonIndex = health.systems.findIndex((s) => s?.id === "poseidon");
if (poseidonIndex >= 0) {
  health.systems[poseidonIndex] = {
    ...health.systems[poseidonIndex],
    status: "unmonitored",
    summary: "Temporarily parked from Fleet monitoring while the Poseidon public interface is offline.",
    checkedAt: new Date().toISOString(),
    averageLatencyMs: null,
    checks: [],
  };
}

const c = counts(health.systems);
health.fleet = {
  status: c.down > 0 ? "down" : c.degraded > 0 ? "degraded" : c.operational > 0 ? "operational" : "initialising",
  ...c,
};
health.schemaVersion = Math.max(Number(health.schemaVersion || 0), 3);
fs.writeFileSync(healthPath, `${JSON.stringify(health, null, 2)}\n`, "utf8");
console.log(`Merged Yggdrasil into Fleet: ${status}, age=${ageMinutes ?? "?"}m; Poseidon=unmonitored`);
