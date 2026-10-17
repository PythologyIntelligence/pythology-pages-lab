#!/usr/bin/env node
/**
 * Export a strictly public-safe Nemesis event projection from the *existing*
 * Windows VPS localhost Nemesis read API for GitHub Pages Lab.
 *
 * Run in the local git checkout. This does not publish anything, restart
 * services, access secrets or change the Nemesis source database.
 */
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import path from 'node:path';

const endpoint = process.env.ENVIROARC_NEMESIS_LOCAL_API || 'http://127.0.0.1:8100/api';
const pathname = path.resolve('earthnet2/data/enviroarc/nemesis.json');
const agoDays = 30;
const now = Date.now();
const limit = 1200;
function assert(condition, message) { if (!condition) throw Error(message); }
function numeric(v, low, high) {
  if(v === null || v === undefined || v === '') return null;
  const n=Number(v);
  return Number.isFinite(n) && n>=low && n<=high ? n : null;
}
function text(x,max) {return String(x??'').slice(0,max);}
function url(x) {
  if(!x) return null;
  try { const u=new URL(String(x));return u.protocol==='https:' ? u.href.slice(0,500) : null; }
  catch { return null; }
}
const target=new URL(endpoint);
assert(target.protocol==='http:' && ['127.0.0.1','localhost'].includes(target.hostname),
 'Refusing anything except a local Nemesis read-only endpoint');
assert(target.pathname === '/api' || target.pathname === '/api/',
 'Expected Nemesis /api route');
target.searchParams.set('action','events');
target.searchParams.set('limit',String(limit));
target.searchParams.set('minPrecision','2');
target.searchParams.set('excludeRetrospective','true');
target.searchParams.set('order','recent');
target.searchParams.set('from',new Date(now-agoDays*86400000).toISOString());

const res=await fetch(target,{signal:AbortSignal.timeout(10000),redirect:'error'});
assert(res.ok,'Nemesis local API returned HTTP '+res.status);
const raw=await res.text();
assert(raw.length < 20_000_000,'Nemesis response unexpectedly large');
const doc=JSON.parse(raw);
assert(doc && Array.isArray(doc.events),'Nemesis API did not return an events array');

const seen=new Set();
const events=[];
for (const e of doc.events) {
 const lat=numeric(e.lat,-90,90),lon=numeric(e.lon,-180,180);
 const gp=numeric(e.gp ?? e.geo_precision,0,4);
 const time=e.t ?? e.occurred_at;
 const ntime=typeof time==='number' ? (time<1e11 ? time*1000 : time) : Date.parse(time||'');
 const id=text(e.id,120);
 if(!id || !e.title || lat===null || lon===null || gp===null || gp<2 ||
   !Number.isFinite(ntime) || ntime<now-agoDays*86400000 || seen.has(id)) continue;
 seen.add(id);
 // Intentionally exclude cameras, human identities, actors, watchlists,
 // investigative data, ingestion notes and full raw records.
 events.push({
   id,title:text(e.title,200),c:text(e.c ?? e.category,80),
   lat,lon,gp,s:numeric(e.s ?? e.severity,0,10),
   t:new Date(ntime).toISOString(),
   conf:numeric(e.conf,0,1),
   url:url(e.url),src:text(e.src,130),place:text(e.place,140)
 });
}
assert(events.length <= limit,'Excess event count after projection');
assert(events.length > 0 || Number(doc.count) === 0,
 'Nemesis returned records, but no publishable incidents; refusing to overwrite last snapshot');
const previous=await readFile(pathname,'utf8').then(JSON.parse).catch(()=>null);
if(previous?.generatedAt &&
  Date.parse(previous.generatedAt) > now+60000) throw Error('Last snapshot timestamp is in the future');
const payload={
 source:'Nemesis',generatedAt:new Date(now).toISOString(),
 evidenceClass:'reported',degraded:false,
 sourceWindowDays:agoDays,events
};
await mkdir(path.dirname(pathname),{recursive:true});
await writeFile(pathname,JSON.stringify(payload),'utf8');
console.log('Nemesis LOCAL->Pages public-safe snapshot ready: '+events.length+' events; '+new Date(now).toISOString());
console.log('No private evidence/camera/watchlist data included. Git repo unchanged until commit.');
