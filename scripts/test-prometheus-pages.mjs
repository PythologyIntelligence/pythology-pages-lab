import test from 'node:test';
import assert from 'node:assert/strict';
import {buildResearchSnapshot} from './prometheus-enviroarc-screening.mjs';
import {usableResearchSnapshot} from '../earthnet2/incident3d/incident-data.js';

const now='2026-10-18T05:00:00Z';
const events=Array.from({length:428},(_,i)=>({
  id:'eonet:bulk-'+i,title:'Example hazard '+i,
  category:'wildfire',lat:30+i/10000,lon:-101,source:'Official example',
  updatedAt:'2026-10-18T04:40:00Z'
}));
const feed={meta:{generatedAt:'2026-10-18T04:45:00Z'},events};
test('Prometheus Pages build screens all valid source events and is accepted by browser',()=>{
  const generated=buildResearchSnapshot(feed,{}, {now});
  generated.meta.executionEnvironment='GitHub Pages read-only scheduled build';
  assert.equal(generated.meta.eligibleCount,428);
  assert.equal(generated.meta.screenedCount,428);
  assert.equal(generated.meta.containsForecasts,false);
  const browser=usableResearchSnapshot(generated,feed.meta.generatedAt,Date.parse(now));
  assert.equal(browser.status,'available');
  assert.equal(Object.keys(browser.incidents).length,428);
  assert.equal(browser.incidents['eonet:bulk-0'].assessment.status,'research');
});
test('Pages build refuses stale EarthNet feed and fictional exercises',()=>{
  assert.throws(()=>buildResearchSnapshot({...feed,meta:{generatedAt:'2026-10-17T00:00:00Z'}},{},{now}),/stale/);
  assert.throws(()=>buildResearchSnapshot({...feed,meta:{...feed.meta,demo:true}},{},{now}),/synthetic/);
});
test('No unsupported fire-spread or causal claims enter source screening',()=>{
  const generated=buildResearchSnapshot(feed,{}, {now});
  const a=generated.incidents['eonet:bulk-0'];
  assert.deepEqual(a.frames,[]);
  assert.deepEqual(a.overlays,[]);
  assert.match(a.assessment.summary,/has not established a causal mechanism/);
  assert.match(a.assessment.uncertainty,/No causal attribution/);
});
