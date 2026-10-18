import test from 'node:test';
import assert from 'node:assert/strict';
import {
  NIFC_LAYER,eligibleUSFire,perimeterQuery,screenNifcFeatures,queryNifcPerimeters
} from '../earthnet2/incident3d/nifc-perimeters.js';

const NOW=Date.parse('2026-10-18T15:00:00Z');
const ev={id:'eonet:us-fire',title:'Agency fire event',category:'wildfire',
  lon:-101.55,lat:35.75,source:'NASA EONET',updatedAt:'2026-10-18T14:00:00Z'};
const poly={
  type:'Polygon',coordinates:[[[-101.65,35.70],[-101.50,35.70],
    [-101.50,35.82],[-101.65,35.82],[-101.65,35.70]]]
};
const near=(props={})=>({
  type:'Feature',geometry:poly,
  properties:{OBJECTID:123,attr_IncidentTypeCategory:'WF',
    poly_IncidentName:'Example US Wildfire',
    poly_PolygonDateTime:Date.parse('2026-10-17T12:00:00Z'),
    poly_FeatureAccess:'Public',poly_IsVisible:'Yes',...props}
});
const col=features=>({type:'FeatureCollection',features});

test('only US-region wildfire events make geographic requests',()=>{
  assert.equal(eligibleUSFire(ev),true);
  assert.equal(eligibleUSFire({...ev,lat:-40,lon:175}),false);
  assert.equal(eligibleUSFire({...ev,category:'cyclone'}),false);
  assert.equal(perimeterQuery({...ev,category:'cyclone'}),null);
});
test('query is confined to known NIFC source, small bounds, wildfires',()=>{
  const url=new URL(perimeterQuery(ev));
  assert.equal(url.origin,new URL(NIFC_LAYER).origin);
  assert.equal(url.searchParams.get('where'),"attr_IncidentTypeCategory='WF'");
  assert.equal(url.searchParams.get('f'),'geojson');
  assert.equal(Number(url.searchParams.get('resultRecordCount')),15);
  const bbox=url.searchParams.get('geometry').split(',').map(Number);
  assert.equal(bbox.length,4);
  assert.ok(bbox[0]<ev.lon&&bbox[2]>ev.lon);
});
test('official nearby perimeter appears as amber context, never active/burned area',()=>{
  const result=screenNifcFeatures(ev,col([near()]),{now:NOW});
  assert.equal(result.length,1);
  assert.equal(result[0].label,'Example US Wildfire');
  assert.equal(result[0].association,'nearby · unconfirmed incident identity');
  assert.equal(result[0].geometries[0].type,'POLYGON');
  assert.equal(Object.hasOwn(result[0],'activeBurning'),false);
  assert.equal(Object.hasOwn(result[0],'burnedArea'),false);
});
test('never show old, non-wildfire, invisible, hidden, private perimeters',()=>{
  assert.deepEqual(screenNifcFeatures(ev,col([
    near({attr_IncidentTypeCategory:'RX'}),
    near({poly_FeatureAccess:'Restricted'}),
    near({poly_IsVisible:'No'}),
    near({poly_PolygonDateTime:Date.parse('2026-02-01T00:00:00Z')}),
    near({poly_PolygonDateTime:null}),
    near({poly_DeleteThis:'Yes'})
  ]),{now:NOW}),[]);
});
test('malformed or distant shapes do not become incident perimeters',()=>{
  assert.deepEqual(screenNifcFeatures(ev,col([
    {...near(),geometry:{type:'Polygon',coordinates:[]}},
    {...near(),geometry:{type:'Point',coordinates:[ev.lon,ev.lat]}},
    {...near(),geometry:{type:'Polygon',coordinates:[[
      [-110,35],[-110.1,35],[-110.1,35.1],[-110,35.1],[-110,35]]]}}
  ]),{now:NOW}),[]);
});
test('provider failures do not create polygons or leak to unrelated hosts',async()=>{
  const original=globalThis.fetch;
  globalThis.fetch=async ()=>({ok:false,status:503});
  try{
    await assert.rejects(queryNifcPerimeters(ev),/HTTP 503/);
  }finally{globalThis.fetch=original;}
});
