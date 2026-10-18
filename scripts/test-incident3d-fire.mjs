import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {normalizeFireEvolution,usableFireFeed,firePlayback} from '../earthnet2/incident3d/fire-evolution.js';
import {normalizeIncident,playback} from '../earthnet2/incident3d/incident-data.js';

const sample=JSON.parse(await readFile(new URL('../earthnet2/incident3d/fixtures/fire-evolution-exercise.json',import.meta.url),'utf8'));
const id=sample.events[0].id;
const demo=usableFireFeed(sample.fire,null,{demo:true});
const times=demo.incidents[id].frames.map(f=>f.validTime);

test('real events cannot silently import synthetic fire shapes',()=>{
  assert.equal(usableFireFeed(sample.fire,'2026-10-18T05:00:00Z').status,'invalid');
  assert.equal(demo.status,'available');
  assert.equal(demo.incidents[id].frames.length,3);
});

test('active burning and burned ground remain separate source layers',()=>{
  for(const f of demo.incidents[id].frames){
    assert.equal(f.activeBurning.evidenceClass,'hypothetical');
    assert.equal(f.burnedArea.evidenceClass,'hypothetical');
    assert.notDeepEqual(f.activeBurning.geometries[0].coordinates,f.burnedArea.geometries[0].coordinates);
    assert.match(f.activeBurning.source,/SYNTHETIC/);
    assert.ok(f.activeBurning.sourceUrl.startsWith('https://'));
  }
  assert.deepEqual([...times].sort(),times);
});

test('wildfire incident with no polygons never invents a fire front',()=>{
  const ev={id:'official:no-geo',category:'wildfire',lat:-34,lon:152,
    source:'Official notice',updatedAt:'2026-10-18T04:00:00Z'};
  const inc=normalizeIncident(ev,{}, {});
  assert.equal(inc.geometry.length,0);
  assert.equal(playback(inc).kind,'none');
  assert.equal(firePlayback(inc, null),null);
});

test('fire playback chooses independently provided snapshots',()=>{
  const inc=normalizeIncident(sample.events[0],sample.detail[id],{});
  const p=firePlayback(inc,demo.incidents[id]);
  assert.equal(p.kind,'fire');
  assert.equal(p.items.length,3);
  assert.equal(firePlayback({...inc,category:'volcano'},demo.incidents[id]),null);
});

test('rejects unlabeled/unsourced or unverified operational geometry',()=>{
  const f=sample.fire.incidents[id].frames[0];
  const normal={...f,
    activeBurning:{...f.activeBurning,evidenceClass:'official'}};
  assert.equal(normalizeFireEvolution({frames:[normal]},{demo:false}).length,0,
    'Burned-area hypothetical is not allowed, and alone is invalid in official mode');
});
test('rejects malformed, proposed and future publication',()=>{
  const now=Date.parse('2026-10-18T05:00:00Z');
  const f=sample.fire.incidents[id].frames[0];
  const official={...f,
    activeBurning:{...f.activeBurning,evidenceClass:'official',source:'Example fire authority'},
    burnedArea:{...f.burnedArea,evidenceClass:'official',source:'Example fire authority'}};
  const envelope={schemaVersion:1,producer:'Pythology Fire Evolution Geometry v1',
    generatedAt:'2026-10-18T04:50:00Z',
    incidents:{'official:1':{frames:[official]}}};
  const known=usableFireFeed(envelope,'2026-10-18T04:55:00Z',{now});
  assert.equal(known.status,'available');
  assert.equal(known.incidents['official:1'].frames.length,1);
  const wrong=structuredClone(envelope);
  wrong.incidents['official:1'].frames[0].activeBurning.evidenceClass='proposed';
  assert.equal(usableFireFeed(wrong,'2026-10-18T04:55:00Z',{now}).incidents['official:1'].frames[0].activeBurning,null);
  const noRef=structuredClone(envelope);
  noRef.incidents['official:1'].frames[0].activeBurning.sourceUrl='';
  assert.equal(usableFireFeed(noRef,'2026-10-18T04:55:00Z',{now}).incidents['official:1'].frames[0].activeBurning,null);
  const stale={...envelope,generatedAt:'2026-10-17T01:00:00Z'};
  assert.equal(usableFireFeed(stale,'2026-10-18T04:55:00Z',{now}).status,'stale');
});
