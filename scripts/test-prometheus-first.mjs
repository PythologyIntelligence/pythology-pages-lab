#!/usr/bin/env node
// Non-network smoke checks for the Pythology / Prometheus-first public site.
import fs from 'node:fs';
import assert from 'node:assert/strict';

const read = (path) => fs.readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const home = read('index.html');
const engine = read('prometheus-research.html');
const biology = read('prometheus-biology.html');
const nav = read('site.js');
const css = read('prometheus-first.css');
const build = read('scripts/build-lab.sh');

assert.match(home, /id="prometheus-primary-heading"/);
assert.match(home, /id="research-programmes"/);
assert.match(home, /id="verified-progress"/);
assert.match(home, /id="where-prometheus-works"/);
assert.match(home, /href="prometheus-biology.html"/);
assert.match(home, /<details class="prometheus-where-works"/);
assert.match(home, /<\/details><div class="pitch-disclaimer">/);
assert.match(engine, /id="v3-baseline"/);
assert.match(engine, /id="research-stages"/);
assert.match(engine, /id="where-he-works"/);
assert.match(engine, /autonomous scientific discovery/i);
assert.match(biology, /Pancreatic cancer/);
assert.match(biology, /Alzheimer's disease/);
assert.match(biology, /Rare diseases/);
assert.match(biology, /not clinically validated|not a validated medical device|not a medical service|not a validated diagnostic service/);
assert.match(nav, /\['prometheus-research.html', 'Prometheus'\]/);
assert.match(nav, /\['prometheus-biology.html', 'Prometheus Biology'\]/);
assert.doesNotMatch(nav, /\['(?:earthnet-platform|enviroarc|chathams|atlas)\.html',/i);
assert.match(css, /@media\(max-width:700px\)/);
assert.match(build, /prometheus-biology.html/);
assert.match(build, /prometheus-first.css/);
assert.match(build, /test-prometheus-first.mjs/);
for (const file of [home,engine,biology]) {
  assert.match(file, /prometheus-first\.css/);
  assert.doesNotMatch(file, /father-in-law|uncle|private repository|C:\\Users\\Administrator/i);
}
console.log('PASS: Prometheus is central, specialist links are secondary, and research boundaries remain explicit.');
