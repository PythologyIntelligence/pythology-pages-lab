#!/usr/bin/env node
// Browser acceptance for the published artifact, not an HTML-only link guess.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile, mkdir} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {createRequire} from 'node:module';
import path from 'node:path';

const root=path.resolve(process.argv[2] || '_site');
const screenshotDir=path.resolve(process.argv[3] || 'redesign-browser-screenshots');
const candidates=[process.env.CHROME_BIN,'/usr/bin/google-chrome','/usr/bin/chromium','/usr/bin/chromium-browser'].filter(Boolean);
const executablePath=candidates.find(existsSync);
assert.ok(executablePath,'Chromium browser is required for release QA');
const playwrightPath=process.env.PYTHOLOGY_PLAYWRIGHT_PATH;
assert.ok(playwrightPath,'PYTHOLOGY_PLAYWRIGHT_PATH required');
const require=createRequire(import.meta.url);
const {chromium}=require(playwrightPath);
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css',
  '.png':'image/png','.jpeg':'image/jpeg','.jpg':'image/jpeg','.webp':'image/webp',
  '.json':'application/json','.svg':'image/svg+xml','.ico':'image/x-icon'};
const server=createServer(async (req,res)=>{
  try {
    const relative=decodeURIComponent(new URL(req.url,'http://localhost').pathname).replace(/^\/+/,'');
    let file=path.resolve(root,relative);
    assert.ok(file===root || file.startsWith(root+path.sep));
    if(file===root || req.url.split('?')[0].endsWith('/'))file=path.join(file,'index.html');
    const data=await readFile(file);
    res.writeHead(200,{'content-type':mime[path.extname(file)] || 'application/octet-stream','cache-control':'no-store'});
    res.end(data);
  } catch (_) {res.writeHead(404).end('missing');}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const origin='http://127.0.0.1:'+server.address().port;
const routes=['/','/prometheus/','/prometheus-research/','/environmental/','/biological/',
  '/physical-systems/','/about/','/chathams/','/current-research/',
  '/computational-biology-lab/','/physical-intelligence/','/weather-lab/',
  '/subterranean/','/forecast-ledger/'];
const viewports=[['phone',390,844],['tablet',820,1080],['desktop',1440,900]];
await mkdir(screenshotDir,{recursive:true});
let browser;
try {
  browser=await chromium.launch({headless:true,executablePath,
    args:['--no-sandbox','--disable-dev-shm-usage','--disable-background-networking']});
  for(const [device,width,height] of viewports) {
    const context=await browser.newContext({viewport:{width,height},reducedMotion:'reduce'});
    for(const route of routes) {
      const page=await context.newPage();
      const failures=[];
      page.on('response',res=>{
        if(res.url().startsWith(origin) && res.status()===404) failures.push(res.url());
      });
      await page.route('**/*',r=>r.request().url().startsWith(origin)?r.continue():r.abort());
      const response=await page.goto(origin+route,{waitUntil:'domcontentloaded',timeout:30000});
      assert.equal(response.status(),200,device+' '+route+' must load');
      await page.waitForTimeout(260);
      const scroll=await page.evaluate(()=>({html:document.documentElement.scrollWidth,width:innerWidth}));
      assert.ok(scroll.html<=scroll.width+8,device+' '+route+' horizontal overflow '+JSON.stringify(scroll));
      const nav=page.locator('header.px-header nav.px-links');
      assert.equal(await nav.count(),1,device+' '+route+' redesigned navigation missing');
      const links=await nav.locator('a[href]').evaluateAll(els=>
        els.map(a=>({text:a.textContent.trim(),path:new URL(a.href).pathname})));
      for(const [label,destination] of [['Home','/'],['Prometheus','/prometheus-research/'],
        ['Environmental','/environmental/'],['Biological','/biological/'],
        ['Physical Systems','/physical-systems/'],['About','/about/']]) {
        assert.equal(links.find(x=>x.text===label)?.path,destination,
          device+' '+route+' broken '+label+' navigation');
      }
      const mail=page.locator('header.px-header a.px-contact');
      assert.ok((await mail.getAttribute('href')).startsWith('mailto:enquiries@pythology.co.nz'));
      if(width<=980) {
        const toggle=page.locator('[data-px-menu-toggle]');
        await toggle.click();
        assert.equal(await toggle.getAttribute('aria-expanded'),'true',device+' '+route+' menu open');
        assert.ok(await page.locator('[data-px-menu]').isVisible(),device+' '+route+' mobile menu visible');
        await toggle.click();
        assert.equal(await toggle.getAttribute('aria-expanded'),'false',device+' '+route+' menu close');
      }
      if(route==='/') {
        const hero=page.locator('img[src*="home_page.jpeg"]').first();
        assert.ok(await hero.count(),device+' homepage hero artwork absent');
        await hero.evaluate(el=>el.decode());
        assert.ok(await hero.evaluate(el=>el.naturalWidth>300),device+' hero failed to load');
      }
      if(route==='/prometheus-research/' || route==='/environmental/' ||
         route==='/weather-lab/' || route==='/subterranean/' ||
         route==='/forecast-ledger/') {
        assert.ok(await page.locator('[data-live-evidence]').count()>0,
          device+' '+route+' must expose a dated evidence panel');
      }
      assert.deepEqual(failures,[],device+' '+route+' local 404 assets');
      const name=route==='/'?'home':route.split('/')[1];
      await page.screenshot({path:path.join(screenshotDir,device+'-'+name+'.png'),
        animations:'disabled',fullPage:false});
      await page.close();
      console.log('PASS '+device+' '+route);
    }
    await context.close();
  }
  const legacy=await readFile(path.join(root,'archive-research','environmental.html'),'utf8');
  assert.match(legacy,/data-home-nz-count|data-home-research-findings/);
  console.log('PASS redesigned routes, live research panels, archived evidence, browser navigation and layout');
} finally {
  if(browser)await browser.close();
  await new Promise(resolve=>server.close(resolve));
}