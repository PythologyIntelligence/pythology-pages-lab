import fs from "node:fs";
import path from "node:path";

const FILE = path.resolve("data/system-health.json");
const HELIOS = "https://helios.pythology.co.nz";
const CHATHAMS = "https://chathams.pythology.co.nz";
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

async function probePage(id, label, url) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  const started = performance.now();
  try {
    const response = await fetch(url, {
      signal: ctl.signal,
      redirect: "follow",
      cache: "no-store",
      headers: { "User-Agent": "Pythology-System-Monitor/1.2" },
    });
    const latencyMs = Math.round(performance.now() - started);
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
  } finally {
    clearTimeout(timer);
  }
}

async function probeChathams() {
  const check = await probePage("chathams-health", "Chathams community weather health", `${CHATHAMS}/health`);
  if (check.status !== "operational") return check;

  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  const started = performance.now();
  try {
    const response = await fetch(`${CHATHAMS}/health`, {
      signal: ctl.signal,
      cache: "no-store",
      headers: { "User-Agent": "Pythology-System-Monitor/1.2", Accept: "application/json" },
    });
    const latencyMs = Math.round(performance.now() - started);
    const payload = await response.json();
    const nominal = response.ok && String(payload?.service || "").toLowerCase() === "helios-chathams" && payload?.ok !== false;
    return {
      id: "chathams-health",
      label: "Chathams community weather health",
      status: nominal ? "operational" : "degraded",
      latencyMs,
      httpStatus: response.status,
      checkedAt: nowIso(),
      note: nominal ? undefined : "Health endpoint responded but its service assertion was not nominal.",
    };
  } catch (error) {
    return {
      id: "chathams-health",
      label: "Chathams community weather health",
      status: "degraded",
      checkedAt: nowIso(),
      note: error?.name === "AbortError" ? "Synthetic runner timed out after 12 seconds." : safeMessage(error),
    };
  } finally {
    clearTimeout(timer);
  }
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

const [heliosCheck, chathamsCheck] = await Promise.all([
  probePage("helios-app", "Helios live weather interface", `${HELIOS}/`),
  probeChathams(),
]);

upsert(health, {
  id: "helios",
  name: "Helios",
  status: heliosCheck.status,
  summary: heliosCheck.status === "operational"
    ? "Live VPS weather-intelligence interface is responding."
    : heliosCheck.status === "down"
      ? "Helios live VPS interface is unavailable."
      : "Helios could not be conclusively verified by the synthetic runner.",
  checkedAt: nowIso(),
  averageLatencyMs: Number.isFinite(heliosCheck.latencyMs) ? heliosCheck.latencyMs : null,
  liveUrl: `${HELIOS}/`,
  checks: [heliosCheck],
});

upsert(health, {
  id: "helios-chathams",
  name: "Helios · Chatham Islands",
  status: chathamsCheck.status,
  summary: chathamsCheck.status === "operational"
    ? "Community weather, marine and tide service health endpoint is responding."
    : chathamsCheck.status === "down"
      ? "Chathams community weather service is unavailable."
      : "Chathams service could not be conclusively verified by the synthetic runner.",
  checkedAt: nowIso(),
  averageLatencyMs: Number.isFinite(chathamsCheck.latencyMs) ? chathamsCheck.latencyMs : null,
  liveUrl: `${CHATHAMS}/`,
  checks: [chathamsCheck],
});

recount(health);
health.schemaVersion = Math.max(Number(health.schemaVersion || 0), 5);
fs.writeFileSync(FILE, `${JSON.stringify(health, null, 2)}\n`, "utf8");
console.log(`Merged Helios health into Fleet: Helios=${heliosCheck.status}, Chathams=${chathamsCheck.status}`);
