import fs from "node:fs";
import path from "node:path";

const OUTPUT = path.resolve("data/system-health.json");
const TIMEOUT_MS = 12_000;
const CERBERUS_STALE_MS = 18 * 60 * 60 * 1000;

function nowIso() {
  return new Date().toISOString();
}

function safeMessage(error) {
  const message = error instanceof Error ? error.message : String(error || "Unknown error");
  return message.replace(/https?:\/\/[^\s]+/g, "remote endpoint").slice(0, 140);
}

async function timedFetch(url, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  const started = performance.now();
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
      redirect: "follow",
      cache: "no-store",
    });
    return {
      response,
      latencyMs: Math.round(performance.now() - started),
    };
  } finally {
    clearTimeout(timer);
  }
}

async function probePage(id, label, url) {
  try {
    const { response, latencyMs } = await timedFetch(url, {
      headers: { "User-Agent": "Pythology-System-Monitor/1.0" },
    });
    return {
      id,
      label,
      status: response.ok ? "operational" : "down",
      latencyMs,
      httpStatus: response.status,
      checkedAt: nowIso(),
      note: response.ok ? undefined : "The synthetic interface check returned an HTTP error.",
    };
  } catch (error) {
    return {
      id,
      label,
      // A monitor runner timeout is not proof that the application is down. The
      // data/feed probes below determine whether Cerberus itself is functioning.
      status: "degraded",
      checkedAt: nowIso(),
      note: error?.name === "AbortError"
        ? "Synthetic runner could not reach the interface within 12 seconds."
        : safeMessage(error),
    };
  }
}

function parseCerberusTimestamp(payload) {
  const raw = payload?.generated_at_utc || payload?.generated_at || payload?.last_updated;
  if (!raw || typeof raw !== "string") return null;
  const normalized = raw.includes("T") ? raw : raw.replace(" ", "T");
  const parsed = Date.parse(
    normalized.endsWith("Z") || /[+-]\d\d:\d\d$/.test(normalized)
      ? normalized
      : `${normalized}Z`,
  );
  return Number.isFinite(parsed) ? parsed : null;
}

async function probeCerberusSnapshot() {
  const url = "https://pythology.co.nz/data/cerberus_latest.json";
  try {
    const { response, latencyMs } = await timedFetch(url, {
      headers: { "User-Agent": "Pythology-System-Monitor/1.0", Accept: "application/json" },
    });
    if (!response.ok) {
      return {
        id: "snapshot",
        label: "Forecast snapshot",
        status: "down",
        latencyMs,
        httpStatus: response.status,
        checkedAt: nowIso(),
      };
    }

    const payload = await response.json();
    const timestamp = parseCerberusTimestamp(payload);
    const ageMs = timestamp === null ? null : Math.max(0, Date.now() - timestamp);
    const instrumentCount = Array.isArray(payload?.instruments) ? payload.instruments.length : 0;
    const stale = ageMs === null || ageMs > CERBERUS_STALE_MS;

    return {
      id: "snapshot",
      label: "Forecast snapshot",
      status: stale ? "degraded" : "operational",
      latencyMs,
      httpStatus: response.status,
      checkedAt: nowIso(),
      dataUpdatedAt: timestamp === null ? null : new Date(timestamp).toISOString(),
      ageMinutes: ageMs === null ? null : Math.round(ageMs / 60_000),
      instrumentCount,
      freshnessLimitMinutes: Math.round(CERBERUS_STALE_MS / 60_000),
      note: stale ? "Snapshot is outside the Cerberus freshness guard." : undefined,
    };
  } catch (error) {
    return {
      id: "snapshot",
      label: "Forecast snapshot",
      status: "down",
      checkedAt: nowIso(),
      note: safeMessage(error),
    };
  }
}

async function probeJsonProvider(id, label, url, validator) {
  try {
    const { response, latencyMs } = await timedFetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 Pythology-System-Monitor/1.0",
        Accept: "application/json",
      },
    });
    if (!response.ok) {
      const runnerRestricted = response.status === 451 || response.status === 403;
      return {
        id,
        label,
        status: runnerRestricted ? "degraded" : "down",
        latencyMs,
        httpStatus: response.status,
        checkedAt: nowIso(),
        note: runnerRestricted
          ? "Synthetic runner is restricted by this provider; Cerberus fallback coverage is checked separately."
          : "Provider returned an HTTP error to the synthetic monitor.",
      };
    }
    const payload = await response.json();
    const valid = Boolean(validator(payload));
    return {
      id,
      label,
      status: valid ? "operational" : "degraded",
      latencyMs,
      httpStatus: response.status,
      checkedAt: nowIso(),
      note: valid ? undefined : "Provider responded but returned an unexpected payload.",
    };
  } catch (error) {
    return {
      id,
      label,
      status: "down",
      checkedAt: nowIso(),
      note: safeMessage(error),
    };
  }
}

function fleetCounts(systems) {
  const counts = { operational: 0, degraded: 0, down: 0, unmonitored: 0, initialising: 0 };
  for (const system of systems) {
    if (Object.hasOwn(counts, system.status)) counts[system.status] += 1;
  }
  return counts;
}

async function main() {
  const [app, snapshot, binance, yahoo, xaus] = await Promise.all([
    probePage("app", "Cerberus interface", "https://pythology.co.nz/cerberus-app/"),
    probeCerberusSnapshot(),
    probeJsonProvider(
      "binance",
      "Binance crypto feed",
      "https://api.binance.com/api/v3/ticker/24hr?symbol=BTCUSDT",
      (payload) => Number(payload?.lastPrice) > 0,
    ),
    probeJsonProvider(
      "yahoo",
      "Yahoo market feed",
      "https://query1.finance.yahoo.com/v8/finance/chart/%5EGSPC?interval=15m&range=1d",
      (payload) => Number(payload?.chart?.result?.[0]?.meta?.regularMarketPrice) > 0,
    ),
    probeJsonProvider(
      "xaus",
      "XAUS metals feed",
      "https://xaus.com/api/v1/spot?compact=1",
      (payload) => Number(payload?.spot_usd_oz) > 0,
    ),
  ]);

  const providers = [binance, yahoo, xaus];
  const providerOperational = providers.filter((item) => item.status === "operational").length;
  const providerAvailable = providers.filter((item) => item.status !== "down").length;

  let cerberusStatus = "operational";
  // The forecast snapshot is the core proof that Cerberus has current usable
  // state. Interface/provider monitor limitations degrade the score rather than
  // falsely declaring the system down.
  if (snapshot.status === "down") cerberusStatus = "down";
  else if (
    snapshot.status === "degraded" ||
    app.status !== "operational" ||
    providerOperational < 2 ||
    providerAvailable < 2
  ) cerberusStatus = "degraded";

  const latencyValues = [app, snapshot, ...providers]
    .map((item) => item.latencyMs)
    .filter((value) => Number.isFinite(value));

  const cerberus = {
    id: "cerberus",
    name: "Cerberus",
    status: cerberusStatus,
    summary:
      cerberusStatus === "operational"
        ? "Interface, snapshot and core market providers are responding."
        : cerberusStatus === "degraded"
          ? "Cerberus data is available, but one or more synthetic checks are limited or need attention."
          : "The Cerberus forecast snapshot is unavailable.",
    checkedAt: nowIso(),
    averageLatencyMs: latencyValues.length
      ? Math.round(latencyValues.reduce((sum, value) => sum + value, 0) / latencyValues.length)
      : null,
    providersOperational: providerOperational,
    providersAvailable: providerAvailable,
    providersTotal: providers.length,
    snapshotAgeMinutes: snapshot.ageMinutes ?? null,
    snapshotUpdatedAt: snapshot.dataUpdatedAt ?? null,
    instrumentCount: snapshot.instrumentCount ?? null,
    checks: [app, snapshot, ...providers],
  };

  const systems = [
    cerberus,
    { id: "earthnet", name: "EarthNet", status: "unmonitored", summary: "Monitor wiring pending." },
    { id: "agri", name: "Agri", status: "unmonitored", summary: "Monitor wiring pending." },
    { id: "poseidon", name: "Poseidon", status: "unmonitored", summary: "Monitor wiring pending." },
    { id: "verry-elleegant", name: "Verry Elleegant", status: "unmonitored", summary: "Monitor wiring pending." },
    { id: "sentinel", name: "Sentinel", status: "unmonitored", summary: "Monitor wiring pending." },
  ];

  const counts = fleetCounts(systems);
  const fleetStatus = counts.down > 0 ? "down" : counts.degraded > 0 ? "degraded" : counts.operational > 0 ? "operational" : "initialising";

  const output = {
    schemaVersion: 1,
    generatedAt: nowIso(),
    fleet: {
      status: fleetStatus,
      ...counts,
    },
    systems,
  };

  fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
  fs.writeFileSync(OUTPUT, `${JSON.stringify(output, null, 2)}\n`, "utf8");
  console.log(`Pythology health snapshot written: Cerberus=${cerberusStatus}, providers=${providerOperational}/${providers.length}`);
}

main().catch((error) => {
  console.error("System health check failed:", safeMessage(error));
  process.exitCode = 1;
});
