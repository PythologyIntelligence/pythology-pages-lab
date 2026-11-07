#!/usr/bin/env node
// Offline content safeguards for Pythology's three-domain public information architecture.
import fs from 'node:fs';
import assert from 'node:assert/strict';
const read = name => fs.readFileSync(new URL('../' + name, import.meta.url), 'utf8');
const home = read('index.html');
const engine = read('prometheus-research.html');
const environmental = read('environmental.html');
const biological = read('biological.html');
const physical = read('physical-systems.html');
const legacyBiology = read('prometheus-biology.html');
const nav = read('site.js');
const css = read('domain-pages.css');
const researchCards = read('prometheus-research-cards.js');
const build = read('scripts/build-lab.sh');
const about = read('about.html');
const aboutCss = read('about-human.css');

assert.match(home, /id="prometheus-primary-heading"/);
assert.match(home, /<main><section class="home-title-banner"/);
assert.match(home, /srcset="png_images\/prometheus\.jpeg"/);
assert.match(home, /src="png_images\/pythology_environmental_ai_banner\.webp"/);
assert.ok(home.indexOf('class="home-title-banner"') < home.indexOf('class="domain-intro"'), 'Hero banner must precede the concise introduction');
assert.match(home, /id="research-programmes"/);
assert.match(home, /Understanding change/i);
assert.doesNotMatch(home, /The reason Pythology exists|id="proof"|data-home-nz-count|data-py-lab=|forecast-card/);
assert.ok(home.length < 5500, 'Homepage should remain a short domain introduction');
for (const [file, label] of [['environmental.html','Environmental'],['biological.html','Biological'],['physical-systems.html','Physical Systems']]) {
  assert.match(home, new RegExp('href="' + file + '"'));
  assert.match(nav, new RegExp("\\['" + file.replace('.', '\\.') + "', '" + label + "'\\]"));
}
assert.match(environmental, /Who this is for/);
assert.match(environmental, /id="prometheus-research-cards"/);
assert.match(environmental, /weather-lab\.html#current/);
assert.match(researchCards, /retrieve\('\/data\/prometheus_weather_research\.json'/);
assert.doesNotMatch(researchCards, /retrieve\('data\/prometheus_weather_research\.json'/);
assert.match(environmental, /data-home-forecast-caveat/);
assert.match(environmental, /data-home-research-findings/);
assert.match(environmental, /data-home-nz-count/);
assert.match(environmental, /SELECTED FIELD WORK · BUILT FOR THE CHATHAM ISLANDS/);
assert.match(environmental, /These are separate projects for the Chatham Islands/);
assert.match(environmental, /href="chathams.html"/);
assert.match(environmental, /earthnet.pythology.co.nz/);
assert.match(environmental, /atlas.pythology.co.nz/);
assert.match(environmental, /not a public warning|not a public warning|not a public warning|not a public warning|not public warnings|not a public warning/i);
assert.match(biological, /Who this is for/);
for (const page of [biological,legacyBiology]) {
  assert.match(page, /Pancreatic cancer/);
  assert.match(page, /Alzheimer's disease/);
  assert.match(page, /Rare diseases/);
  assert.match(page, /not clinically validated|not a validated medical device|not a medical service|not a validated diagnostic service/);
}
assert.match(physical, /Who this is for/);
assert.match(physical, /Bridges &amp; infrastructure/);
assert.match(physical, /Aerospace/);
assert.match(physical, /simulated/i);
assert.match(physical, /read-only/i);
assert.match(physical, /not claims of deployed monitoring/i);
assert.match(engine, /id="v3-baseline"/);
assert.match(engine, /id="research-stages"/);
assert.match(engine, /id="where-he-works"/);
assert.match(engine, /id="technical-method"/);
assert.match(engine, /autonomous scientific discovery/i);
assert.match(engine, /0<\/strong><span>Independently scored scientific outcomes/);
assert.doesNotMatch(engine, /Chathams EcoWatch|Helios|data-py-lab=/);
assert.match(about, /about-mobile-visual/);
assert.match(aboutCss, /\.lab-about \.about-hero \.container\{display:grid/);
assert.match(aboutCss, /@media\(max-width:1020px\)/);
assert.doesNotMatch(nav, /\['(?:earthnet-platform|enviroarc|chathams|atlas)\.html',/i);
assert.match(css, /@media\(max-width:650px\)/);
assert.match(build, /test-prometheus-first.mjs/);
for (const file of [home,engine,environmental,biological,physical]) {
  assert.match(file, /domain-pages\.css|prometheus-first\.css/);
  assert.doesNotMatch(file, /father-in-law|uncle|private repository|C:\\Users\\Administrator/i);
}
console.log('PASS: concise homepage, three domain routes, live environmental evidence and scientific claim boundaries.');
