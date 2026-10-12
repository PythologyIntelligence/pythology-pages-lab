#!/usr/bin/env node
/**
 * Regression guard for the NZ 24-hour state on the Pythology landing page.
 * Uses a fixed catalogue fixture: never fetches live earthquake data in CI.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../home-proof.js', import.meta.url), 'utf8');
const markup = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const css = readFileSync(new URL('../pythology-human.css', import.meta.url), 'utf8');

const start = source.indexOf('  function nzQuakeNumber(');
const end = source.indexOf('  function renderTriggeredResearch(', start);
assert.ok(start >= 0 && end > start, 'Quake state rendering functions missing');

const hooks = [
  'count', 'largest', 'bin-lt1', 'bin-m1', 'bin-m2', 'bin-m3',
  'bin-m4', 'bin-m4-label', 'bin-m5', 'quake-integrity',
  'largest-event', 'largest-meta', 'largest-source', 'largest-geonet'
];
hooks.forEach((hook) => assert.ok(markup.includes('data-home-nz-' + hook), 'Homepage missing ' + hook));
assert.ok(css.includes('.home-nz-quake-bins'), 'Magnitude breakdown styles missing');

function makeRenderer() {
  const shown = new Map();
  const link = {
    hidden: true,
    href: '',
    removeAttribute(name) { if (name === 'href') this.href = ''; }
  };
  const document = {
    querySelector(selector) {
      return selector === '[data-home-nz-largest-geonet]' ? link : null;
    }
  };
  const text = (selector, value) => shown.set(selector, String(value));
  const safe = (value, fallback = '—') => value == null || value === '' ? fallback : value;
  const factory = new Function(
    'document', 'text', 'safe', 'nzStateAgeHours', 'shortDate',
    source.slice(start, end) + '\nreturn {renderNz, renderNzQuakeDetail};'
  );
  return {
    ...factory(document, text, safe, () => 1, (value) => value),
    get: (key) => shown.get('[data-home-nz-' + key + ']'),
    link
  };
}

const now = '2026-10-12T06:00:00Z';
const event = (magnitude, id) => ({
  magnitude, public_id: id, depth_km: 14.2, time: now,
  locality: '15 km south of Taupō', latitude: -38.8,
  longitude: 176.1, quality: 'best'
});
const events = [
  {...event(-0.2, '2026p000001'), quality: 'deleted'},
  event(0.5, '2026p000002'),
  event(1.9, '2026p000003'),
  event(2.9, '2026p000004'),
  event(3.5, '2026p000005'),
  event(4.4, '2026p000006'),
  event(5.4, '2026p000007')
];
const seismic = {
  event_count: 7,
  largest_magnitude: 5.4,
  magnitude_bins: {
    lt_0: 1, '0_0_to_0_9': 1, '1_0_to_1_9': 1,
    '2_0_to_2_9': 1, '3_0_to_3_9': 1, '4_0_plus': 2
  },
  activity_concentrations: [],
  events
};
const fixture = {
  generated_at: now, local_date: '2026-10-12',
  seismic, prometheus_interpretation: ['Fixed test fixture only.']
};

const primary = makeRenderer();
primary.renderNz(fixture);
assert.equal(primary.get('count'), '7');
assert.deepEqual(
  ['bin-lt1', 'bin-m1', 'bin-m2', 'bin-m3', 'bin-m4', 'bin-m5'].map(primary.get),
  ['2', '1', '1', '1', '1', '1'],
  'Exactly one 24-hour catalogue and complete M4/M5 split'
);
assert.match(primary.get('quake-integrity'), /reconcile/);
assert.match(primary.get('quake-integrity'), /1 source record flagged deleted/);
assert.match(primary.get('largest-event'), /M5\.4.*Taupō/);
assert.match(primary.get('largest-meta'), /14\.2 km deep.*NZ time.*38\.80°S/);
assert.match(primary.get('largest-source'), /event 2026p000007/);
assert.equal(primary.link.href, 'https://www.geonet.org.nz/earthquake/2026p000007');
assert.equal(primary.link.hidden, false);

const missingEvents = makeRenderer();
missingEvents.renderNzQuakeDetail({...seismic, events: []}, []);
assert.equal(missingEvents.get('bin-m4'), '2');
assert.equal(missingEvents.get('bin-m4-label'), 'M4+ (combined)');
assert.equal(missingEvents.get('bin-m5'), '—');
assert.equal(missingEvents.get('largest-event'), 'M5.4 · event details unavailable');
assert.equal(missingEvents.link.hidden, true);

const invalidBins = makeRenderer();
invalidBins.renderNzQuakeDetail({
  ...seismic,
  magnitude_bins: {...seismic.magnitude_bins, '2_0_to_2_9': 99}
}, events);
assert.match(invalidBins.get('quake-integrity'), /does not reconcile/);
assert.equal(invalidBins.get('bin-m2'), undefined, 'Never manufacture a count from invalid bins');

const absent = makeRenderer();
absent.renderNzQuakeDetail({event_count: 0, magnitude_bins: {}, events: []}, []);
assert.equal(absent.get('largest-event'), 'No verified largest event in this snapshot');
assert.equal(absent.link.hidden, true);

console.log('NZ homepage quake detail regression checks passed.');
