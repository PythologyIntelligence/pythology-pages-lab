/**
 * NIFC WFIGS "Current" public interagency FIRE PERIMETERS.
 * Official reported *incident perimeter*, NOT an active flame boundary,
 * a fully burned area, a satellite heat outline, or operational advice.
 *
 * Public ArcGIS FeatureServer layer explicitly supports f=geojson. We query
 * a small bounding box near a user-selected US wildfire. No API key.
 * We show NEARBY shapes as a separate map layer; coordinates do not prove
 * they correspond to the EarthNet EONET event ID or incident name.
 */
import {geojsonGeometries} from './incident-data.js';

export const NIFC_LAYER =
  'https://services3.arcgis.com/T4QMspbfLg3qTGWY/ArcGIS/rest/services/WFIGS_Interagency_Perimeters_Current/FeatureServer/0';
export const NIFC_INFO_URL = NIFC_LAYER;
const MAX_POLYS = 15;
const MAX_POLYGON_POINTS = 5500;
const MAX_AGE_DAYS = 35;

export function eligibleUSFire(event) {
  return event?.category === 'wildfire' &&
    Number.isFinite(Number(event.lat)) && Number.isFinite(Number(event.lon)) &&
    // USA incl mainland, AK, HI; envelope includes adjacent Canada/Mexico,
    // which is why a null result is normal and must not be called "unavailable US data."
    Number(event.lat) >= 18 && Number(event.lat) <= 72 &&
    Number(event.lon) >= -169 && Number(event.lon) <= -65;
}

/**
 * EarthNet's public NASA EONET feed classifies BOTH wildfires and prescribed
 * burns under "wildfire". WFIGS correctly distinguishes WF and RX. If the
 * source event explicitly identifies a prescribed burn, we must query RX.
 * Never reclassify it as an uncontrolled wildfire to get a polygon.
 */
export function nifcTypeForEvent(event) {
  if (!eligibleUSFire(event)) return null;
  const label=[event.title,event.subtype].filter(Boolean).join(' ').toLowerCase();
  return /\b(?:prescribed\s+(?:fire|burn)|controlled\s+burn|rx\s+(?:fire|burn))\b/.test(label)
    ? 'RX' : 'WF';
}

export function perimeterQuery(event) {
  if (!eligibleUSFire(event)) return null;
  const lat=Number(event.lat),lon=Number(event.lon);
  const cos=Math.max(0.30,Math.cos(lat*Math.PI/180));
  const radiusLat=.20, radiusLon=Math.min(.75,radiusLat/cos);
  const params=new URLSearchParams({
    where:"attr_IncidentTypeCategory='"+nifcTypeForEvent(event)+"'",
    geometry:[lon-radiusLon,lat-radiusLat,lon+radiusLon,lat+radiusLat]
      .map(n=>n.toFixed(5)).join(','),
    geometryType:'esriGeometryEnvelope',
    inSR:'4326',
    outSR:'4326',
    spatialRel:'esriSpatialRelIntersects',
    outFields:[
      'OBJECTID','poly_IncidentName','attr_IncidentName','poly_IRWINID',
      'poly_PolygonDateTime','poly_GISAcres','poly_DeleteThis','poly_FeatureAccess',
      'poly_FeatureStatus','poly_FeatureCategory','poly_IsVisible',
      'attr_IncidentTypeCategory'
    ].join(','),
    returnGeometry:'true',f:'geojson',
    geometryPrecision:'5',maxAllowableOffset:'0.00015',
    resultRecordCount:String(MAX_POLYS)
  });
  return NIFC_LAYER+'/query?'+params.toString();
}

function isoStamp(value){
  const n=typeof value === 'number' ? value : Date.parse(value);
  return Number.isFinite(n) && n>0 ? new Date(n).toISOString() : null;
}
function geometryExtent(shape){
  const points=[];
  for(const geom of geojsonGeometries(shape).filter(g=>g.type==='POLYGON')){
    for(const ring of geom.coordinates) for(const [lon,lat] of ring){
      if(points.length>MAX_POLYGON_POINTS) return null;
      points.push([lon,lat]);
    }
  }
  if(!points.length)return null;
  return {
    minLon:Math.min(...points.map(p=>p[0])),
    maxLon:Math.max(...points.map(p=>p[0])),
    minLat:Math.min(...points.map(p=>p[1])),
    maxLat:Math.max(...points.map(p=>p[1]))
  };
}
function distanceKm(p,q){
  const rad=Math.PI/180, dl=(Number(q.lat)-p.lat)*rad;
  const dp=(Number(q.lon)-p.lon)*rad;
  const a=Math.sin(dl/2)**2 +
    Math.cos(p.lat*rad)*Math.cos(Number(q.lat)*rad)*Math.sin(dp/2)**2;
  return 6371*2*Math.asin(Math.min(1,Math.sqrt(a)));
}
function centre(extent){
  return {lon:(extent.minLon+extent.maxLon)/2,lat:(extent.minLat+extent.maxLat)/2};
}
function nearFeature(event,feature) {
  const extent=geometryExtent(feature.geometry);
  if(!extent)return null;
  const pos={lon:Number(event.lon),lat:Number(event.lat)};
  // Because incident coordinates can be approximate, require a conservative
  // proximity constraint even though the server query already used a bbox.
  const km=distanceKm(pos,centre(extent));
  const insideEnvelope=pos.lon>=extent.minLon && pos.lon<=extent.maxLon &&
    pos.lat>=extent.minLat && pos.lat<=extent.maxLat;
  if (!insideEnvelope && km>32) return null;
  return {extent,km:Math.round(km),insideEnvelope};
}
export function screenNifcFeatures(event,collection,{now=Date.now()}={}){
  if(!eligibleUSFire(event)||collection?.type!=='FeatureCollection'||
      !Array.isArray(collection.features)) return [];
  const good=[];
  for(const feature of collection.features.slice(0,MAX_POLYS)){
    if(feature?.type!=='Feature'||!feature.geometry||
      !['Polygon','MultiPolygon'].includes(feature.geometry.type)) continue;
    const a=feature.properties||{};
    if(a.attr_IncidentTypeCategory !== nifcTypeForEvent(event))continue;
    if(a.poly_FeatureAccess && a.poly_FeatureAccess !== 'Public')continue;
    if(a.poly_IsVisible && a.poly_IsVisible !== 'Yes')continue;
    if(a.poly_DeleteThis === 'Yes')continue;
    const time=isoStamp(a.poly_PolygonDateTime);
    // The "Current" view may still have older final boundary entries. Require
    // a source per-polygon timestamp, and do not display old boundaries as current.
    if(!time || now-Date.parse(time)>MAX_AGE_DAYS*86400000 ||
        Date.parse(time)>now+10*60000) continue;
    const proximity=nearFeature(event,feature);
    if(!proximity)continue;
    const geoms=geojsonGeometries(feature.geometry)
      .filter(g=>g.type==='POLYGON').slice(0,10);
    if(!geoms.length)continue;
    const label=String(a.poly_IncidentName || a.attr_IncidentName || 'Unnamed NIFC incident').slice(0,90);
    good.push({
      label,
      time,
      source:'US National Interagency Fire Center · WFIGS Current '+
        (a.attr_IncidentTypeCategory==='RX'?'Prescribed Fire':'Wildfire')+' Perimeters',
      sourceFireClass:a.attr_IncidentTypeCategory,
      sourceUrl:NIFC_INFO_URL,
      acres:a.poly_GISAcres != null && Number.isFinite(Number(a.poly_GISAcres)) ? Number(a.poly_GISAcres) : null,
      distanceFromEventKm:proximity.km,
      positionInsideBoundingBox:proximity.insideEnvelope,
      // The event identity is not independently verified. Never call this a
      // "matched" EarthNet event, even if the polygon is nearby or same named.
      association:'nearby · unconfirmed incident identity',
      geometries:geoms
    });
  }
  return good.sort((a,b)=>a.distanceFromEventKm-b.distanceFromEventKm).slice(0,5);
}

export async function queryNifcPerimeters(event,{signal}={}){
  const url=perimeterQuery(event);
  if(!url)return {status:'out-of-region',items:[]};
  const res=await fetch(url,{signal,redirect:'error',headers:{Accept:'application/geo+json'}});
  if(!res.ok)throw new Error('NIFC perimeter query HTTP '+res.status);
  const size=Number(res.headers.get('content-length'));
  if(Number.isFinite(size)&&size>2_500_000)throw new Error('NIFC response too large');
  const raw=await res.text();
  if(raw.length>2_500_000)throw new Error('NIFC response too large');
  const data=JSON.parse(raw);
  if(data.error)throw new Error('NIFC ArcGIS error '+(data.error.code||'unknown'));
  if(data?.type !== 'FeatureCollection' || !Array.isArray(data.features))
    throw new Error('NIFC returned an unexpected geometry format');
  return {status:'available',items:screenNifcFeatures(event,data),
    nearbyFeatureCount:data.features.length,
    searchedFireClass:nifcTypeForEvent(event)};
}
