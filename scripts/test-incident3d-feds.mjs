import test from 'node:test';
import assert from 'node:assert/strict';
import {
  FEDS_SOURCE,FEDS_PERIMETER,FEDS_FIRELINE,
  eligibleFeds,fedsRequest,assembleFedsNearby,loadFedsNearby
} from '../earthnet2/incident3d/nasa-feds.js';
const now=Date.parse('2026-10-18T05:00:00Z');
const event={id:'eonet:example',category:'wildfire',lon:-101.55,lat:35.75};
const poly={type:'Polygon',coordinates:[[[-101.60,35.71],[-101.52,35.71],
  [-101.52,35.80],[-101.60,35.80],[-101.60,35.71]]]};
const line={type:'LineString',coordinates:[[-101.52,35.72],[-101.53,35.76],[-101.52,35.80]]};
const feat=(kind,t,geo=kind==='area'?poly:line,id=120)=>({
  type:'Feature',properties:{region:'CONUS',fireid:id,t,
    primarykey:'CONUS|'+id+'|'+t,farea:6.9,low_confidence_grouping:0},
  geometry:geo
});
const docs=(...features)=>({type:'FeatureCollection',features});
test('only wildfire positions in model coverage generate bounded requests',()=>{
  assert.equal(eligibleFeds(event),true);
  assert.equal(eligibleFeds({...event,lat:-40,lon:175}),false);
  assert.equal(eligibleFeds({...event,category:'flood'}),false);
  const url=new URL(fedsRequest(event,FEDS_PERIMETER,now));
  assert.equal(url.origin,new URL(FEDS_SOURCE).origin);
  assert.equal(url.searchParams.get('limit'),'110');
  assert.match(url.searchParams.get('datetime'),/2026-09/);
  assert.equal(fedsRequest(event,'other.collection',now),null);
});
test('modelled cumulative affected polygons and active FRONT LINES stay different',()=>{
  const times=['2026-10-17T00:00:00','2026-10-17T12:00:00'];
  const found=assembleFedsNearby(event,
    docs(feat('area',times[0]),feat('area',times[1])),
    docs(feat('line',times[1])));
  assert.equal(found.length,1);
  assert.equal(found[0].key,'CONUS|120');
  assert.equal(found[0].frames.length,2);
  assert.equal(found[0].frames[1].area[0].type,'POLYGON');
  assert.equal(found[0].frames[1].front[0].type,'LINESTRING');
  assert.equal(found[0].frames[0].front,null);
  assert.match(found[0].association,/NOT confirmed EarthNet incident/);
  assert.equal(Object.hasOwn(found[0].frames[1],'burnedArea'),false);
  assert.equal(Object.hasOwn(found[0].frames[1],'activeBurning'),false);
});
test('rejects invalid dates, geometries and distant unmapped model tracks',()=>{
  const bad=docs(
    feat('area','INVALID'),
    feat('area','2026-10-17T00:00:00',{type:'Point',coordinates:[-101.55,35.75]})
  );
  assert.deepEqual(assembleFedsNearby(event,bad,docs()),[]);
  const far=feat('area','2026-10-17T00:00:00',{
    type:'Polygon',coordinates:[[[-130,40],[-130.1,40],[-130.1,40.1],[-130,40.1],[-130,40]]]
  });
  assert.deepEqual(assembleFedsNearby(event,docs(far),docs()),[]);
});
test('different fire IDs do not merge into the same history',()=>{
  const t='2026-10-17T00:00:00';
  const result=assembleFedsNearby(event,docs(feat('area',t),feat('area',t,poly,121)),docs());
  assert.equal(result.length,2);
  assert.notEqual(result[0].key,result[1].key);
});
test('network fetches are read-only and failures are surfaced',async()=>{
  const original=globalThis.fetch,urls=[];
  globalThis.fetch=async (url)=>{urls.push(url);
    return {ok:true,status:200,headers:new Headers(),text:async()=>JSON.stringify(
      url.includes(FEDS_PERIMETER)
        ?docs(feat('area','2026-10-17T00:00:00'))
        :docs(feat('line','2026-10-17T00:00:00'))
    )};
  };
  try{
    const result=await loadFedsNearby(event);
    assert.equal(result.options.length,1);
    assert.equal(urls.length,2);
    assert.ok(urls.every(url=>url.startsWith(FEDS_SOURCE)));
  }finally{globalThis.fetch=original;}
});
