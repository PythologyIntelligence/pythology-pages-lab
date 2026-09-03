import fs from "node:fs";
import path from "node:path";

const FILE = path.resolve("data/system-health.json");
const ATLAS = "https://atlas.pythology.co.nz";
const HYDRA = "https://hydra.pythology.co.nz";
const TIMEOUT_MS = 12_000;

function readJson(file) {
  try { return JSON.parse(fs.readFileSync(file, "utf8")); }
  catch { return null; }
}

function nowIso() { return new Date().toISOString(); }

function safeMessage(error) {
  const message = error instanceof Error ? error.message : String(error || "Unknown error");
  return message.replace(/https?:\/\/[^\s]+/g, "remote endpoint").slice(0, 140);
}

async function timedFetch(url, options = {}) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  const started = performance.now();
  try {
    const response = await fetch(url, {
      ...options,
      signal: ctl.signal,
      redirect: "follow",
      cache: "no-store",
    });
    return { response, latencyMs: Math.round(performance.now() - started) };
  } finally {
    clearTimeout(timer);
  }
}

async function probePage(id, label, url) {
  try {
    const { response, latencyMs } = await timedFetch(url, {
      headers: { "User-Agent": "Pythology-System-Monitor/1.3" },
    });
    return {
      id,
      label,
      status: response.ok ? "operational" : "down",
      latencyMs,
      httpStatus: response.status,
      checkedAt: nowIso(),
      note: response.ok ? undefined : "The live service returned an HTTP error.",
    };
  } catch (error) {
    return {
      id,
      label,
      status: "degraded",
      checkedAt: nowIso(),
      note: error?.name === "AbortError" ? "Synthetic runner timed out after 12 seconds." : safeMessage(error),
    };
  }
}

async function probeAtlasStatus() {
  try {
    const { response, latencyMs } = await timedFetch(`${ATLAS}/api/atlas/status`, {
      headers: { "User-Agent": "Pythology-System-Monitor/1.3", Accept: "application/json" },
    });
    if (!response.ok) {
      return {
        id: "atlas-status",
        label: "Atlas live status",
        status: "down",
        latencyMs,
        httpStatus: response.status,
        checkedAt: nowIso(),
        note: "Atlas status endpoint returned an HTTP error.",
      };
    }
    const payload = await response.json();
    const declared = String(payload?.status || payload?.state || "").toLowerCase();
    const nominal = payload && typeof payload === "object" && !["down", "failed", "error"].includes(declared);
    return {
      id: "atlas-status",
      label: "Atlas live status",
      status: nominal ? "operational" : "degraded",
      latencyMs,
      httpStatus: response.status,
      checkedAt: nowIso(),
      note: nominal ? undefined : "Atlas responded but its status assertion was not nominal.",
    };
  } catch (error) {
    return {
      id: "atlas-status",
      label: "Atlas live status",
      status: "degraded",
      checkedAt: nowIso(),
      note: error?.name === "AbortError" ? "Synthetic runner timed out after 12 seconds." : safeMessage(error),
    };
  }
}

async function probeHydra() {
  try {
    const { response, latencyMs } = await timedFetch(`${HYDRA}/health`, {
      headers: { "User-Agent": "Pythology-System-Monitor/1.3", Accept: "application/json" },
    });
    if (!response.ok) {
      return {
        id: "hydra-health",
        label: "Hydra resident custodian",
        status: "down",
        latencyMs,
        httpStatus: response.status,
        checkedAt: nowIso(),
        note: "Hydra health endpoint returned an HTTP error.",
      };
    }
    const payload = await response.json();
    const nominal = payload?.ok === true && String(payload?.service || "").toLowerCase() === "hydra";
    return {
      id: "hydra-health",
      label: "Hydra resident custodian",
      status: nominal ? "operational" : "degraded",
      latencyMs,
      httpStatus: response.status,
      checkedAt: nowIso(),
      fleetStatus: payload?.fleet_status || null,
      critical: Number(payload?.critical) || 0,
      warnings: Number(payload?.warnings) || 0,
      repairsThisScan: Number(payload?.repairs_this_scan) || 0,
      recoveredThisScan: Number(payload?.recovered_this_scan) || 0,
      dataUpdatedAt: payload?.generated_at || null,
      note: nominal ? undefined : "Hydra responded but its service assertion was not nominal.",
    };
  } catch (error) {
    const code = String(error?.cause?.code || "").toUpperCase();
    const dnsPending = ["ENOTFOUND", "EAI_AGAIN"].includes(code);
    return {
      id: "hydra-health",
      label: "Hydra resident custodian",
      status: dnsPending ? "initialising" : "degraded",
      checkedAt: nowIso(),
      note: dnsPending
        ? "Hydra's public health hostname has not propagated yet."
        : error?.name === "AbortError"
          ? "Synthetic runner timed out after 12 seconds."
          : safeMessage(error),
    };
  }
}

function averageLatency(checks) {
  const values = checks.map((item) => item.latencyMs).filter(Number.isFinite);
  return values.length ? Math.round(values.reduce((a, b) => a + b, 0) / values.length) : null;
}

function upsert(health, system) {
  const index = health.systems.findIndex((item) => item?.id === system.id);
  if (index >= 0) health.systems[index] = { ...health.systems[index], ...system };
  else health.systems.push(system);
}

function recount(health) {
  const counts = { operational: 0, degraded: 0, down: 0, unmonitored: 0, initialising: 0 };
  for (const system of health.systems) {
    if (Object.hasOwn(counts, system.status)) counts[system.status] += 1;
  }
  health.fleet = {
    status: counts.down > 0 ? "down" : counts.degraded > 0 ? "degraded" : counts.operational > 0 ? "operational" : "initialising",
    ...counts,
  };
}

const health = readJson(FILE);
if (!health || !Array.isArray(health.systems)) process.exit(0);

const [atlasApp, atlasStatus, hydraCheck] = await Promise.all([
  probePage("atlas-app", "Atlas geological intelligence", `${ATLAS}/atlas`),
  probeAtlasStatus(),
  probeHydra(),
]);

const atlasChecks = [atlasApp, atlasStatus];
const atlasOperational = atlasChecks.filter((item) => item.status === "operational").length;
const atlasDown = atlasChecks.filter((item) => item.status === "down").length;
const atlasState = atlasOperational === atlasChecks.length ? "operational" : atlasDown === atlasChecks.length ? "down" : "degraded";

upsert(health, {
  id: "atlas",
  name: "Atlas",
  status: atlasState,
  summary: atlasState === "operational"
    ? "New Zealand geological-intelligence interface and live status endpoint are responding."
    : atlasState === "down"
      ? "Atlas could not be reached through its public VPS route."
      : "Atlas is partially reachable; either its interface or live status path needs attention.",
  checkedAt: nowIso(),
  averageLatencyMs: averageLatency(atlasChecks),
  liveUrl: `${ATLAS}/atlas`,
  checks: atlasChecks,
});

upsert(health, {
  id: "hydra",
  name: "Hydra",
  status: hydraCheck.status,
  summary: hydraCheck.status === "operational"
    ? `Resident VPS custodian is responding; currently tracking ${hydraCheck.critical ?? 0} critical and ${hydraCheck.warnings ?? 0} warning condition(s).`
    : hydraCheck.status === "initialising"
      ? "Resident custodian is staged; public health transport is waiting for DNS propagation."
      : hydraCheck.status === "down"
        ? "Hydra resident custodian is not reachable through its health route."
        : "Hydra could not be conclusively verified by the synthetic runner.",
  checkedAt: nowIso(),
  averageLatencyMs: Number.isFinite(hydraCheck.latencyMs) ? hydraCheck.latencyMs : null,
  fleetStatus: hydraCheck.fleetStatus ?? null,
  criticalIssues: hydraCheck.critical ?? null,
  warningIssues: hydraCheck.warnings ?? null,
  repairsThisScan: hydraCheck.repairsThisScan ?? null,
  recoveredThisScan: hydraCheck.recoveredThisScan ?? null,
  snapshotUpdatedAt: hydraCheck.dataUpdatedAt ?? null,
  checks: [hydraCheck],
});

recount(health);
health.schemaVersion = Math.max(Number(health.schemaVersion || 0), 6);
fs.writeFileSync(FILE, `${JSON.stringify(health, null, 2)}\n`, "utf8");
console.log(`Merged Atlas/Hydra health into Fleet: Atlas=${atlasState}, Hydra=${hydraCheck.status}`);
