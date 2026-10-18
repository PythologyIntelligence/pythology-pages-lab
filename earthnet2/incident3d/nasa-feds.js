/**
 * NASA Earth Information Systems / Wildfire Tracking Lab — FEDS.
 * EXPERIMENTAL satellite-derived near-real-time research, not an official
 * operational perimeter or a validated burned scar.
 *
 * Two independent OGC API - Features collections:
 *  1) cumulative MODELLED fire-affected perimeter polygon (not burned area)
 *  2) active fire-line LINESTRING segment (not burning-area polygon)
 *
 * We never conflate fireid with EarthNet's EONET event ID. A nearby FEDS
 * track must be explicitly selected in the research panel by a human.
 * FEDS 't' is an algorithmic nominal overpass bucket (local solar time).
 */
import {geojsonGeometries} from './incident-data.js';
export const FEDS_SOURCE='https://openveda.cloud/api/features/collections';
export const FEDS_PERIMETER='public.eis_fire_lf_perimeter_nrt';
export const FEDS_FIRELINE='public.eis_fire_lf_fireline_nrt';
export const FEDS_CITATION='https://gis.earthdata.nasa.gov/portal/rest/services/FireTracking/veda_public_eis_fire_lf_fireline_nrt/MapServer/0/iteminfo';
const LIMIT=110,MAX_POINTS=5000;

export function eligibleFeds(event){
  return event?.category==='wildfire' &&
    Number.isFinite(Number(event.lat)) && Number.isFinite(Number(event.lon)) &&
    Number(event.lat)>=24 && Number(event.lat)<=75 &&
    Number(event.lon)>=-170 && Number(event.lon)<=-55;
}
export function fedsRequest(event,collection,now=Date.now()){
  if(!eligibleFeds(event)||![FEDS_PERIMETER,FEDS_FIRELINE].includes(collection))return null;
  const lat=Number(event.lat),lon=Number(event.lon);
  const dlat=.30,dlon=Math.min(.9,dlat/Math.max(.36,Math.cos(lat*Math.PI/180)));
  const a=new URL(FEDS_SOURCE+'/'+collection+'/items');
  a.searchParams.set('bbox',[lon-dlon,lat-dlat,lon+dlon,lat+dlat].map(x=>x.toFixed(5)).join(','));
  // Query recent overpasses only, avoiding the full multi-year archive.
  // The source's t field represents nominal local-solar buckets, NOT an
  // independently verified UTC ignition timestamp.
  a.searchParams.set('datetime',new Date(now-28*86400000).toISOString()+'/'+new Date(now).toISOString());
  a.searchParams.set('limit',String(LIMIT));
  return a.toString();
}
function fedsKey(p){
  const reg=String(p?.region||'');
  const fireid=Number(p?.fireid);
  if(!/^[\w-]{2,50}$/.test(reg)||!Number.isFinite(fireid)||fireid<0)return null;
  return reg+'|'+fireid;
}
function bucketTime(t){
  if(typeof t!=='string'||!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d/.test(t))return null;
  const time=Date.parse(t.slice(0,19)+'Z');
  return Number.isFinite(time) ? t.slice(0,19) : null;
}
function extent(geo){
  const points=[];
  for(const g of geo){
    const rings=g.type==='POLYGON'?g.coordinates:g.type==='LINESTRING'?[g.coordinates]:[];
    for(const ring of rings)for(const p of ring){
      if(!Array.isArray(p)||points.length>=MAX_POINTS)return null;
      points.push([p[0],p[1]]);
    }
  }
  if(!points.length)return null;
  return {minLon:Math.min(...points.map(p=>p[0])),maxLon:Math.max(...points.map(p=>p[0])),
    minLat:Math.min(...points.map(p=>p[1])),maxLat:Math.max(...points.map(p=>p[1]))};
}
function approxKm(a,b) {
  const rad=Math.PI/180;
  const dl=(a.lat-b.lat)*rad,dp=(a.lon-b.lon)*rad;
  const x=Math.sin(dl/2)**2+Math.cos(a.lat*rad)*Math.cos(b.lat*rad)*Math.sin(dp/2)**2;
  return 12742*Math.asin(Math.min(1,Math.sqrt(x)));
}
function featureRecords(input,kind) {
  if(!input || input.type!=='FeatureCollection'||!Array.isArray(input.features)) return [];
  const out=[];
  for(const feat of input.features.slice(0,LIMIT)){
    const p=feat?.properties,key=fedsKey(p),time=bucketTime(p?.t);
    if(!key||!time||feat.type!=='Feature')continue;
    const geometries=geojsonGeometries(feat.geometry)
      .filter(g=>kind==='area'?g.type==='POLYGON':g.type==='LINESTRING');
    if(!geometries.length||!extent(geometries))continue;
    out.push({key,time,region:String(p.region),fireid:Number(p.fireid),geometries,
      areaKm2:Number.isFinite(Number(p.farea))&&p.farea!=null?Number(p.farea):null,
      lowConfidence:p.low_confidence_grouping===1||p.low_confidence_grouping===true});
  }
  return out;
}
export function assembleFedsNearby(event,perimeterGeojson,firelineGeojson){
  if(!eligibleFeds(event))return [];
  const areas=featureRecords(perimeterGeojson,'area');
  const lines=featureRecords(firelineGeojson,'line');
  const groups=new Map();
  const add=(r,mode)=>{
    const k=r.key; if(!groups.has(k))groups.set(k,new Map());
    const frames=groups.get(k);
    if(!frames.has(r.time))frames.set(r.time,{time:r.time,area:null,front:null,areaKm2:null,lowConfidence:false});
    const frame=frames.get(r.time);
    frame[mode]=(frame[mode]||[]).concat(r.geometries).slice(0,10);
    if(mode==='area')frame.areaKm2=r.areaKm2;
    frame.lowConfidence ||= r.lowConfidence;
  };
  areas.forEach(r=>add(r,'area'));
  lines.forEach(r=>add(r,'front'));
  const options=[];
  for(const [key,map] of groups.entries()){
    const frames=[...map.values()].sort((a,b)=>a.time.localeCompare(b.time)).slice(-48);
    // Do not offer active-line-only grouping without a modelled area.
    const latestArea=[...frames].reverse().find(f=>f.area?.length);
    if(!latestArea)continue;
    const bbox=extent(latestArea.area);
    if(!bbox)continue;
    const pos={lon:Number(event.lon),lat:Number(event.lat)};
    const center={lon:(bbox.minLon+bbox.maxLon)/2,lat:(bbox.minLat+bbox.maxLat)/2};
    const near=approxKm(center,pos);
    const envelopeOverlap=pos.lon>=bbox.minLon-.12&&pos.lon<=bbox.maxLon+.12 &&
      pos.lat>=bbox.minLat-.12&&pos.lat<=bbox.maxLat+.12;
    if(near>35&&!envelopeOverlap)continue;
    options.push({key,distanceKm:Math.round(near),frames,latestTime:frames.at(-1).time,
      // Model identities are FEDS region/fireid. Never assert same EONET fire.
      association:'nearby FEDS algorithm track · NOT confirmed EarthNet incident'});
  }
  return options.sort((a,b)=>a.distanceKm-b.distanceKm).slice(0,5);
}
async function request(url,signal){
  const res=await fetch(url,{signal,redirect:'error',headers:{Accept:'application/geo+json'}});
  if(!res.ok)throw new Error('FEDS HTTP '+res.status);
  const length=Number(res.headers.get('content-length'));
  if(Number.isFinite(length)&&length>3_000_000)throw new Error('FEDS response too large');
  const raw=await res.text();
  if(raw.length>3_000_000)throw new Error('FEDS response too large');
  const value=JSON.parse(raw);
  if(value.type!=='FeatureCollection'||!Array.isArray(value.features))
    throw new Error('FEDS did not return GeoJSON FeatureCollection');
  return {value,truncated:Boolean(value.links?.some(l=>l.rel==='next')) ||
    value.features.length>=LIMIT};
}
export async function loadFedsNearby(event,{signal}={}){
  if(!eligibleFeds(event))return {options:[],truncated:false};
  const [perim,lines]=await Promise.all([
    request(fedsRequest(event,FEDS_PERIMETER),signal),
    request(fedsRequest(event,FEDS_FIRELINE),signal)
  ]);
  return {options:assembleFedsNearby(event,perim.value,lines.value),
    truncated:perim.truncated||lines.truncated};
}
