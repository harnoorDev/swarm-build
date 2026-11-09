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

// a fresh page that records errors, scene and work events, trace lines, and every agent it sees.
// `swap: [from, to]` edits the page's source on the way in; `init` runs before the page's own scripts.
async function open(file, { swap, init, ...options } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 960, height: 540 }, ...options });
  await ctx.route(/cdn\.jsdelivr\.net\/npm\/three@[^/]+\/build\/([^?]+)/, async (r) => r.fulfill({   // three from node_modules, not the CDN
    contentType: 'text/javascript', body: await readFile(path.join(threeBuild, r.request().url().match(/build\/([^?]+)/)[1])) }));
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  if (swap) await ctx.route('**/examples/' + file, async (r) => {
    const res = await r.fetch(), body = await res.text();
    assert.ok(body.includes(swap[0]), 'the source to swap is in ' + file);
    r.fulfill({ response: res, body: body.replace(swap[0], swap[1]) });
  });
  if (init) await ctx.addInitScript(init);
  await ctx.addInitScript(() => {
    const k = (window.__k = { scene: [], work: [], agents: new Set(), trace: new Set() });
    document.addEventListener('swarm:scene', (e) => k.scene.push(e.detail.phase));
    document.addEventListener('swarm:work', (e) => k.work.push(e.detail));
    const look = () => {
      document.querySelectorAll('.sb-ag__tag').forEach((t) => k.agents.add(t.firstChild.textContent));
      document.querySelectorAll('.sb-trace').forEach((t) => k.trace.add(t.textContent));
      requestAnimationFrame(look);
    };
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
const seen = (page) => page.evaluate(() => ({ ...window.__k, agents: [...window.__k.agents], trace: [...window.__k.trace] }));

test('page demo: every region builds as it scrolls into view and nothing is left behind', { timeout: 240000 }, async () => {
  const { ctx, page, errors } = await open('index.html', { viewport: { width: 1280, height: 800 } });
  await page.waitForFunction(() => document.querySelector('[data-swarm].swarm-done'), null, { timeout: 90000, polling: 500 });
  const opening = (await seen(page)).agents;
  assert.ok(opening.includes('planner') && !opening.includes('analyst') && !opening.includes('renderer'), 'on call agents stay out of the opening crew: ' + opening);
  const height = await page.evaluate(() => document.documentElement.scrollHeight);
  for (let y = 0; y <= height; y += 400) { await page.evaluate((v) => scrollTo(0, v), y); await page.waitForTimeout(500); }
  // regions build one after another, so the last can take a while after the scroll
  await page.waitForFunction(() => [...document.querySelectorAll('[data-swarm]')].every((r) => r.classList.contains('swarm-done')) && !document.querySelector('.sb-layer'), null, { timeout: 120000, polling: 500 });
  const left = await page.evaluate(() => ({
    split: document.querySelectorAll('.sb-ch, .sb-wd').length,
    hidden: [...document.querySelectorAll('[data-swarm-step]')].filter((el) => getComputedStyle(el).opacity === '0' || getComputedStyle(el).visibility === 'hidden').length,
  }));
  assert.deepEqual(left, { split: 0, hidden: 0 });
  const k = await seen(page);
  assert.ok(!k.agents.includes('renderer'), 'no renderer on a page without a scene');
  assert.ok(k.agents.includes('analyst'), 'the analyst joins the region with the chart');
  assert.ok(k.trace.some((t) => /launch checklist · 6\/6 passed/.test(t)), 'the checklist is signed off: ' + k.trace.join(' | '));
  assert.ok(k.trace.some((t) => /plotting eval pass rate · 4 bars/.test(t)), 'the chart is plotted');
  const chart = await page.evaluate(() => ({
    clips: [...document.querySelectorAll('[data-swarm-bar]')].map((b) => b.style.clipPath),
    values: [...document.querySelectorAll('[data-swarm-bar] span')].map((s) => s.textContent),
    items: [...document.querySelectorAll('.checks li')].map((li) => li.style.opacity + li.style.translate),
    marks: document.querySelectorAll('[data-sb-clip], [data-sb-fade]').length,
  }));
  assert.deepEqual(chart, { clips: ['', '', '', ''], values: ['71%', '84%', '93%', '98%'], items: ['', '', '', '', '', ''], marks: 0 });
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('page demo, data saver: the finished page at once, no agents', { timeout: 120000 }, async () => {
  const { ctx, page, errors } = await open('index.html', {
    viewport: { width: 1280, height: 800 },
    init: () => Object.defineProperty(Navigator.prototype, 'connection', { configurable: true, get: () => ({ saveData: true }) }),
  });
  await page.waitForTimeout(2500);
  const k = await seen(page);
  assert.deepEqual(k.agents, []);
  const state = await page.evaluate(() => ({
    js: document.documentElement.classList.contains('swarm-js'),
    layers: document.querySelectorAll('.sb-layer').length,
    hidden: [...document.querySelectorAll('[data-swarm-step]')].filter((el) => getComputedStyle(el).opacity === '0' || getComputedStyle(el).visibility === 'hidden').length,
  }));
  assert.deepEqual(state, { js: false, layers: 0, hidden: 0 });
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('grow: SVG bars grow up, wide bars grow across, and both end clean', { timeout: 120000 }, async () => {
  const assets = base.replace('/examples/', '/assets/');
  const ctx = await browser.newContext({ viewport: { width: 900, height: 640 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.route('**/examples/grow-test.html', (r) => r.fulfill({ contentType: 'text/html', body: `<!doctype html><html class="swarm-js"><head>
    <link rel="stylesheet" href="${assets}swarm-build.css"></head><body style="margin:0;font:16px sans-serif">
    <main data-swarm style="padding:60px">
      <svg data-swarm-step="grow" data-swarm-label="svg chart" width="300" height="200">
        <rect x="10" y="60" width="50" height="140" fill="#f63"/><rect x="80" y="20" width="50" height="180" fill="#f63"/></svg>
      <div data-swarm-step="grow" data-swarm-label="wide chart" style="display:grid;gap:8px;width:420px;margin-top:24px">
        <div class="h" style="height:26px;width:60%;background:#f63">60%</div><div class="h" style="height:26px;width:90%;background:#f63">90%</div></div>
    </main>
    <script type="module">
      import { swarmBuild } from '${assets}swarm-build.js';
      const k = (window.__clips = { rect: new Set(), wide: new Set(), glyphs: new Set() });
      const look = () => {
        document.querySelectorAll('rect').forEach((r) => r.style.clipPath && k.rect.add(r.style.clipPath));
        document.querySelectorAll('.h').forEach((d) => d.style.clipPath && k.wide.add(d.style.clipPath));
        document.querySelectorAll('.sb-ag[data-g]').forEach((a) => k.glyphs.add(a.dataset.g));
        requestAnimationFrame(look);
      };
      requestAnimationFrame(look);
      swarmBuild({ once: 'always', trace: false }).start();
    </script></body></html>` }));
  await page.goto(base + 'grow-test.html');
  await page.waitForFunction(() => document.querySelector('[data-swarm].swarm-done') && !document.querySelector('.sb-layer'), null, { timeout: 60000, polling: 250 });
  const r = await page.evaluate(() => ({
    rect: [...window.__clips.rect], wide: [...window.__clips.wide], glyphs: [...window.__clips.glyphs],
    end: [...document.querySelectorAll('rect, .h')].map((b) => b.style.clipPath), values: [...document.querySelectorAll('.h')].map((d) => d.textContent),
  }));
  // browsers shorten inset(): read top / right as the first two values, whatever the form
  const sides = (c) => c.replace(/^inset\(|\)$/g, '').split(/\s+/).map((v) => parseFloat(v));
  const partway = (n) => n > 0 && n < 100;
  assert.ok(r.rect.some((c) => partway(sides(c)[0]) && sides(c)[1] === 0), 'SVG bars were clipped from the top, partway: ' + r.rect.slice(0, 5));
  assert.ok(r.wide.some((c) => sides(c)[0] === 0 && partway(sides(c)[1])), 'wide bars were clipped from the right, partway: ' + r.wide.slice(0, 5));
  assert.ok(r.glyphs.includes('ns') && r.glyphs.includes('ew'), 'the analyst used both resize cursors: ' + r.glyphs);
  assert.deepEqual(r.end, ['', '', '', '']);
  assert.deepEqual(r.values, ['60%', '90%']);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('3D starter, a build site that throws: logged once, and the build still finishes', { timeout: 240000 }, async () => {
  const { ctx, page, errors } = await open('3d-starter.html', {
    swap: ['raise.point = () => at(lighthouse, 7.6 * f(raise));', "raise.point = () => { if (f(raise) > 0.5) throw new Error('site broke'); return at(lighthouse, 7.6 * f(raise)); };"],
  });
  await built(page, 180000);
  assert.equal(errors.filter((e) => /site broke/.test(e)).length, 1, errors.join('\n'));
  assert.deepEqual(errors.filter((e) => !/site broke/.test(e)), []);
  const k = await seen(page);
  assert.equal(k.scene.at(-1), 'ready');
  assert.equal(k.work.filter((w) => w.phase === 'done').length, 8, 'every other job still finishes');
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
