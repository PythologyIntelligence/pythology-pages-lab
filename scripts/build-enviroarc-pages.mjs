#!/usr/bin/env node
/**
 * Public GitHub Pages-only EnviroArc bundle.
 * No private credentials, on-demand model calls, writes to providers, or VPS
 * localhost access. Used after scripts/build-lab.sh has staged the base site.
 */
import { cp, mkdir, readFile, writeFile, stat } from 'node:fs/promises';
import path from 'node:path';
import {buildResearchSnapshot} from './prometheus-enviroarc-screening.mjs';

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
  let detailForResearch=null;
  let upstreamResearchAvailable=false;
  for (const name of ['detail','enviroarc','solar','incident3d','fire3d']) {
    try {
      const optional = await readJson(remoteEarth + '/media/feed/' + name + '.json', 10000);
      if (name === 'fire3d') {
        // Official active-burning zones, burned areas and incident perimeters
        // are DIFFERENT datasets; this is an optional separately validated
        // fire-evolution snapshot, not derived from NASA hotspots or acres.
        const published=Date.parse(optional?.generatedAt);
        const currentFeed=Date.parse(feed?.meta?.generatedAt);
        if(optional.schemaVersion !== 1 ||
            optional.producer !== 'Pythology Fire Evolution Geometry v1' ||
            optional.demo === true ||
            !optional.incidents || Array.isArray(optional.incidents) ||
            typeof optional.incidents !== 'object' ||
            ![published,currentFeed].every(Number.isFinite) ||
            published > Date.now()+600_000 || Date.now()-published > 6*3600_000 ||
            published > currentFeed+600_000 || currentFeed-published>6*3600_000) {
          throw new Error('Unverified/stale fire-evolution geometry snapshot');
        }
      }
      if (name === 'incident3d') {
        // Browser validates every event again. The Pages mirror must NEVER
        // publish fictional, unknown or outdated Prometheus research.
        const generatedAt = Date.parse(optional?.meta?.generatedAt);
        const feedAt = Date.parse(feed?.meta?.generatedAt);
        const sourceAt = Date.parse(optional?.meta?.sourceGeneratedAt);
        if (optional.schemaVersion !== 1 ||
            optional.meta?.producer !== 'Prometheus Subterranean / EnviroArc research bridge' ||
            optional.meta?.containsForecasts !== false ||
            optional.meta?.realTime !== false ||
            optional.meta?.containsApprovedInterventions !== false ||
            !optional.incidents || typeof optional.incidents !== 'object' ||
            ![generatedAt,feedAt,sourceAt].every(Number.isFinite) ||
            generatedAt > Date.now()+600_000 || Date.now()-generatedAt>3*3600_000 ||
            sourceAt > feedAt + 600_000 || feedAt-sourceAt>3*3600_000)
          throw new Error('Invalid, unrecognised or stale Prometheus research');
      }
      await saveJson('media/feed/' + name + '.json',optional);
      if(name === 'detail') detailForResearch=optional;
      if(name === 'incident3d') upstreamResearchAvailable=true;
      report[name] = 'available';
    } catch (err) {
      report[name] = 'unavailable';
      console.warn('[EnviroArc] optional ' + name + ': ' + err.message);
    }
  }
  // If the Windows VPS has not yet published its screened research, run the
  // SAME deterministic Prometheus screening module from the *current public*
  // EarthNet data during this already-scheduled GitHub Pages refresh.
  // No external LLM, VPS login, AWS write, secrets or forecasts. This is
  // plainly tagged as a Pages-built source screening, NOT a live VPS model.
  if (!upstreamResearchAvailable && detailForResearch) {
    try {
      const screening=buildResearchSnapshot(feed,detailForResearch);
      screening.meta.executionEnvironment='GitHub Pages read-only scheduled build';
      screening.meta.researchLimitations='Source observations only; no causal or future hazard model';
      await saveJson('media/feed/incident3d.json',screening);
      report.incident3d={
        status:'available',
        mode:'Prometheus deterministic screening in Pages build',
        screened:screening.meta.screenedCount,
      };
    } catch(err) {
      console.warn('[EnviroArc] Prometheus source screen unavailable:',err.message);
      report.incident3d={status:'unavailable',reason:'source age/integrity gates'};
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
  // Source from the VPS's public-safe export if it is fresh. GitHub Actions
  // cannot call 127.0.0.1:8100 on the Windows VPS. The older CloudFront API
  // is a secondary fallback, not the sole source of truth for this layer.
  const localSnapshot=path.join(home,'earthnet2/data/enviroarc/nemesis.json');
  let local=null;
  try {
    const data=JSON.parse(await readFile(localSnapshot,'utf8'));
    if (data?.source==='Nemesis' && Array.isArray(data.events) &&
        data.events.length<=2500 && !data.unavailable &&
        data.events.every(e=>e.id && e.title &&
          asFinite(e.lat,-90,90)!==null && asFinite(e.lon,-180,180)!==null &&
          asFinite(e.gp,2,4)!==null && /^https?:/.test(String(e.t||''))===false)) {
      local=data;
    }
  } catch { /* no safe export has been committed yet */ }
  const localAge=local?.generatedAt ? Date.now()-Date.parse(local.generatedAt) : Infinity;
  if(local && Number.isFinite(localAge) && localAge>=0 && localAge<90*60_000) {
    await saveJson('data/enviroarc/nemesis.json',local);
    report.nemesis={events:local.events.length,source:'vps-sanitized',ageMinutes:Math.round(localAge/60000)};
    return;
  }
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
    // The last verified projection is more truthful than an invented zero
    // incident count, but must explicitly show STALE. Old data may still be
    // useful historically; avoid retaining snapshots older than seven days.
    if(local && Number.isFinite(localAge) && localAge>=0 &&
       localAge<7*86400000) {
      await saveJson('data/enviroarc/nemesis.json',{
        ...local,degraded:true,
        staleReason:'The VPS publisher has not refreshed the Nemesis snapshot',
        staleAt:new Date().toISOString()
      });
      report.nemesis={events:local.events.length,stale:true,source:'vps-last-known'};
    } else {
      await saveJson('data/enviroarc/nemesis.json',{
        source:'Nemesis',unavailable:true,degraded:true,
        generatedAt:null,events:[]
      });
      report.nemesis={unavailable:true,reason:'Nemesis public API unavailable and no recent VPS export'};
    }
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
