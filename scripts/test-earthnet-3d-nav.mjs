import test from 'node:test';
import assert from 'node:assert/strict';
import {canExploreIn3D,incident3DUrl,THREE_D_CATEGORIES} from '../earthnet2/app/incident3d-link.js';
import {INCIDENT_CATEGORIES} from '../earthnet2/incident3d/incident-data.js';

const originalLocation = globalThis.location;
globalThis.location = {href: 'https://pythologyintelligence.github.io/pythology-pages-lab/earthnet2/index.html'};
const fire={id:'eonet:EONET_25232',title:'Wildfire CYRUS',
  category:'wildfire',lat:35.699,lon:-118.418};
const supported=['earthquake','volcano','wildfire','cyclone','flood','landslide'];
test('deep link carries exact real EarthNet event ID to public 3D renderer',()=>{
  const href=incident3DUrl(fire);
  const url=new URL(href);
  assert.equal(url.origin,new URL('https://pythologyintelligence.github.io/pythology-pages-lab/earthnet2/incident3d/index.html').origin);
  assert.equal(url.pathname,new URL('https://pythologyintelligence.github.io/pythology-pages-lab/earthnet2/incident3d/index.html').pathname);
  assert.equal(url.searchParams.get('id'),fire.id);
  assert.equal(url.searchParams.get('from'),'pages');
  assert.equal(url.searchParams.has('exercise'),false);
});
test('other EarthNet hazard categories with terrain coordinates are linkable',()=>{
  for(const category of supported){
    assert.equal(canExploreIn3D({...fire,category}),true,category);
  }
});
test('no 3D link for near-Earth objects, missing coordinates or malformed data',()=>{
  assert.equal(incident3DUrl({...fire,category:'neo'}),null);
  assert.equal(incident3DUrl({...fire,lat:null}),null);
  assert.equal(incident3DUrl({...fire,lon:''}),null);
  assert.equal(incident3DUrl({...fire,id:''}),null);
  assert.equal(incident3DUrl({...fire,lat:999}),null);
  assert.equal(incident3DUrl({...fire,lon:NaN}),null);
});
test('escape special incident IDs using URLSearchParams without redirect injection',()=>{
  const href=incident3DUrl({...fire,id:'special:a&b? # ='});
  const url=new URL(href);
  assert.equal(url.searchParams.get('id'),'special:a&b? # =');
  assert.equal(url.origin,new URL('https://pythologyintelligence.github.io/pythology-pages-lab/earthnet2/incident3d/index.html').origin);
});
test('globe and renderer agree on supported terrestrial categories',()=>{
  assert.deepEqual([...THREE_D_CATEGORIES].sort(),[...INCIDENT_CATEGORIES].sort());
});

test('the source is a frozen trusted link, not an attacker-controlled destination',()=>{
  assert.equal(new URL(incident3DUrl(fire)).href.startsWith('https://pythologyintelligence.github.io/pythology-pages-lab/earthnet2/incident3d/index.html'),true);
});
// Global location deliberately stays set for the test runner's callbacks.
