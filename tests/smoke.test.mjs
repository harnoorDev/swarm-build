// Every demo builds to the end in a real browser, with no errors and nothing left behind.
// Run: node --test tests/   (needs Playwright and three: npm install --no-save playwright three,
// then npx playwright install chromium). CHROME_PATH uses an installed Chrome instead.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const threeBuild = path.dirname(createRequire(import.meta.url).resolve('three'));   // three/build
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.gif': 'image/gif', '.webp': 'image/webp', '.svg': 'image/svg+xml' };
let server, base, browser;

before(async () => {
  server = http.createServer(async (req, res) => {
    const file = path.join(root, decodeURIComponent(new URL(req.url, 'http://x').pathname));
    if (!file.startsWith(root)) return res.writeHead(403).end();
    try { res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' }).end(await readFile(file)); }
    catch { res.writeHead(404).end(); }
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}/skills/swarm-build/examples/`;
  browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined, args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-angle=swiftshader'] });
});
after(async () => { await browser?.close(); server?.close(); });

// a fresh page that records errors, scene and work events, and every agent it sees
async function open(file, options = {}) {
  const ctx = await browser.newContext({ viewport: { width: 960, height: 540 }, ...options });
  await ctx.route(/cdn\.jsdelivr\.net\/npm\/three@[^/]+\/build\/([^?]+)/, async (r) => r.fulfill({   // three from node_modules, not the CDN
    contentType: 'text/javascript', body: await readFile(path.join(threeBuild, r.request().url().match(/build\/([^?]+)/)[1])) }));
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  await ctx.addInitScript(() => {
    const k = (window.__k = { scene: [], work: [], agents: new Set() });
    document.addEventListener('swarm:scene', (e) => k.scene.push(e.detail.phase));
    document.addEventListener('swarm:work', (e) => k.work.push(e.detail));
    const look = () => { document.querySelectorAll('.sb-ag__tag').forEach((t) => k.agents.add(t.firstChild.textContent)); requestAnimationFrame(look); };
    requestAnimationFrame(look);
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error' && !/fonts\.g/.test(m.location().url || '') && !/ERR_FAILED/.test(m.text())) errors.push(m.text()); });
  await page.goto(base + file, { waitUntil: 'load' });
  return { ctx, page, errors };
}
const built = (page, timeout) => page.waitForFunction(() => document.querySelector('main.swarm-done') && !document.querySelector('.sb-layer'), null, { timeout, polling: 500 });
const seen = (page) => page.evaluate(() => ({ ...window.__k, agents: [...window.__k.agents] }));

test('page demo: every region builds as it scrolls into view and nothing is left behind', { timeout: 240000 }, async () => {
  const { ctx, page, errors } = await open('index.html', { viewport: { width: 1280, height: 800 } });
  await page.waitForFunction(() => document.querySelector('[data-swarm].swarm-done'), null, { timeout: 90000, polling: 500 });
  const height = await page.evaluate(() => document.documentElement.scrollHeight);
  for (let y = 0; y <= height; y += 400) { await page.evaluate((v) => scrollTo(0, v), y); await page.waitForTimeout(500); }
  // regions build one after another, so the last can take a while after the scroll
  await page.waitForFunction(() => [...document.querySelectorAll('[data-swarm]')].every((r) => r.classList.contains('swarm-done')) && !document.querySelector('.sb-layer'), null, { timeout: 120000, polling: 500 });
  const left = await page.evaluate(() => ({
    split: document.querySelectorAll('.sb-ch, .sb-wd').length,
    hidden: [...document.querySelectorAll('[data-swarm-step]')].filter((el) => getComputedStyle(el).opacity === '0' || getComputedStyle(el).visibility === 'hidden').length,
  }));
  assert.deepEqual(left, { split: 0, hidden: 0 });
  assert.ok(!(await seen(page)).agents.includes('renderer'), 'no renderer on a page without a scene');
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('3D starter: four agents build the island and report every job', { timeout: 240000 }, async () => {
  const { ctx, page, errors } = await open('3d-starter.html');
  await built(page, 180000);
  const k = await seen(page);
  assert.deepEqual([...k.agents].sort(), ['carpenter', 'gardener', 'mason', 'renderer']);
  assert.equal(k.scene.at(-1), 'ready');
  const starts = k.work.filter((w) => w.phase === 'start'), dones = k.work.filter((w) => w.phase === 'done');
  assert.equal(starts.length, 8);
  assert.equal(dones.length, 8);
  assert.ok(dones.some((w) => w.agent === 'gardener' && w.doing === 'planting trees 5/5'), JSON.stringify(dones));
  assert.ok((await page.locator('.log li').count()) >= 3, 'the log shows finished jobs');
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('3D starter, reduced motion: finished at once, no agents', { timeout: 120000 }, async () => {
  const { ctx, page, errors } = await open('3d-starter.html', { reducedMotion: 'reduce' });
  await page.waitForTimeout(3000);
  const k = await seen(page);
  assert.deepEqual(k.agents, []);
  assert.equal(k.work.length, 0);
  assert.equal(k.scene.at(-1), 'ready');
  assert.equal(await page.evaluate(() => document.querySelectorAll('.sb-layer').length), 0);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('3D world: a crew of sixteen builds it ahead of the train', { timeout: 420000 }, async () => {
  const { ctx, page, errors } = await open('3d.html', { viewport: { width: 800, height: 450 } });
  await built(page, 360000);
  const k = await seen(page);
  assert.equal(k.agents.length, 16, k.agents.join(', '));
  assert.equal(k.scene.at(-1), 'ready');
  assert.ok(k.work.filter((w) => w.phase === 'done').length >= 100, 'jobs finished: ' + k.work.length / 2);
  assert.match(await page.locator('.session').textContent(), /built in 0:20\.0$/);
  assert.deepEqual(errors, []);
  await ctx.close();
});
