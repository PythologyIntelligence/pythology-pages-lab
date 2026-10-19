#!/usr/bin/env node
// Chromium viewport and click-through QA for the staged static Pages build.
// Tests actual generated HTML/CSS/JS at desktop, tablet and Android-sized widths.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { readFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = path.resolve(process.argv[2] || '_site');
const screenshots = path.resolve(process.argv[3] || 'responsive-screenshots');
const runtime = process.env.PYTHOLOGY_PLAYWRIGHT_PATH;
assert.ok(runtime, 'PYTHOLOGY_PLAYWRIGHT_PATH is required');
const require = createRequire(import.meta.url);
const { chromium } = require(runtime);
const mime = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.json': 'application/json',
  '.webp': 'image/webp', '.png': 'image/png', '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.woff': 'font/woff', '.woff2': 'font/woff2',
};
const server = createServer(async (req, res) => {
  try {
    const u = new URL(req.url, 'http://127.0.0.1');
    const relative = decodeURIComponent(u.pathname).replace(/^\/+/, '');
    let file = path.resolve(root, relative);
    if (!file.startsWith(root + path.sep) && file !== root) {
      res.writeHead(403).end(); return;
    }
    if (u.pathname.endsWith('/') || file === root) file = path.join(file, 'index.html');
    const data = await readFile(file);
    res.writeHead(200, { 'content-type': mime[path.extname(file)] || 'application/octet-stream',
                          'cache-control': 'no-store' });
    res.end(data);
  } catch {
    res.writeHead(404).end('Not found');
  }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = 'http://127.0.0.1:' + server.address().port;
const candidates = [
  process.env.CHROME_BIN, '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable',
  '/usr/bin/chromium', '/usr/bin/chromium-browser', '/opt/google/chrome/chrome',
].filter(Boolean);
const executablePath = candidates.find(p => existsSync(p));
assert.ok(executablePath, 'No system Chrome/Chromium for responsive QA');
const viewports = [
  { name: 'mobile', width: 390, height: 844, mobile: true },
  { name: 'tablet', width: 820, height: 1080, mobile: true },
  { name: 'desktop', width: 1440, height: 900, mobile: false },
];
const routes = ['/', '/prometheus/', '/about/', '/chathams/',
                '/where-it-fits/', '/physical-intelligence/'];
let browser;
try {
  browser = await chromium.launch({
    executablePath, headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-background-networking'],
  });
  await mkdir(screenshots, { recursive: true });
  for (const viewport of viewports) {
    const context = await browser.newContext({
      viewport: { width: viewport.width, height: viewport.height },
      deviceScaleFactor: 1,
      reducedMotion: 'reduce',
    });
    for (const route of routes) {
      const page = await context.newPage();
      const name = route === '/' ? 'home' : route.split('/').filter(Boolean)[0];
      // CI snapshots must not require fonts or remote live data to resolve.
      await page.route('**/*', r => r.request().url().startsWith(origin) ? r.continue() : r.abort());
      const response = await page.goto(origin + route, { waitUntil: 'domcontentloaded', timeout: 30000 });
      assert.equal(response?.status(), 200, route + ' did not load');
      await page.waitForTimeout(320);
      const measurements = await page.evaluate(() => ({
        viewport: innerWidth,
        html: document.documentElement.scrollWidth,
        body: document.body.scrollWidth,
        base: document.baseURI,
      }));
      assert.ok(measurements.html <= measurements.viewport + 8,
                viewport.name + ' ' + route + ': horizontal overflow ' + JSON.stringify(measurements));
      // Verify that the actual DOM, whether JS runs or not, links to siblings.
      const nav = await page.locator('header [data-nav-links] a[href]').evaluateAll(
        els => els.map(a => ({ text: a.textContent?.trim(), path: new URL(a.href).pathname })),
      );
      for (const link of nav) {
        assert.ok(!link.path.startsWith(route + 'enviroarc/') &&
                  !link.path.startsWith(route + 'about/'),
                  'Nested/broken ' + viewport.name + ' link on ' + route + ': ' + JSON.stringify(link));
      }
      const navLink = nav.find(x => x.text === 'EnviroArc');
      assert.equal(navLink?.path, '/enviroarc/', viewport.name + ' ' + route + ': EnviroArc link wrong');
      if (viewport.mobile) {
        const menu = page.locator('[data-menu-button]');
        await menu.click();
        assert.equal(await menu.getAttribute('aria-expanded'), 'true',
                     viewport.name + ' ' + route + ': menu did not open');
        const menuBox = await page.locator('[data-nav-links]').boundingBox();
        assert.ok(menuBox && menuBox.width > 0 && menuBox.x >= -8 &&
                  menuBox.x + menuBox.width <= viewport.width + 8,
                  viewport.name + ' ' + route + ': menu outside viewport');
        await menu.click();
        assert.equal(await menu.getAttribute('aria-expanded'), 'false');
      }
      await page.screenshot({ path: path.join(screenshots, viewport.name + '-' + name + '.png'),
                              animations: 'disabled' });
      if (route === '/prometheus/' || route === '/about/') {
        if (viewport.mobile) await page.locator('[data-menu-button]').click();
        await page.locator('header [data-nav-links] a').filter({ hasText: /^EnviroArc$/ }).click();
        await page.waitForURL(/\/enviroarc\/$/, { timeout: 10000 });
        assert.equal(new URL(page.url()).pathname, '/enviroarc/',
                     viewport.name + ' ' + route + ': menu click did not navigate');
      }
      if (route === '/chathams/') {
        for (const screenshot of ['helios-dashboard.webp', 'ecowatch-dashboard.webp']) {
          const img = page.locator('img[src$="' + screenshot + '"]').first();
          await img.scrollIntoViewIfNeeded();
          const loaded = await img.evaluate(el => el.complete && el.naturalWidth > 0);
          assert.ok(loaded, viewport.name + ': Chathams ' + screenshot + ' is not visible/loaded');
        }
      }
      console.log('PASS ' + viewport.name.padEnd(7) + ' ' + route.padEnd(23) +
                  ' no overflow; ' + nav.length + ' menu links; screenshot saved');
      await page.close();
    }
    await context.close();
  }
  console.log('PASS: mobile, tablet and desktop screenshot, overflow, menu and click-through QA');
} finally {
  if (browser) await browser.close();
  await new Promise(resolve => server.close(resolve));
}
