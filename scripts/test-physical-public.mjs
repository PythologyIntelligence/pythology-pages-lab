#!/usr/bin/env node
// Source-only public content assertions. Prevent synthetic/operational conflation
// and broken references before the GitHub Pages publishing workflow runs.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const text = name => readFileSync(join(root, name), "utf8");
const pages = {
  physical: text("physical-intelligence.html"),
  applications: text("where-it-fits.html"),
  research: text("current-research.html")
};
const style = {
  physical: text("physical-intelligence-showcase.css"),
  outreach: text("physical-outreach.css")
};
const check=(value,regex,message)=>assert.match(value,regex,message);

for(const [name,page] of Object.entries(pages)){
  check(page,/<title>[\s\S]*?<\/title>/i,name+" title absent");
  check(page,/site\.js/,name+" primary nav missing");
  check(page,/about\.html#contact/,name+" contact CTA missing");
  assert.ok(!/127\.0\.0\.1:\d+|C:\\Pythology|PYTHOLOGY_API_TOKEN|authorization: Bearer/i.test(page),name+" discloses a local/private technical route");
}
check(pages.physical,/id="pilot"/,"Private pilot section missing");
check(pages.physical,/id="research"/,"Actual research section missing");
check(pages.physical,/id="decision-futures"/,"Decision Futures distinction missing");
check(pages.physical,/15:10/,"Seed 1 result missing");
check(pages.physical,/13:57/,"Seed 2 result missing");
check(pages.physical,/simulations only|simulation-only|simulation results|simulation-only|simulated motor/i,"Physical numeric claims not labelled synthetic");
check(pages.physical,/HTTP.*MQTT.*WebSocket/i,"API interface support not described");
check(pages.physical,/read-only/i,"Pilot should be observational");
check(pages.physical,/No obligation to proceed/i,"Opt-in pilot promise missing");
check(pages.physical,/Any access, integration work, charges, trial duration, security arrangements/i,"Scope/cost qualifications missing");
check(pages.physical,/independent|validation/i,"No validation boundary");
check(pages.applications,/id="physical-monitoring"/,"Where It Fits physical monitoring section absent");
check(pages.applications,/No obligation to proceed/i,"No-obligation qualifier missing from applications");
check(pages.applications,/read-only/i,"Safe API monitoring constraint missing");
check(pages.applications,/physical-intelligence\.html/,"Physical Intelligence destination missing");
check(pages.research,/id="physical-research-evidence"/,"Current Research evidence panel missing");
check(pages.research,/0[^<]*<\/strong>\s*<small>Live structural feeds connected/i,"No-measured-GWB admission missing");
check(pages.research,/real system would need secure read-only integration/i,"Lab-to-field distinction missing");
for(const [name,css] of Object.entries(style)){
  assert.ok(css.length>900,name+" styles missing");
}
for(const page of ["physical-intelligence.html","where-it-fits.html","current-research.html"]){
  const html = text(page);
  const stylesheet = page==="physical-intelligence.html"?"physical-intelligence-showcase.css":"physical-outreach.css";
  assert.ok(html.includes('href="'+stylesheet+'"'),page+" missing stylesheet");
}
const build = text("scripts/build-lab.sh");
for(const filename of ["physical-intelligence-showcase.css","physical-outreach.css","scripts/test-physical-public.mjs"]){
  assert.ok(build.includes(filename),"Pages build omitted "+filename);
}
console.log("Physical Intelligence public offer, research evidence and safe integration checks: PASS");
