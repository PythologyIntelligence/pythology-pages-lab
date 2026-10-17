#!/usr/bin/env node
/**
 * Public GitHub Pages-only EnviroArc bundle.
 * No private credentials, on-demand model calls, writes to providers, or VPS
 * localhost access. Used after scripts/build-lab.sh has staged the base site.
 */
import { cp, mkdir, readFile, writeFile, stat } from 'node:fs/promises';
import path from 'node:path';

const home = process.cwd();
const out = path.join(home, '_site');
const app = path.join(out, 'earthnet2');
const remoteEarth = 'https://earthnet.pythology.co.nz';
const arcus = 'https://gfmsovcfkjp7nlwy7tsw5vnll40hieeh.lambda-url.ap-southeast-1.on.aws/';
const nemesis = 'https://d29t5hf9bjiz4p.cloudfront.net/api';
const maxBytes = 20 * 1024 * 1024;
const report = {};

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
async function readJson(url, timeoutMs = 12000) {
  assert(url.startsWith('https://'), 'Only public HTTPS upstreams are allowed');
  const response = await fetch(url, {
    signal: AbortSignal.timeout(timeoutMs),
    redirect: 'error', headers: {Accept:'application/json'}
  });
  if (!response.ok) throw new Error('Upstream HTTP ' + response.status);
  const announced = Number(response.headers.get('content-length') || 0);
  if (announced > maxBytes) throw new Error('Upstream response too large');
  const text = await response.text();
  if (text.length > maxBytes) throw new Error('Upstream response too large');
  const result = JSON.parse(text);
  assert(result && typeof result === 'object' && !Array.isArray(result),
    'Expected a JSON object');
  return result;
}
async function saveJson(relative, value) {
  const where = path.join(app, relative);
  await mkdir(path.dirname(where), {recursive:true});
  await writeFile(where, JSON.stringify(value), 'utf8');
}
function asFinite(v, low, high) {
  if (v === undefined || v === null || v === '') return null;
  const x = Number(v);
  return Number.isFinite(x) && x >= low && x <= high ? x : null;
}
function short(s, max = 300) { return String(s ?? '').slice(0,max); }
function secureUrl(s) {
  if (!s) return null;
  try {
    const u = new URL(String(s));
    return u.protocol === 'https:' ? u.href.slice(0,500) : null;
  } catch { return null; }
}
async function stageFeed() {
  const feed = await readJson(remoteEarth + '/media/feed/feed.json', 18000);
  // This must be the actual EarthNet2 schema; never claim v3 events as v2.
  assert(Array.isArray(feed.events) && feed.events.length > 0,
    'No valid public EarthNet 2.0 event snapshot: refusing cutover');
  assert(feed.meta && typeof feed.meta === 'object',
    'EarthNet 2.0 feed metadata missing: refusing cutover');
  await saveJson('media/feed/feed.json',feed);
  report.earthnet = {events:feed.events.length,
    observedAt:feed.meta.generatedAt || null};
  for (const name of ['detail','enviroarc','solar']) {
    try {
      const optional = await readJson(remoteEarth + '/media/feed/' + name + '.json', 10000);
      await saveJson('media/feed/' + name + '.json',optional);
      report[name] = 'available';
    } catch (err) {
      report[name] = 'unavailable';
      console.warn('[EnviroArc] optional ' + name + ': ' + err.message);
    }
  }
}
async function stageArcus() {
  try {
    // Status first: do not trigger a cold expensive AI synthesis when no
    // previously generated ARCUS brief exists. Normal ARCUS ?action=brief
    // returns the stored brief instantly with allowStale=true.
    const state = await readJson(arcus + '?action=status', 9000);
    if (!state.brief) throw new Error('No previously stored ARCUS brief');
    const raw = await readJson(arcus + '?action=brief', 9000);
    assert(Array.isArray(raw.theaters), 'Missing ARCUS theatre array');
    const theatres = raw.theaters.slice(0,120).flatMap(t => {
      const lat = asFinite(t.lat,-90,90), lon = asFinite(t.lon,-180,180);
      if (!t.id || !t.name || lat === null || lon === null) return [];
      return [{
        id:short(t.id,120), name:short(t.name,200), lat,lon,
        category:short(t.category,80),country:short(t.country,120),
        region:short(t.region,120),tier:short(t.tier,80),
        trend:short(t.trend,80),status:short(t.status,350),
        summary:short(t.summary,1600),
        severity:asFinite(t.severity,0,100),
        confidence:asFinite(t.confidence,0,1)
      }];
    });
    const ts=Number(raw.generatedAt || state.brief);
    const age=Number.isFinite(ts) ? Date.now()-ts : Infinity;
    await saveJson('data/enviroarc/arcus.json',{
      source:'ARCUS', generatedAt: raw.generatedAt || state.brief,
      evidenceClass:'inferred', degraded: !!raw.degraded || age > 60*60*1000,
      theaters:theatres
    });
    report.arcus={theatres:theatres.length,stale:age>60*60*1000};
  } catch(e) {
    await saveJson('data/enviroarc/arcus.json',{
      source:'ARCUS',unavailable:true,degraded:true,generatedAt:null,theaters:[]
    });
    report.arcus={unavailable:true};
    console.warn('[EnviroArc] ARCUS cache unavailable:',e.message);
  }
}
async function stageNemesis() {
  try {
    const u=new URL(nemesis);
    u.searchParams.set('action','events');
    u.searchParams.set('limit','1200');
    u.searchParams.set('minPrecision','2');
    u.searchParams.set('excludeRetrospective','true');
    u.searchParams.set('from',new Date(Date.now()-30*24*3600_000).toISOString());
    const raw=await readJson(u.href,12000);
    assert(Array.isArray(raw.events),'Missing Nemesis incident array');
    const since=Date.now()-30*24*3600_000;
    const events=raw.events.slice(0,2500).flatMap(e=>{
      const lat=asFinite(e.lat,-90,90),lon=asFinite(e.lon,-180,180);
      const gp=asFinite(e.gp ?? e.geo_precision,0,10);
      const id=short(e.id,120);
      const time=e.t ?? e.occurred_at;
      const parsed=typeof time==='number' ? (time<1e11 ? time*1000 : time)
        : Date.parse(time ?? '');
      if (!id || !e.title || lat===null || lon===null ||
          gp===null || gp<2 || !Number.isFinite(parsed) || parsed<since) return [];
      // Public incident projection only. Never ship the original raw Nemesis
      // watchlists, people, camera sources, actors or investigation metadata.
      return [{
        id,title:short(e.title,200),c:short(e.c ?? e.category,80),
        lat,lon,gp,s:asFinite(e.s ?? e.severity,0,10),
        t:new Date(parsed).toISOString(),
        conf:asFinite(e.conf,0,1),url:secureUrl(e.url),
        src:short(e.src,130),place:short(e.place,140),
        country_name:short(e.country_name,100)
      }];
    });
    await saveJson('data/enviroarc/nemesis.json',{
      source:'Nemesis',generatedAt:raw.generatedAt || Date.now(),
      evidenceClass:'reported',degraded:!!raw.degraded,events
    });
    report.nemesis={events:events.length};
  } catch(e) {
    await saveJson('data/enviroarc/nemesis.json',{
      source:'Nemesis',unavailable:true,degraded:true,
      generatedAt:null,events:[]
    });
    report.nemesis={unavailable:true};
    console.warn('[EnviroArc] Nemesis public API unavailable:',e.message);
  }
}
function redirect(to) {
  // Redirects are human-facing compatibility routes, not JSON API aliases.
  const location = JSON.stringify(to);
  return '<!doctype html><html lang="en"><head><meta charset="utf-8">' +
    '<title>EarthNet — EnviroArc</title>' +
    '<meta http-equiv="refresh" content="0;url=' + to + '">' +
    '<meta name="robots" content="noindex,follow"></head><body>' +
    '<p>Opening the unified EarthNet globe… ' +
    '<a href="' + to + '">Continue</a></p>' +
    '<script>const u=new URL(' + location + ',location.href);' +
    'u.search=location.search;u.hash=location.hash;location.replace(u.href);</script>' +
    '</body></html>';
}
async function stageRoutes() {
  await writeFile(path.join(out,'EarthNet.html'),redirect('earthnet2/'));
  await writeFile(path.join(out,'earthnet.html'),redirect('earthnet2/'));
  // Preserve the complete previous EarthNet Global viewer for rollback.
  const old=path.join(out,'earthnet-global');
  try {
    const info=await stat(path.join(old,'index.html'));
    if(info.isFile()){
      await cp(old,path.join(out,'earthnet-global-legacy'),{recursive:true,force:true});
      await writeFile(path.join(old,'index.html'),redirect('../EarthNet.html'));
    }
  } catch (err) {
    console.warn('[EnviroArc] legacy EarthNet Global route absent:',err.message);
  }

  // Update only the Pages Lab deployment's main EarthNet navigation.
  // Do not change the source Pythology marketing website mirror or origin DNS.
  for (const filename of ['index.html','enviroarc.html','earthnet-platform.html']) {
    const pathname=path.join(out,filename);
    try {
      const old=await readFile(pathname,'utf8');
      const updated=old.replaceAll('https://earthnet.pythology.co.nz/','EarthNet.html');
      if (updated!==old) await writeFile(pathname,updated);
    } catch { /* optional page */ }
  }
}
await cp(path.join(home,'earthnet2'),app,{recursive:true,force:true});
assert((await readFile(path.join(app,'index.html'),'utf8')).includes('btn-geography'),
  'Not the tested unified EarthNet globe');
await stageFeed();
await Promise.all([stageArcus(),stageNemesis()]);
await stageRoutes();
assert((await readFile(path.join(out,'EarthNet.html'),'utf8')).includes('earthnet2/'),
  'EarthNet compatibility entry missing');
assert((await readFile(path.join(app,'app','config.js'),'utf8')).includes('./media/feed/feed.json'),
  'GitHub Pages relative feed path missing');
console.log('[EnviroArc] unified Pages globe staged:',JSON.stringify(report));
