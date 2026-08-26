import fs from "node:fs/promises";
import path from "node:path";

const OUT_DIR = path.resolve(process.env.CERBERUS_OUT_DIR || "cerberus-runtime-out");
const USER_AGENT = "Pythology-Cerberus-Public-Runtime/1.0";
const TIMEFRAMES = ["15M", "1H", "4H", "1D"];
const CANDLE_LIMIT = 80;
const REQUEST_TIMEOUT_MS = 20_000;
const MAX_RETRIES = 2;

const ASSETS = [
  ["XAU/USD", "GC=F", "gold"],
  ["SP500", "^GSPC", "indices"],
  ["NAS100", "^NDX", "indices"],
  ["US30", "^DJI", "indices"],
  ["USDX", "DX-Y.NYB", "indices"],
  ["SPY", "SPY", "indices"],
  ["QQQ", "QQQ", "indices"],
  ["AMD", "AMD", "stocks"],
  ["NVDA", "NVDA", "stocks"],
  ["GOOGL", "GOOGL", "stocks"],
  ["META", "META", "stocks"],
  ["TSLA", "TSLA", "stocks"],
  ["PLTR", "PLTR", "stocks"],
  ["GLD", "GLD", "gold"],
  ["SLV", "SLV", "gold"],
  ["LLY", "LLY", "stocks"],
  ["GS", "GS", "stocks"],
  ["MSFT", "MSFT", "stocks"],
  ["AAPL", "AAPL", "stocks"],
  ["CRWD", "CRWD", "stocks"],
  ["GE", "GE", "stocks"],
  ["MS", "MS", "stocks"],
  ["COIN", "COIN", "crypto"],
  ["MU", "MU", "stocks"],
  ["BTC/USD", "BTC-USD", "crypto"],
  ["ETH/USD", "ETH-USD", "crypto"],
  ["GER40", "^GDAXI", "indices"],
  ["UK100", "^FTSE", "indices"],
  ["EUR/USD", "EURUSD=X", "majors"],
  ["GBP/USD", "GBPUSD=X", "majors"],
  ["AUD/USD", "AUDUSD=X", "majors"],
  ["NZD/USD", "NZDUSD=X", "majors"],
  ["USD/JPY", "JPY=X", "majors"],
].map(([symbol, yahoo, category]) => ({ symbol, yahoo, category }));

const MODEL_SYMBOL = {
  "XAU/USD": "XAUUSD",
  "US30": "DJ30",
  "NVDA": "NVIDIA",
  "GOOGL": "GOOG",
  "SLV": "SLVP",
  "BTC/USD": "BTCUSD",
  "ETH/USD": "ETHUSD",
  "EUR/USD": "EURUSD",
  "GBP/USD": "GBPUSD",
  "AUD/USD": "AUDUSD",
  "NZD/USD": "NZDUSD",
  "USD/JPY": "USDJPY",
};

const BINANCE_SYMBOL = {
  "BTC/USD": "BTCUSDT",
  "ETH/USD": "ETHUSDT",
};

const CATALYST_QUERY = {
  SPY: "S&P 500 stock market Fed earnings inflation",
  SP500: "S&P 500 stock market Fed earnings inflation",
  QQQ: "Nasdaq technology stocks Fed earnings AI chips",
  NAS100: "Nasdaq 100 technology stocks Fed earnings AI chips",
  US30: "Dow Jones stock market Fed earnings",
  GER40: "DAX Germany stock market ECB",
  UK100: "FTSE UK stock market Bank of England",
  USDX: "US dollar index Treasury yields Fed inflation",
  "XAU/USD": "gold price Fed yields inflation dollar",
  "BTC/USD": "Bitcoin crypto ETF macro risk",
  "ETH/USD": "Ethereum crypto ETF macro risk",
  "EUR/USD": "EUR USD ECB Fed euro dollar",
  "GBP/USD": "GBP USD Bank of England Fed pound dollar",
  "AUD/USD": "AUD USD RBA China commodities dollar",
  "NZD/USD": "NZD USD RBNZ dairy China dollar",
  "USD/JPY": "USD JPY Bank of Japan yen Treasury yields",
};

const BROAD_MARKETS = new Set(["SPY", "QQQ", "SP500", "NAS100", "US30", "GER40", "UK100"]);
const RELEVANCE = {
  NVDA: ["nvidia", "nvda"], AAPL: ["apple", "aapl"], AMD: ["advanced micro devices", "amd"],
  GOOGL: ["alphabet", "google", "googl"], META: ["meta platforms", "meta", "facebook"], TSLA: ["tesla", "tsla"],
  PLTR: ["palantir", "pltr"], MU: ["micron", "mu"], MSFT: ["microsoft", "msft"], CRWD: ["crowdstrike", "crwd"],
  GE: ["ge aerospace", "general electric"], MS: ["morgan stanley"], GS: ["goldman sachs"], LLY: ["eli lilly", "lilly", "lly"],
  COIN: ["coinbase", "coinbase global"], GLD: ["gold", "gld"], SLV: ["silver", "slv"], USDX: ["dollar index", "us dollar", "dxy", "fed", "treasury"],
  "XAU/USD": ["gold", "xau"], "BTC/USD": ["bitcoin", "btc"], "ETH/USD": ["ethereum", "ether", "eth"],
  "EUR/USD": ["euro", "eur", "ecb"], "GBP/USD": ["pound", "sterling", "gbp", "bank of england"],
  "AUD/USD": ["australian dollar", "aud", "rba"], "NZD/USD": ["new zealand dollar", "nzd", "rbnz"],
  "USD/JPY": ["yen", "jpy", "bank of japan", "boj"],
};
const BROAD_TERMS = ["stock market", "stocks", "s&p", "nasdaq", "dow", "fed", "inflation", "cpi", "jobs", "treasury", "yields", "earnings"];
const SEVERITY_TERMS = ["fed", "rate", "inflation", "cpi", "jobs", "earnings", "guidance", "upgrade", "downgrade", "lawsuit", "investigation", "merger", "acquisition", "tariff", "china", "chip", "ai", "rally", "selloff", "warning", "recession", "yields"];

function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }
function round(value, digits = 4) { const factor = 10 ** digits; return Math.round(Number(value) * factor) / factor; }
function roundPrice(value) { if (!Number.isFinite(value)) return 0; if (value >= 1000) return round(value, 1); if (value >= 100) return round(value, 2); if (value >= 10) return round(value, 3); return round(value, 5); }

async function fetchJson(url, options = {}, attempt = 0) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      ...options,
      cache: "no-store",
      signal: controller.signal,
      headers: { "User-Agent": USER_AGENT, Accept: "application/json,text/plain,*/*", ...(options.headers || {}) },
    });
    if (!response.ok) {
      const retryable = [408, 425, 429, 500, 502, 503, 504].includes(response.status);
      if (retryable && attempt < MAX_RETRIES) {
        await sleep(500 * (attempt + 1));
        return fetchJson(url, options, attempt + 1);
      }
      throw new Error(`HTTP ${response.status}`);
    }
    return response.json();
  } catch (error) {
    if (attempt < MAX_RETRIES && (error?.name === "AbortError" || String(error?.message || error).includes("fetch"))) {
      await sleep(500 * (attempt + 1));
      return fetchJson(url, options, attempt + 1);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function yahooUrl(symbol, interval, range) {
  return `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=${interval}&range=${range}`;
}

function extractYahooCandles(payload) {
  const result = payload?.chart?.result?.[0];
  const quote = result?.indicators?.quote?.[0];
  const timestamps = result?.timestamp || [];
  if (!quote || !Array.isArray(timestamps)) return [];
  const rows = [];
  for (let i = 0; i < timestamps.length; i += 1) {
    const open = Number(quote.open?.[i]);
    const high = Number(quote.high?.[i]);
    const low = Number(quote.low?.[i]);
    const close = Number(quote.close?.[i]);
    const volume = Number(quote.volume?.[i] || 0);
    if (![open, high, low, close].every(Number.isFinite) || open <= 0 || high <= 0 || low <= 0 || close <= 0) continue;
    rows.push({ timestamp: Number(timestamps[i]), open, high: Math.max(high, open, close), low: Math.min(low, open, close), close, volume: Number.isFinite(volume) ? volume : 0, isBullish: close >= open });
  }
  return rows;
}

function yahooQuote(payload, yahooSymbol) {
  const meta = payload?.chart?.result?.[0]?.meta;
  if (!meta) throw new Error(`No Yahoo metadata for ${yahooSymbol}`);
  const price = Number(meta.regularMarketPrice ?? meta.previousClose);
  const previous = Number(meta.chartPreviousClose ?? meta.previousClose);
  if (!Number.isFinite(price) || price <= 0) throw new Error(`Invalid Yahoo price for ${yahooSymbol}`);
  const marketTime = Number(meta.regularMarketTime);
  return {
    price: roundPrice(price),
    change: Number.isFinite(previous) && previous > 0 ? round(((price - previous) / previous) * 100, 2) : 0,
    source: `Yahoo Finance ${yahooSymbol}`,
    live: true,
    updatedAt: Number.isFinite(marketTime) && marketTime > 0 ? new Date(marketTime * 1000).toISOString() : new Date().toISOString(),
  };
}

function aggregateCandles(rows, groupSize, limit = CANDLE_LIMIT) {
  if (groupSize <= 1) return rows.slice(-limit).map((row, index) => ({ index, ...row }));
  const grouped = [];
  for (let i = 0; i < rows.length; i += groupSize) {
    const chunk = rows.slice(i, i + groupSize);
    if (!chunk.length) continue;
    const open = chunk[0].open;
    const close = chunk.at(-1).close;
    grouped.push({
      timestamp: chunk[0].timestamp,
      open,
      high: Math.max(...chunk.map((row) => row.high)),
      low: Math.min(...chunk.map((row) => row.low)),
      close,
      volume: chunk.reduce((sum, row) => sum + (Number(row.volume) || 0), 0),
      isBullish: close >= open,
    });
  }
  return grouped.slice(-limit).map((row, index) => ({ index, ...row }));
}

function bucketPoints(points, bucketSeconds, limit = CANDLE_LIMIT) {
  const buckets = new Map();
  for (const point of points || []) {
    const timestamp = Number(point?.t);
    const price = Number(point?.p);
    if (!Number.isFinite(timestamp) || !Number.isFinite(price) || price <= 0) continue;
    const bucket = Math.floor(timestamp / bucketSeconds) * bucketSeconds;
    const current = buckets.get(bucket);
    if (!current) buckets.set(bucket, { timestamp: bucket, open: price, high: price, low: price, close: price, volume: 0, isBullish: true });
    else {
      current.high = Math.max(current.high, price);
      current.low = Math.min(current.low, price);
      current.close = price;
      current.isBullish = current.close >= current.open;
    }
  }
  return [...buckets.values()].sort((a, b) => a.timestamp - b.timestamp).slice(-limit).map((row, index) => ({ index, ...row }));
}

function xausDaily(points, limit = CANDLE_LIMIT) {
  const rows = [];
  let previousClose = null;
  for (const point of points || []) {
    const close = Number(point?.c);
    const high = Number(point?.h ?? close);
    const low = Number(point?.l ?? close);
    const timestamp = Date.parse(`${point?.d || ""}T00:00:00Z`) / 1000;
    if (![close, high, low, timestamp].every(Number.isFinite) || close <= 0 || high <= 0 || low <= 0) continue;
    const open = Number.isFinite(previousClose) && previousClose > 0 ? previousClose : close;
    rows.push({ timestamp, open, high: Math.max(high, open, close), low: Math.min(low, open, close), close, volume: 0, isBullish: close >= open });
    previousClose = close;
  }
  return rows.slice(-limit).map((row, index) => ({ index, ...row }));
}

async function fetchGoldRuntime() {
  const [spot, intraday, history] = await Promise.all([
    fetchJson("https://xaus.com/api/v1/spot?compact=1"),
    fetchJson("https://xaus.com/api/v1/intraday?symbol=xau&hours=48"),
    fetchJson("https://xaus.com/api/v1/history"),
  ]);
  const price = Number(spot?.spot_usd_oz);
  if (!Number.isFinite(price) || price <= 0) throw new Error("Invalid XAUS spot price");
  const points = Array.isArray(intraday?.points) ? intraday.points : [];
  const dailyPoints = Array.isArray(history?.points) ? history.points : [];
  return {
    quote: {
      price: roundPrice(price),
      change: 0,
      source: "XAUS.com XAU/USD spot",
      live: String(spot?.data_state?.status || "fresh").toLowerCase() === "fresh" && spot?.stale !== true,
      updatedAt: spot?.data_state?.as_of || spot?.price_as_of || spot?.updated_at || new Date().toISOString(),
    },
    candles: {
      "15M": bucketPoints(points, 15 * 60),
      "1H": bucketPoints(points, 60 * 60),
      "4H": bucketPoints(points, 4 * 60 * 60),
      "1D": xausDaily(dailyPoints),
    },
  };
}

async function fetchBinanceRuntime(symbol) {
  const pair = BINANCE_SYMBOL[symbol];
  const ticker = await fetchJson(`https://api.binance.com/api/v3/ticker/24hr?symbol=${pair}`);
  const intervals = { "15M": "15m", "1H": "1h", "4H": "4h", "1D": "1d" };
  const candles = {};
  for (const [timeframe, interval] of Object.entries(intervals)) {
    const data = await fetchJson(`https://api.binance.com/api/v3/klines?symbol=${pair}&interval=${interval}&limit=${CANDLE_LIMIT}`);
    candles[timeframe] = (Array.isArray(data) ? data : []).map((row, index) => {
      const open = Number(row[1]), high = Number(row[2]), low = Number(row[3]), close = Number(row[4]), volume = Number(row[5]);
      return { index, timestamp: Number(row[0]) / 1000, open, high, low, close, volume, isBullish: close >= open };
    }).filter((row) => [row.open, row.high, row.low, row.close].every(Number.isFinite));
  }
  const price = Number(ticker?.lastPrice);
  if (!Number.isFinite(price) || price <= 0) throw new Error(`Invalid Binance price for ${symbol}`);
  return {
    quote: { price: roundPrice(price), change: round(Number(ticker?.priceChangePercent || 0), 2), source: `Binance ${pair}`, live: true, updatedAt: new Date().toISOString() },
    candles,
  };
}

async function fetchYahooRuntime(asset) {
  const [m15, h1, d1] = await Promise.all([
    fetchJson(yahooUrl(asset.yahoo, "15m", "7d")),
    fetchJson(yahooUrl(asset.yahoo, "1h", "60d")),
    fetchJson(yahooUrl(asset.yahoo, "1d", "1y")),
  ]);
  const rows15 = extractYahooCandles(m15);
  const rows1h = extractYahooCandles(h1);
  const rows1d = extractYahooCandles(d1);
  return {
    quote: yahooQuote(m15, asset.yahoo),
    candles: {
      "15M": aggregateCandles(rows15, 1),
      "1H": aggregateCandles(rows1h, 1),
      "4H": aggregateCandles(rows1h, 4),
      "1D": aggregateCandles(rows1d, 1),
    },
  };
}

async function fetchAssetRuntime(asset) {
  if (asset.symbol === "XAU/USD") return fetchGoldRuntime();
  if (BINANCE_SYMBOL[asset.symbol]) return fetchBinanceRuntime(asset.symbol);
  return fetchYahooRuntime(asset);
}

async function runPool(items, concurrency, worker) {
  const results = new Array(items.length);
  let cursor = 0;
  async function run() {
    while (true) {
      const index = cursor++;
      if (index >= items.length) return;
      try { results[index] = { ok: true, value: await worker(items[index], index) }; }
      catch (error) { results[index] = { ok: false, error: error?.message || String(error) }; }
      await sleep(120);
    }
  }
  await Promise.all(Array.from({ length: concurrency }, () => run()));
  return results;
}

function mean(values) { return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0; }
function ema(values, period) {
  if (values.length < period) return null;
  const k = 2 / (period + 1);
  let current = mean(values.slice(0, period));
  for (let i = period; i < values.length; i += 1) current = values[i] * k + current * (1 - k);
  return current;
}
function rsi(values, period = 14) {
  if (values.length <= period) return null;
  let gains = 0, losses = 0;
  for (let i = values.length - period; i < values.length; i += 1) {
    const delta = values[i] - values[i - 1];
    if (delta >= 0) gains += delta; else losses += Math.abs(delta);
  }
  if (losses === 0) return 100;
  const rs = (gains / period) / (losses / period);
  return 100 - 100 / (1 + rs);
}
function atr(candles, period = 14) {
  if (candles.length <= period) return null;
  const ranges = [];
  for (let i = candles.length - period; i < candles.length; i += 1) {
    const previousClose = Number(candles[i - 1]?.close);
    const high = Number(candles[i]?.high), low = Number(candles[i]?.low);
    if (![previousClose, high, low].every(Number.isFinite)) return null;
    ranges.push(Math.max(high - low, Math.abs(high - previousClose), Math.abs(low - previousClose)));
  }
  return mean(ranges);
}

function analyse(asset, candles) {
  if (!Array.isArray(candles) || candles.length < 55) throw new Error(`only ${Array.isArray(candles) ? candles.length : 0} 15M candles`);
  const closes = candles.map((row) => Number(row.close));
  const latest = candles.at(-1);
  const entry = Number(latest.close);
  const ema20 = ema(closes, 20), ema50 = ema(closes, 50), rsi14 = rsi(closes, 14), atr14 = atr(candles, 14);
  if (![entry, ema20, ema50, rsi14, atr14].every(Number.isFinite) || entry <= 0 || atr14 <= 0) throw new Error("technical indicators unavailable");
  const bullish = entry > ema20 && ema20 > ema50 && rsi14 >= 51;
  const bearish = entry < ema20 && ema20 < ema50 && rsi14 <= 49;
  const bias = bullish ? "BULLISH" : bearish ? "BEARISH" : "NEUTRAL/LOW_CONF";
  const trendStrength = Math.min(2.5, Math.abs(ema20 - ema50) / atr14);
  const rsiStrength = Math.min(1, Math.abs(rsi14 - 50) / 18);
  const directionalConfidence = Math.min(0.9, 0.56 + trendStrength * 0.08 + rsiStrength * 0.1);
  const neutralConfidence = Math.min(0.59, 0.5 + trendStrength * 0.025 + rsiStrength * 0.025);
  const confidence = bullish || bearish ? directionalConfidence : neutralConfidence;
  const gated = bias === "NEUTRAL/LOW_CONF" || confidence < 0.62;
  const tp = bullish ? entry + atr14 * 1.5 : bearish ? entry - atr14 * 1.5 : entry;
  const sl = bullish ? entry - atr14 : bearish ? entry + atr14 : entry;
  return {
    symbol: MODEL_SYMBOL[asset.symbol] || asset.symbol,
    bias,
    confidence: round(confidence, 6),
    entry: roundPrice(entry),
    tp: roundPrice(tp),
    sl: roundPrice(sl),
    atr: roundPrice(atr14),
    gated,
    source_symbol: asset.symbol,
    source_bar_at: Number.isFinite(Number(latest.timestamp)) ? new Date(Number(latest.timestamp) * 1000).toISOString() : null,
    technicals: { timeframe: "15M", ema20: roundPrice(ema20), ema50: roundPrice(ema50), rsi14: round(rsi14, 2) },
  };
}

function catalystQuery(asset) { return CATALYST_QUERY[asset.symbol] || `${asset.symbol} ${asset.yahoo} market news catalyst`; }
function relevantHeadline(item, asset) {
  const text = ` ${String(item?.title || "")} ${String(item?.summary || item?.description || "")} `.toLowerCase().replace(/\s+/g, " ");
  const terms = BROAD_MARKETS.has(asset.symbol) ? BROAD_TERMS : RELEVANCE[asset.symbol];
  if (!terms?.length) return true;
  return terms.some((term) => text.includes(term));
}
function catalystSeverity(headlines) {
  if (!headlines.length) return 0;
  const text = headlines.map((row) => `${row.title} ${row.summary || ""}`).join(" ").toLowerCase();
  const hits = SEVERITY_TERMS.filter((term) => text.includes(term)).length;
  return Math.min(100, Math.max(20, headlines.length * 10 + hits * 8));
}
async function fetchCatalyst(asset) {
  const url = `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(catalystQuery(asset))}&quotesCount=0&newsCount=20&enableFuzzyQuery=false`;
  const payload = await fetchJson(url);
  const seen = new Set();
  const headlines = (Array.isArray(payload?.news) ? payload.news : []).map((item) => {
    const title = String(item?.title || "").trim();
    if (!title || seen.has(title.toLowerCase())) return null;
    seen.add(title.toLowerCase());
    const rawTime = Number(item?.providerPublishTime || item?.publishTime);
    return {
      source: String(item?.publisher || item?.source || "Yahoo Finance").trim() || "Yahoo Finance",
      title,
      summary: String(item?.summary || item?.description || "").trim(),
      timestamp: Number.isFinite(rawTime) && rawTime > 0 ? new Date((rawTime > 10_000_000_000 ? rawTime : rawTime * 1000)).toISOString() : undefined,
      affectedSymbols: [asset.symbol],
      url: item?.link || item?.url || undefined,
    };
  }).filter(Boolean).filter((item) => relevantHeadline(item, asset)).slice(0, 8);
  const fresh = headlines.filter((item) => { const ts = Date.parse(item.timestamp || ""); return Number.isFinite(ts) && Date.now() - ts <= 24 * 60 * 60 * 1000; });
  const state = headlines.length ? (fresh.length ? "CONFIRMED" : "STALE_OR_PRICED") : "UNCONFIRMED";
  const severity = catalystSeverity(headlines);
  return {
    symbol: asset.symbol,
    state,
    source: headlines.length ? (headlines.some((row) => String(row.source).toLowerCase().includes("marketwatch")) ? "MarketWatch" : "Yahoo Finance") : "None",
    severity,
    affectedSymbols: [asset.symbol],
    headlines,
    freshHeadlineCount: fresh.length,
    fetchedHeadlineCount: Array.isArray(payload?.news) ? payload.news.length : 0,
    generatedAt: new Date().toISOString(),
    summary: headlines.length ? `${headlines.length} relevant catalyst headline${headlines.length === 1 ? "" : "s"} found for ${asset.symbol}.` : `No relevant fresh catalyst headline found for ${asset.symbol}.`,
    limitations: "Public-safe Yahoo headline snapshot only. Missing evidence is treated as UNCONFIRMED and never as a directional signal.",
  };
}

async function writeJson(filename, payload) {
  await fs.writeFile(path.join(OUT_DIR, filename), JSON.stringify(payload, null, 2) + "\n", "utf8");
}

async function main() {
  await fs.mkdir(OUT_DIR, { recursive: true });
  const generatedAt = new Date().toISOString();
  const runtimeResults = await runPool(ASSETS, 3, fetchAssetRuntime);
  const prices = {};
  const candlesByTf = Object.fromEntries(TIMEFRAMES.map((tf) => [tf, {}]));
  const instruments = [];
  const errors = [];

  runtimeResults.forEach((result, index) => {
    const asset = ASSETS[index];
    if (!result.ok) {
      errors.push(`${asset.symbol}: ${result.error}`);
      return;
    }
    const runtime = result.value;
    prices[asset.symbol] = { name: asset.symbol, category: asset.category, ...runtime.quote };
    for (const timeframe of TIMEFRAMES) {
      const rows = Array.isArray(runtime.candles?.[timeframe]) ? runtime.candles[timeframe] : [];
      if (rows.length) candlesByTf[timeframe][asset.symbol] = rows;
    }
    try { instruments.push(analyse(asset, runtime.candles?.["15M"])); }
    catch (error) { errors.push(`${asset.symbol} analysis: ${error?.message || error}`); }
  });

  const priceCoverage = Object.values(prices).filter((row) => row?.live === true && Number.isFinite(Number(row?.price))).length;
  const seriesCoverage = TIMEFRAMES.reduce((sum, timeframe) => sum + Object.values(candlesByTf[timeframe]).filter((rows) => Array.isArray(rows) && rows.length >= 50).length, 0);
  const expectedSeries = ASSETS.length * TIMEFRAMES.length;
  const technicalCoverage = instruments.length;

  await writeJson("cerberus_prices.json", { generated_at: generatedAt, prices });
  for (const timeframe of TIMEFRAMES) await writeJson(`cerberus_klines_${timeframe}.json`, { generated_at: generatedAt, timeframe, candles: candlesByTf[timeframe] });

  const catalystResults = await runPool(ASSETS, 3, fetchCatalyst);
  const catalysts = {};
  const catalystErrors = [];
  catalystResults.forEach((result, index) => {
    const asset = ASSETS[index];
    if (result.ok) catalysts[asset.symbol] = result.value;
    else {
      catalystErrors.push(`${asset.symbol}: ${result.error}`);
      catalysts[asset.symbol] = { symbol: asset.symbol, state: "UNCONFIRMED", source: "None", severity: 0, affectedSymbols: [asset.symbol], headlines: [], generatedAt, summary: `Catalyst snapshot unavailable: ${result.error}`, limitations: "Provider failure is fail-soft and non-directional." };
    }
  });
  await writeJson("cerberus_catalysts.json", { generated_at: generatedAt, catalysts });

  const forecast = {
    generated_at: generatedAt,
    generated_at_utc: generatedAt,
    target_session: "Public-safe GitHub technical snapshot",
    last_updated: generatedAt,
    status: technicalCoverage >= Math.ceil(ASSETS.length * 0.7) ? "operational" : "degraded",
    engine_version: "cerberus-github-public-v1",
    model_method: "Interim deterministic 15-minute technical state using EMA20/EMA50, RSI14 and ATR14. Research/decision-support only; no execution.",
    refresh: { requested: ASSETS.length, refreshed: technicalCoverage, errors },
    instruments,
  };
  await writeJson("cerberus_latest.json", forecast);

  const healthy = priceCoverage >= Math.ceil(ASSETS.length * 0.7) && seriesCoverage >= Math.ceil(expectedSeries * 0.7) && technicalCoverage >= Math.ceil(ASSETS.length * 0.7);
  const status = {
    generated_at: generatedAt,
    mode: "github_public_static_runtime",
    healthy,
    coverage: {
      symbols: ASSETS.length,
      live_prices: priceCoverage,
      technical_instruments: technicalCoverage,
      expected_kline_series: expectedSeries,
      healthy_kline_series: seriesCoverage,
      catalyst_snapshots: Object.keys(catalysts).length,
    },
    errors: { market: errors, catalysts: catalystErrors },
    safety: "No API secrets, no private learning ledger, no trading execution. Provider failures are fail-closed or non-directional.",
  };
  await writeJson("cerberus_runtime_status.json", status);
  console.log(JSON.stringify(status, null, 2));
  if (!healthy) process.exitCode = 1;
}

main().catch((error) => {
  console.error("Cerberus public runtime failed:", error);
  process.exitCode = 1;
});
