import assert from 'node:assert/strict';
import http from 'node:http';
import path from 'node:path';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import os from 'node:os';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_PATH || path.join(os.homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
const root = path.resolve('atlas-site');
const server = http.createServer(async (req, res) => {
  let url = new URL(req.url, 'http://localhost').pathname;
  if (url.startsWith('/nested/example/')) url = url.slice('/nested/example'.length);
  if (url.endsWith('/')) url += 'index.html';
  const file = path.resolve(root, '.' + decodeURIComponent(url));
  if (!file.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
  try {
    const data = await readFile(file);
    res.setHeader('Content-Type', ({ '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.html': 'text/html' })[path.extname(file)] || 'application/octet-stream');
    res.end(data);
  } catch { res.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(4195, '127.0.0.1', resolve));
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || path.join(os.homedir(), 'AppData/Local/Google/Chrome/Application/chrome.exe'), headless: true, args: ['--enable-unsafe-swiftshader'] });
await mkdir('probe/wuhan', { recursive: true });
const results = [];
try {
  for (const prefix of ['/', '/nested/example/']) {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const errors = [], missing = [], escaped = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('response', r => { if (r.status() >= 400) missing.push(`${r.status()} ${r.url()}`); });
    page.on('request', r => { const url = new URL(r.url()); if (url.host === '127.0.0.1:4195' && !url.pathname.startsWith(prefix)) escaped.push(url.pathname); });
    const start = Date.now();
    await page.goto(`http://127.0.0.1:4195${prefix}wuhan/`);
    await page.waitForFunction(() => window.__wuhan?.ready, { timeout: 120000 });
    const loadMs = Date.now() - start;
    await page.waitForTimeout(3200);
    const initial = await page.evaluate(() => window.__wuhan.getState());
    assert.equal(initial.rendererCount, 1);
    assert.ok(initial.triangles > 100000);
    assert.equal(await page.evaluate(() => Boolean(window.__shenzhen)), false);
    await page.mouse.move(800, 500); await page.mouse.down(); await page.mouse.move(920, 540, { steps: 8 }); await page.mouse.up();
    await page.mouse.wheel(0, -180);
    await page.waitForTimeout(300);
    assert.notDeepEqual((await page.evaluate(() => window.__wuhan.getState())).camera, initial.camera);
    const hillSamples = await page.evaluate(() => [[114.275, 30.558], [114.308, 30.546], [114.366, 30.537], [114.418, 30.551]].map(p => window.__wuhan.sample(...p)));
    hillSamples.forEach(sample => { assert.equal(sample?.kind, 'ground'); assert.ok(sample.height > .2); });
    const waterSamples = await page.evaluate(() => [[114.289, 30.557], [114.271, 30.563], [114.399, 30.58]].map(p => window.__wuhan.sample(...p)));
    waterSamples.forEach(sample => { assert.equal(sample?.kind, 'water'); assert.equal(sample.traversable, false); });
    assert.equal(await page.evaluate(() => window.__wuhan.sample(115, 31)), null);
    if (prefix === '/') {
      for (const id of ['confluence', 'guishan', 'donghu', 'luojia', 'moshan', 'overview']) {
        await page.locator(`[data-region="${id}"]`).click();
        await page.waitForFunction(() => !window.__wuhan.getState().flying);
        await page.screenshot({ path: `probe/wuhan/${id}-day.png` });
        if (['guishan', 'luojia', 'moshan'].includes(id)) {
          await page.locator('[data-light="sunset"]').click();
          await page.screenshot({ path: `probe/wuhan/${id}-sunset.png` });
          await page.locator('[data-light="day"]').click();
        }
      }
    }
    await page.locator('#labels-toggle').click();
    assert.equal((await page.evaluate(() => window.__wuhan.getState())).labelsVisible, false);
    await page.locator('#mesh-toggle').click();
    assert.equal((await page.evaluate(() => window.__wuhan.getState())).wireframe, true);
    await page.locator('[data-region="moshan"]').click();
    await page.waitForFunction(() => !window.__wuhan.getState().flying);
    if (prefix === '/') await page.screenshot({ path: 'probe/wuhan/moshan-mesh.png' });
    await page.locator('#mesh-toggle').click();
    await page.locator('#labels-toggle').click();
    await page.locator('#info-toggle').click();
    assert.equal(await page.locator('#data-panel').isVisible(), true);
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('#data-panel').isVisible(), false);
    assert.deepEqual(errors, []); assert.deepEqual(missing, []); assert.deepEqual(escaped, []);
    results.push({ prefix, loadMs, initial, hillSamples, errors, missing, escaped });
    await page.evaluate(() => window.__wuhan.dispose());
    assert.equal(await page.locator('canvas').count(), 0);
    await page.close();
  }
  const mobile = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
  await mobile.goto('http://127.0.0.1:4195/wuhan/');
  await mobile.waitForFunction(() => window.__wuhan?.ready, { timeout: 120000 });
  assert.equal(await mobile.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await mobile.screenshot({ path: 'probe/wuhan/mobile.png' });
  await mobile.locator('#info-toggle').tap();
  await mobile.screenshot({ path: 'probe/wuhan/mobile-data.png' });
  assert.equal(await mobile.locator('#data-panel').isVisible(), true);
  await mobile.close();
  for (const failure of ['version', 'checksum', 'missing']) {
    const page = await browser.newPage();
    if (failure === 'version') await page.route('**/cities/wuhan/manifest.json', async route => {
      const data = JSON.parse(await readFile('atlas-site/cities/wuhan/manifest.json', 'utf8'));
      data.schemaVersion = 999;
      await route.fulfill({ contentType: 'application/json', body: JSON.stringify(data) });
    });
    else await page.route('**/data/wuhan/water.bin', async route => {
      if (failure === 'missing') return route.fulfill({ status: 404, body: '' });
      const data = await readFile('atlas-site/data/wuhan/water.bin'); data[0] ^= 1;
      await route.fulfill({ contentType: 'application/octet-stream', body: data });
    });
    await page.goto('http://127.0.0.1:4195/wuhan/');
    await page.locator('#retry').waitFor({ state: 'visible', timeout: 30000 });
    assert.equal(await page.locator('canvas').count(), 0);
    results.push({ failure, message: await page.locator('#loading-detail').textContent() });
    await page.close();
  }
  await writeFile('probe/wuhan/browser-results.json', JSON.stringify(results, null, 2));
  console.log(JSON.stringify(results, null, 2));
} finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
