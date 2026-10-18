/**
 * Mirror of Pythology Prometheus Subterranean EnviroArc deterministic screen.
 * Source: PythologyIntelligence/Prometheus-Subterranean @ feat/prometheus-enviroarc-earthnet-bridge
 * This runs as a PUBLIC GitHub Pages build step, not a VPS forecast engine.
 * Keep the algorithms and provenance identifiers consistent across repositories.
 */
/**
 * Prometheus × EnviroArc — evidence screening, v1.
 * Uses current EarthNet source records only. There is NO fire-spread model,
 * storm impact forecast, eruption prediction, or causal engine in this module.
 */
export const SUPPORTED = new Set([
  'wildfire', 'cyclone', 'severe_storm', 'tornado',
  'flood', 'atmospheric_river', 'landslide', 'volcano',
]);
export const SCHEMA_VERSION = 1;
export const MAX_RESEARCH_EVENTS = 800;
export const MAX_FEED_AGE_MS = 3 * 60 * 60_000;
const MAX_EVENT_AGE_MS = 45 * 24 * 60 * 60_000;

const validDate = value => {
  const t = Date.parse(value);
  return Number.isFinite(t) ? t : null;
};
const okCoord = (lat,lon) => Number.isFinite(Number(lat)) && Math.abs(Number(lat))<=90 &&
  Number.isFinite(Number(lon)) && Math.abs(Number(lon))<=180;
const clampText = (s, max=240) => String(s ?? '').replace(/[\x00-\x1f\x7f]/g,' ').trim().slice(0,max);

export function geodesicKm(a,b) {
  const rad=Math.PI/180;
  const p1=Number(a.lat)*rad,p2=Number(b.lat)*rad;
  const dlat=(Number(b.lat)-Number(a.lat))*rad;
  const dlon=(Number(b.lon)-Number(a.lon))*rad;
  const f=Math.sin(dlat/2)**2+Math.cos(p1)*Math.cos(p2)*Math.sin(dlon/2)**2;
  return 6371.0088*2*Math.asin(Math.min(1,Math.sqrt(f)));
}

export function trackObservation(track) {
  if (!Array.isArray(track)) return null;
  const points=track.filter(p=>p&&okCoord(p.lat,p.lon)&&validDate(p.ts)!==null)
    .slice(0,2000).sort((a,b)=>validDate(a.ts)-validDate(b.ts));
  if(points.length<2) return null;
  const start=points.at(-2),end=points.at(-1);
  const hours=(validDate(end.ts)-validDate(start.ts))/3600_000;
  if(hours<=0) return null;
  return {
    fixCount:points.length,
    startTime:start.ts,endTime:end.ts,
    intervalHours:Math.round(hours*10)/10,
    displacementKm:Math.round(geodesicKm(start,end)),
  };
}

export function screenEvent(event, detail, generatedAt) {
  if(!event || !SUPPORTED.has(event.category) ||
    !okCoord(event.lat,event.lon) || !clampText(event.id,200) ||
    !clampText(event.source,100)) return null;
  const observedAt=event.updatedAt || event.lastSeen || event.startsAt;
  const observed=validDate(observedAt), generated=validDate(generatedAt);
  if(observed===null || generated===null ||
     observed>generated+10*60_000 || generated-observed>MAX_EVENT_AGE_MS) return null;

  const category=clampText(event.category,80).replaceAll('_',' ');
  const source=clampText(event.source,100);
  const title=clampText(event.title,150);
  const facts=[
    'EarthNet currently lists '+(title || 'an event')+' as '+category+'.',
    'The reported position is '+Number(event.lat).toFixed(3)+'°, '+Number(event.lon).toFixed(3)+'°.',
    'Its '+source+' source record was last updated '+new Date(observed).toISOString()+'.'
  ];
  const t=trackObservation(detail?.track);
  if(t){
    facts.push('The two latest timestamped position fixes span '+t.intervalHours+
      ' h with approximately '+t.displacementKm+
      ' km centre displacement. This is a recorded position change, not a motion forecast or impact radius.');
  }
  const hasGeometry=Boolean(detail?.polygon?.type && Array.isArray(detail.polygon.coordinates));
  if(hasGeometry) facts.push(event.category==='wildfire'
    ? 'An event-area geometry was supplied, but it has not been verified as an operational fire perimeter.'
    : 'A source event-area geometry was supplied; its purpose and authority must be checked against the original provider.');
  else facts.push('No source event footprint was supplied for this screening.');
  facts.push('Prometheus has not established a causal mechanism, predicted progression, or evaluated an intervention for this event.');

  const refs=['earthnet-event:'+clampText(event.id,200)];
  let sourceUrl=null;
  try {
    const u=new URL(event.sourceUrl);
    if(['https:','http:'].includes(u.protocol)) sourceUrl=u.href.slice(0,600);
  } catch {}
  if(sourceUrl) refs.push(sourceUrl);

  return {
    frames:[],overlays:[],
    assessment:{
      status:'research',
      source:'Prometheus EnviroArc evidence screen v1 (deterministic, not a causal model)',
      generatedAt,
      summary:facts.join(' '),
      evidenceRefs:refs,
      uncertainty:'Source location/time/geometry has not been independently checked. No causal attribution, hazard-area prediction, forecast or emergency recommendation. Refer to the originating agency.',
    }
  };
}

export function buildResearchSnapshot(feed,detail,{now=new Date().toISOString()}={}){
  const generated=validDate(now);
  const sourceTime=validDate(feed?.meta?.generatedAt);
  if(!generated || !sourceTime) throw new Error('Missing valid current/source timestamps');
  if(feed?.meta?.demo === true) throw new Error('Cannot publish synthetic exercise feed');
  if(sourceTime>generated+10*60_000 || generated-sourceTime>MAX_FEED_AGE_MS)
    throw new Error('EarthNet source feed is stale or future-dated');
  if(!Array.isArray(feed?.events) || !detail || typeof detail!=='object' || Array.isArray(detail))
    throw new Error('Malformed EarthNet feed/detail');
  const candidates=feed.events.filter(e=>SUPPORTED.has(e?.category))
    .sort((a,b)=>(validDate(b.updatedAt)||0)-(validDate(a.updatedAt)||0));
  const incidents={};
  for(const ev of candidates){
    if(Object.keys(incidents).length>=MAX_RESEARCH_EVENTS) break;
    if(typeof ev.id!=='string' || ev.id.length>200 || Object.hasOwn(incidents,ev.id)) continue;
    const result=screenEvent(ev,detail[ev.id],now);
    if(result) incidents[ev.id]=result;
  }
  return {
    schemaVersion:SCHEMA_VERSION,
    meta:{
      producer:'Prometheus Subterranean / EnviroArc research bridge',
      methodology:'deterministic source-record screening; unvalidated; no hazard predictions',
      generatedAt:now,
      sourceGeneratedAt:new Date(sourceTime).toISOString(),
      source:'EarthNet public hazard feed and detail snapshot',
      screenedCount:Object.keys(incidents).length,
      eligibleCount:candidates.length,
      realTime:false,
      containsForecasts:false,
      containsApprovedInterventions:false,
    },
    incidents
  };
}
