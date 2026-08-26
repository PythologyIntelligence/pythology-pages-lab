import fs from "node:fs/promises";
import path from "node:path";

const ROOT = path.resolve(process.env.CERBERUS_OUT_DIR || "cerberus-runtime-out");
const ASSETS = [
  { symbol: "BTC/USD", yahoo: "BTC-USD", model: "BTCUSD" },
  { symbol: "ETH/USD", yahoo: "ETH-USD", model: "ETHUSD" },
];
const USER_AGENT = "Pythology-Cerberus-Crypto-Recovery/1.0";
const LIMIT = 80;

async function readJson(name) {
  return JSON.parse(await fs.readFile(path.join(ROOT, name), "utf8"));
}
async function writeJson(name, payload) {
  await fs.writeFile(path.join(ROOT, name), JSON.stringify(payload, null, 2) + "\n", "utf8");
}
async function fetchJson(url) {
  const response = await fetch(url, { cache: "no-store", headers: { "User-Agent": USER_AGENT, Accept: "application/json" } });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}
function url(symbol, interval, range) {
  return `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=${interval}&range=${range}`;
}
function candles(payload) {
  const result = payload?.chart?.result?.[0];
  const quote = result?.indicators?.quote?.[0];
  const timestamps = result?.timestamp || [];
  const rows = [];
  for (let i = 0; i < timestamps.length; i += 1) {
    const open = Number(quote?.open?.[i]), high = Number(quote?.high?.[i]), low = Number(quote?.low?.[i]), close = Number(quote?.close?.[i]);
    const volume = Number(quote?.volume?.[i] || 0);
    if (![open, high, low, close].every(Number.isFinite) || open <= 0 || high <= 0 || low <= 0 || close <= 0) continue;
    rows.push({ timestamp: Number(timestamps[i]), open, high: Math.max(high, open, close), low: Math.min(low, open, close), close, volume: Number.isFinite(volume) ? volume : 0, isBullish: close >= open });
  }
  return rows;
}
function aggregate(rows, group = 1) {
  if (group === 1) return rows.slice(-LIMIT).map((row, index) => ({ index, ...row }));
  const grouped = [];
  for (let i = 0; i < rows.length; i += group) {
    const chunk = rows.slice(i, i + group);
    if (!chunk.length) continue;
    const open = chunk[0].open, close = chunk.at(-1).close;
    grouped.push({ timestamp: chunk[0].timestamp, open, high: Math.max(...chunk.map((row) => row.high)), low: Math.min(...chunk.map((row) => row.low)), close, volume: chunk.reduce((sum, row) => sum + (Number(row.volume) || 0), 0), isBullish: close >= open });
  }
  return grouped.slice(-LIMIT).map((row, index) => ({ index, ...row }));
}
function quote(payload, yahoo) {
  const meta = payload?.chart?.result?.[0]?.meta;
  const price = Number(meta?.regularMarketPrice ?? meta?.previousClose);
  const previous = Number(meta?.chartPreviousClose ?? meta?.previousClose);
  if (!Number.isFinite(price) || price <= 0) throw new Error(`Invalid Yahoo price for ${yahoo}`);
  const ts = Number(meta?.regularMarketTime);
  return {
    name: yahoo.startsWith("BTC") ? "Bitcoin" : "Ethereum",
    category: "crypto",
    price: Number(price.toFixed(2)),
    change: Number.isFinite(previous) && previous > 0 ? Number((((price - previous) / previous) * 100).toFixed(2)) : 0,
    source: `Yahoo Finance ${yahoo} (Binance regional fallback)`,
    live: true,
    updatedAt: Number.isFinite(ts) && ts > 0 ? new Date(ts * 1000).toISOString() : new Date().toISOString(),
  };
}
function mean(values) { return values.reduce((sum, value) => sum + value, 0) / values.length; }
function ema(values, period) {
  if (values.length < period) return null;
  const k = 2 / (period + 1);
  let value = mean(values.slice(0, period));
  for (let i = period; i < values.length; i += 1) value = values[i] * k + value * (1 - k);
  return value;
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
function atr(rows, period = 14) {
  if (rows.length <= period) return null;
  const ranges = [];
  for (let i = rows.length - period; i < rows.length; i += 1) {
    const previous = Number(rows[i - 1]?.close), high = Number(rows[i]?.high), low = Number(rows[i]?.low);
    ranges.push(Math.max(high - low, Math.abs(high - previous), Math.abs(low - previous)));
  }
  return mean(ranges);
}
function rp(value) { return value >= 1000 ? Number(value.toFixed(1)) : value >= 100 ? Number(value.toFixed(2)) : Number(value.toFixed(4)); }
function analyse(asset, rows) {
  const closes = rows.map((row) => Number(row.close));
  const latest = rows.at(-1), entry = Number(latest?.close), e20 = ema(closes, 20), e50 = ema(closes, 50), r14 = rsi(closes), a14 = atr(rows);
  if (![entry, e20, e50, r14, a14].every(Number.isFinite) || a14 <= 0) throw new Error(`${asset.symbol} technical indicators unavailable`);
  const bullish = entry > e20 && e20 > e50 && r14 >= 51;
  const bearish = entry < e20 && e20 < e50 && r14 <= 49;
  const bias = bullish ? "BULLISH" : bearish ? "BEARISH" : "NEUTRAL/LOW_CONF";
  const trendStrength = Math.min(2.5, Math.abs(e20 - e50) / a14);
  const rsiStrength = Math.min(1, Math.abs(r14 - 50) / 18);
  const confidence = bullish || bearish ? Math.min(0.9, 0.56 + trendStrength * 0.08 + rsiStrength * 0.1) : Math.min(0.59, 0.5 + trendStrength * 0.025 + rsiStrength * 0.025);
  const tp = bullish ? entry + a14 * 1.5 : bearish ? entry - a14 * 1.5 : entry;
  const sl = bullish ? entry - a14 : bearish ? entry + a14 : entry;
  return { symbol: asset.model, bias, confidence: Number(confidence.toFixed(6)), entry: rp(entry), tp: rp(tp), sl: rp(sl), atr: rp(a14), gated: bias === "NEUTRAL/LOW_CONF" || confidence < 0.62, source_symbol: asset.symbol, source_bar_at: new Date(Number(latest.timestamp) * 1000).toISOString(), technicals: { timeframe: "15M", ema20: rp(e20), ema50: rp(e50), rsi14: Number(r14.toFixed(2)) } };
}

const pricesDoc = await readJson("cerberus_prices.json");
const latest = await readJson("cerberus_latest.json");
const status = await readJson("cerberus_runtime_status.json");
const klineDocs = Object.fromEntries(await Promise.all(["15M", "1H", "4H", "1D"].map(async (tf) => [tf, await readJson(`cerberus_klines_${tf}.json`)])));

for (const asset of ASSETS) {
  if (pricesDoc.prices?.[asset.symbol] && latest.instruments?.some((row) => row.symbol === asset.model)) continue;
  const [m15, h1, d1] = await Promise.all([
    fetchJson(url(asset.yahoo, "15m", "7d")),
    fetchJson(url(asset.yahoo, "1h", "60d")),
    fetchJson(url(asset.yahoo, "1d", "1y")),
  ]);
  const c15 = aggregate(candles(m15));
  const c1h = aggregate(candles(h1));
  const c4h = aggregate(candles(h1), 4);
  const c1d = aggregate(candles(d1));
  if (c15.length < 55) throw new Error(`${asset.symbol} Yahoo recovery has only ${c15.length} 15M candles`);
  pricesDoc.prices[asset.symbol] = quote(m15, asset.yahoo);
  klineDocs["15M"].candles[asset.symbol] = c15;
  klineDocs["1H"].candles[asset.symbol] = c1h;
  klineDocs["4H"].candles[asset.symbol] = c4h;
  klineDocs["1D"].candles[asset.symbol] = c1d;
  latest.instruments = (latest.instruments || []).filter((row) => row.symbol !== asset.model);
  latest.instruments.push(analyse(asset, c15));
  console.log(`[CERBERUS CRYPTO] ${asset.symbol} recovered through Yahoo Finance.`);
}

const symbolCount = Number(status?.coverage?.symbols || 33);
const expectedSeries = symbolCount * 4;
status.errors.market = (status?.errors?.market || []).filter((message) => !message.startsWith("BTC/USD:") && !message.startsWith("ETH/USD:"));
status.coverage.live_prices = Object.values(pricesDoc.prices || {}).filter((row) => row?.live === true && Number.isFinite(Number(row?.price))).length;
status.coverage.technical_instruments = Array.isArray(latest.instruments) ? latest.instruments.length : 0;
status.coverage.healthy_kline_series = Object.values(klineDocs).reduce((sum, doc) => sum + Object.values(doc.candles || {}).filter((rows) => Array.isArray(rows) && rows.length >= 50).length, 0);
status.coverage.expected_kline_series = expectedSeries;
status.healthy = status.coverage.live_prices >= Math.ceil(symbolCount * 0.7) && status.coverage.technical_instruments >= Math.ceil(symbolCount * 0.7) && status.coverage.healthy_kline_series >= Math.ceil(expectedSeries * 0.7);
status.crypto_recovery = { source: "Yahoo Finance", reason: "Binance may return HTTP 451 from GitHub-hosted runner regions", recovered_at: new Date().toISOString() };

await writeJson("cerberus_prices.json", pricesDoc);
for (const [tf, doc] of Object.entries(klineDocs)) await writeJson(`cerberus_klines_${tf}.json`, doc);
await writeJson("cerberus_latest.json", latest);
await writeJson("cerberus_runtime_status.json", status);
console.log(JSON.stringify({ live_prices: status.coverage.live_prices, technical_instruments: status.coverage.technical_instruments, healthy_kline_series: status.coverage.healthy_kline_series, expected_kline_series: expectedSeries }, null, 2));
