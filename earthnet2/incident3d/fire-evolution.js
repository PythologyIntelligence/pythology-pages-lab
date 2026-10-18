/**
 * Fire evolution exchange contract v1.
 *
 * CRITICAL: The outer incident perimeter is NOT evidence that every interior
 * pixel is actively burning or already burned. No boundary is inferred from
 * NASA EONET, NASA FIRMS point detections, acreage, or a single perimeter.
 *
 * Supplementary (independent of Prometheus's source-only research feed):
 * {schemaVersion:1, producer:'Pythology Fire Evolution Geometry v1',
 *  generatedAt:'ISO',
 *  incidents:{[earthnetEventId]:{frames:[
 *    {validTime:'ISO',
 *     activeBurning:{evidenceClass:'official',source:'Agency',sourceUrl:'https://…',
 *                    geometry:{type:'Polygon',coordinates:[...] }},
 *     burnedArea:{evidenceClass:'official',source:'Agency',sourceUrl:'https://…',
 *                 geometry:{type:'Polygon',coordinates:[...] }}}
 *  ]}}}
 *
 * Either feature can be absent. Shapes are independent observations and may
 * be published at different valid times; no interpolation or subtractive
 * difference is used to manufacture burned ground. "hypothetical" is permitted
 * ONLY for the separately flagged demonstration data.
 */
import {geojsonGeometries} from './incident-data.js';

export const FIRE_PRODUCER = 'Pythology Fire Evolution Geometry v1';
const REAL_EVIDENCE = new Set(['official','observed']);
const ALL_EVIDENCE = new Set(['official','observed','hypothetical']);
const MAX_FRAMES = 120;
const MAX_POLYGONS = 36;

function isoTime(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d\d-\d\dT/.test(value)) return null;
  const n = Date.parse(value);
  return Number.isFinite(n) ? new Date(n).toISOString() : null;
}
function sourceUrl(url) {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' && !u.username && !u.password ? u.href : null;
  } catch { return null; }
}
function fireLayer(value, frameTime, demo) {
  if (!value || typeof value !== 'object') return null;
  const evidenceClass = String(value.evidenceClass || '');
  if (!(demo ? ALL_EVIDENCE : REAL_EVIDENCE).has(evidenceClass)) return null;
  const time=isoTime(value.validTime || frameTime);
  const ref=sourceUrl(value.sourceUrl);
  const source=typeof value.source === 'string' ? value.source.trim() : '';
  if (!time || !source || source.length>150 || !ref) return null;
  const geometries = geojsonGeometries(value.geometry)
    .filter(g=>g.type==='POLYGON').slice(0,MAX_POLYGONS);
  if (!geometries.length) return null;
  return {evidenceClass,validTime:time,source,sourceUrl:ref,geometries};
}
function snapshotFrame(frame,demo) {
  const validTime=isoTime(frame?.validTime);
  if (!validTime) return null;
  const activeBurning=fireLayer(frame.activeBurning,validTime,demo);
  const burnedArea=fireLayer(frame.burnedArea,validTime,demo);
  if (!activeBurning && !burnedArea) return null;
  return {validTime,activeBurning,burnedArea};
}
export function normalizeFireEvolution(value,{demo=false}={}) {
  if (!value || !Array.isArray(value.frames)) return [];
  const uniq = new Map();
  // Deterministic replacement is allowed for provider corrections to the
  // exact same timestamp; area can legitimately shrink after corrections.
  for (const frame of value.frames.slice(0,MAX_FRAMES)) {
    const f=snapshotFrame(frame,demo);
    if (f) uniq.set(f.validTime,f);
  }
  return [...uniq.values()].sort((a,b)=>Date.parse(a.validTime)-Date.parse(b.validTime));
}
export function usableFireFeed(doc, feedTime,{demo=false, now=Date.now()}={}) {
  if (demo) {
    if (doc?.schemaVersion!==1 || doc?.demo!==true) return {status:'invalid',incidents:{}};
  } else {
    if (doc?.schemaVersion!==1 || doc?.producer!==FIRE_PRODUCER ||
        doc?.demo === true) return {status:'invalid',incidents:{}};
    const generated=Date.parse(doc.generatedAt),feed=Date.parse(feedTime);
    if (!Number.isFinite(generated)||!Number.isFinite(feed)||
        generated>now+600_000 || generated>feed+600_000 ||
        now-generated>6*3600_000 || feed-generated>6*3600_000)
      return {status:'stale',incidents:{}};
  }
  if (!doc.incidents || typeof doc.incidents !== 'object' ||
      Array.isArray(doc.incidents)) return {status:'invalid',incidents:{}};
  const incidents={};
  for(const [id,value] of Object.entries(doc.incidents).slice(0,800)){
    if (typeof id!=='string' || id.length>200 || !id) continue;
    const frames=normalizeFireEvolution(value,{demo});
    if(frames.length)incidents[id]={frames};
  }
  return {status:'available',incidents};
}
/** Choose fire evolution first. Tracks and other event frames remain separate. */
export function firePlayback(incident,fire) {
  if (incident?.category==='wildfire' && Array.isArray(fire?.frames) && fire.frames.length)
    return {kind:'fire',items:fire.frames};
  return null;
}
