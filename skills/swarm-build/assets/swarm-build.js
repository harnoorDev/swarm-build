// swarm-build.js · v1.1.0 · MIT
// A crew of labelled agent cursors builds your page in front of the visitor:
// boxes drawn with live W × H badges, text typed with an I-beam, accents
// restyled, copy streamed like model output, numbers counted and verified,
// and (optionally) a red-team agent that tries to rewrite a word until the
// guardrail agent blocks it. 3D scenes (Three.js, React Three Fiber, Babylon,
// Spline, <model-viewer>, any <canvas>) are built too: the renderer agent
// frames the viewport and sweeps it in, geometry → materials → lighting, while
// your scene follows along through `swarm:scene` progress events.
//
// Zero dependencies. Content stays in the DOM the whole time; agents only hide
// and reveal it. Layers are aria-hidden, split text is restored when a region
// finishes, reduced motion turns everything off, and any key, click, tap or
// scroll fast-forwards a build.
//
// Inspired by Joel Califa's Swarm (https://github.com/califa/swarm-site).
// Written from scratch; no code from that project.
//
// Markup (see references/api.md):
//   <section data-swarm>                      a region; built when it scrolls into view
//     <h1 data-swarm-step="type"              typed by the writer
//         data-swarm-attack="without>with">   red-team rewrite, blocked by the guardrail
//       Ship it <em>without</em> the breach   <em> / [data-swarm-accent] restyled by the stylist
//     </h1>
//     <div data-swarm-step="frame">           boxed by the planner, then revealed
//     <p data-swarm-step="frame stream">      boxed, then streamed word by word
//     <span data-swarm-step="fetch">          scrambled in by the retriever
//     <b data-swarm-step="count">2.2K</b>     counted up and checked by eval
//     <canvas data-swarm-step="scene"         a 3D viewport, swept in by the renderer;
//             data-swarm-await                (optional) wait for swarm.ready(canvas) before sweeping
//             data-swarm-anchors="apex, core" (optional) points in the scene the renderer inspects
//             data-swarm-sweep="none"         (optional) no wipe: the scene animates its own build
//             data-swarm-duration="6">        (optional) seconds the build takes (default 1.5)
//   <i data-swarm-origin>                     the crew orbits this before the first build
//   <p data-swarm-credit hidden>Built by {agents} agents while you watched.</p>

const VERSION = '1.3.0';
const DEFAULT_CREW = {
  planner: '#4ee9f5', retriever: '#e7ff52', writer: '#ffb547', stylist: '#ff8fd8',
  eval: '#6aa8ff', guardrail: '#8dffb9', 'red-team': '#ff3b3b', renderer: '#b49bff', analyst: '#ff7a45',
};
const ROLE = { frame: 'planner', fetch: 'retriever', type: 'writer', stream: 'writer', count: 'eval', check: 'eval', grow: 'analyst', scene: 'renderer', reveal: null };
// agents that only join the opening crew when the page has their kind of work (a 3D scene, a chart)
const ON_CALL = new Set(['renderer', 'analyst']);
// a scene builds in three phases; the sweep reports which one it is in
const PHASES = [[0, 'geometry'], [0.45, 'materials'], [0.8, 'lighting']];
const SCRAMBLE = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789/#%&*+=<>';
const EASE = {
  linear: (p) => p,
  out: (p) => 1 - (1 - p) ** 3,
  in: (p) => p * p * p,
  inOut2: (p) => (p < 0.5 ? 2 * p * p : 1 - (-2 * p + 2) ** 2 / 2),
  sine: (p) => -(Math.cos(Math.PI * p) - 1) / 2,
};
const OUTLINED = (d) => `<path d="${d}" fill="none" stroke="#0b0b0a" stroke-width="3.6" stroke-linecap="round"/><path d="${d}" fill="none" stroke="var(--c)" stroke-width="1.6" stroke-linecap="round"/>`;
const GLYPHS =
  '<svg class="sb-g sb-g--arrow" width="18" height="22" viewBox="0 0 18 22"><path d="M2 1.5v16.1l4.3-4 2.9 6.6 2.8-1.2-2.8-6.5H15z" fill="var(--c)" stroke="#0b0b0a" stroke-width="1.3" stroke-linejoin="round"/></svg>' +
  '<svg class="sb-g sb-g--ibeam" width="12" height="24" viewBox="0 0 12 24">' + OUTLINED('M2.5 2.5h7M6 2.5v19M2.5 21.5h7') + '</svg>' +
  '<svg class="sb-g sb-g--cross" width="22" height="22" viewBox="0 0 22 22">' + OUTLINED('M11 1.5v7M11 13.5v7M1.5 11h7M13.5 11h7') + '</svg>' +
  '<svg class="sb-g sb-g--ns" width="14" height="24" viewBox="0 0 14 24">' + OUTLINED('M7 2.5v19M3 6.5l4-4 4 4M3 17.5l4 4 4-4') + '</svg>' +
  '<svg class="sb-g sb-g--ew" width="24" height="14" viewBox="0 0 24 14">' + OUTLINED('M2.5 7h19M6.5 3l-4 4 4 4M17.5 3l4 4-4 4') + '</svg>' +
  '<svg class="sb-g sb-g--pen" width="22" height="22" viewBox="0 0 22 22"><path d="M2 20l1.7-5.7L14.6 3.4a2 2 0 0 1 2.8 0l1.2 1.2a2 2 0 0 1 0 2.8L7.7 18.3z" fill="var(--c)" stroke="#0b0b0a" stroke-width="1.3" stroke-linejoin="round"/><path d="M2 20l1.7-5.7 4 4z" fill="#0b0b0a"/></svg>';

const $$ = (s, el = document) => Array.from(el.querySelectorAll(s));
const store = (s) => ({
  get: (k) => { try { return s().getItem(k); } catch (e) { return null; } },
  set: (k, v) => { try { s().setItem(k, v); } catch (e) { /* storage blocked */ } },
});
const local = store(() => localStorage), session = store(() => sessionStorage);
const div = (cls) => { const e = document.createElement('div'); e.className = cls; return e; };
const stepsOf = (el) => (el.dataset.swarmStep || '').split(/\s+/).filter(Boolean);
const textNodes = (el) => { const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT), out = []; while (w.nextNode()) out.push(w.currentNode); return out; };
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const ACCENTS = 'em, [data-swarm-accent]';

// ------------------------------------------------------------------ timeline
// A tiny scheduler: calls and tweens at absolute times, played on rAF,
// fast-forwardable (scale), holdable (a 3D scene still loading its assets) and
// finishable (jump to the end, firing everything in order).
class Timeline {
  constructor() { this.items = []; this.t = 0; this.dur = 0; this.scale = 1; this.raf = 0; this.active = false; this.held = false; this.onDone = null; }
  hold() { this.held = true; }
  resume() { this.held = false; }
  call(at, fn) { this.items.push({ at, fn }); this.dur = Math.max(this.dur, at); return this; }
  tween(at, d, ease, update, init) {
    this.items.push({ at, d: Math.max(d, 1e-4), ease: EASE[ease] || EASE.out, update, init });
    this.dur = Math.max(this.dur, at + d);
    return this;
  }
  play() {
    this.items.sort((a, b) => a.at - b.at);
    this.active = true;
    let last = performance.now();
    const step = (now) => {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      if (!this.held) this.seek(this.t + dt * this.scale);
      if (this.t >= this.dur) this.finish(); else this.raf = requestAnimationFrame(step);
    };
    this.raf = requestAnimationFrame(step);
    return this;
  }
  seek(t) {
    this.t = t;
    for (const it of this.items) {
      if (it.at > t) break;
      if (it.fn ? it.fired : it.done) continue;
      try {
        if (it.fn) { it.fired = true; it.fn(); continue; }
        if (!it.started) { it.started = true; if (it.init) it.init(); }
        const p = Math.min(1, (t - it.at) / it.d);
        it.update(it.ease(p));
        if (p >= 1) it.done = true;
      } catch (err) {
        // one bad callback (often the page's own: a build site, a `doing` line) is dropped, and the build goes on;
        // left to throw, it would stop the frame loop and leave the page half-built
        it.fired = it.done = true;
        console.error('[swarm-build]', err);
      }
    }
  }
  finish() {
    if (!this.active) return;
    cancelAnimationFrame(this.raf);
    this.held = false;
    this.seek(this.dur + 1);
    this.active = false;
    if (this.onDone) this.onDone();
  }
}

// ------------------------------------------------------------------ engine
export function swarmBuild(options = {}) {
  const o = {
    crew: DEFAULT_CREW,
    key: 'swarm-build',
    once: 'session',          // 'session': build once per browser session · 'always': every load
    speed: 1,
    trace: true,
    you: true,
    rootMargin: '0px 0px -20% 0px',
    sceneTimeout: 4,          // seconds a data-swarm-await scene may hold its build before it is swept in anyway
    onRegionStart: null,
    onRegionEnd: null,
    ...options,
  };
  const root = document.documentElement;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  // a visitor saving data (Save-Data, or prefers-reduced-data) gets the finished page at once
  const lean = !!(navigator.connection && navigator.connection.saveData) || matchMedia('(prefers-reduced-data: reduce)').matches;
  const enabled = () => local.get(o.key + '-off') !== '1';
  const seen = () => o.once === 'session' && session.get(o.key) === '1';
  const active = !reduce && !lean && enabled() && !seen() && (root.classList.contains('swarm-js') || o.force === true);
  const originals = new Map();
  const queue = [];
  const agentsUsed = new Set();
  let io = null;
  let current = null, trace = null, traceTimer = 0, you = null, firstClaimed = false, started = false, attacks = 0;
  window.__swarmBuild = VERSION;

  // ---------------------------------------------------------------- 3D scenes
  // A scene element hears `swarm:scene` ({ progress 0→1, phase }) while it builds, and always ends on
  // progress 1 / 'ready': after its sweep, when skipped, on a repeat visit or with reduced motion.
  // So a scene that starts at progress 1 and only listens is never left half built.
  // name → { fn, at, by, hold, say, label, on }; fn() returns { x, y } in viewport pixels, or null when off screen.
  // An anchor with `at` is a build site: agent `by` works there while the scene is at that progress.
  const anchors = new Map();
  const loaded = new WeakSet();    // data-swarm-await scenes whose app said they are ready
  const settled = new WeakSet();   // scenes that already received their final 'ready'
  const sceneEvent = (el, progress, phase) => el.dispatchEvent(new CustomEvent('swarm:scene', { bubbles: true, detail: { progress, phase } }));
  const workEvent = (el, detail) => el.dispatchEvent(new CustomEvent('swarm:work', { bubbles: true, detail }));
  const sceneDone = (el) => {
    if (settled.has(el) || !stepsOf(el).includes('scene')) return;
    settled.add(el);
    if ('sbClip' in el.dataset) { el.style.clipPath = el.dataset.sbClip; delete el.dataset.sbClip; }
    sceneEvent(el, 1, 'ready');
  };
  const anchorNames = (el) => (el.dataset.swarmAnchors || '').split(',').map((s) => s.trim()).filter(Boolean).slice(0, 3);
  const firstScene = () => document.querySelector('[data-swarm-step~="scene"]');
  const sitesOf = (el) => [...anchors]
    .filter(([, s]) => s.at != null && (s.on ? (typeof s.on === 'string' ? el.matches(s.on) : s.on === el) : el === firstScene()))
    .map(([name, s]) => ({ ...s, name, at: Math.min(1, Math.max(0, +s.at || 0)) }))
    .sort((p, q) => p.at - q.at)
    .slice(0, 256);

  // ---------------------------------------------------------------- text helpers
  const remember = (el) => { if (!originals.has(el)) originals.set(el, el.innerHTML); };
  const restore = (el) => { if (originals.has(el)) { el.innerHTML = originals.get(el); originals.delete(el); } };
  function splitChars(el) {
    remember(el);
    textNodes(el).forEach((n) => {
      if (!n.textContent.length) return;
      const f = document.createDocumentFragment();
      for (const c of n.textContent) { const s = document.createElement('span'); s.className = 'sb-ch'; s.textContent = c; f.appendChild(s); }
      n.replaceWith(f);
    });
    $$(ACCENTS, el).forEach((a) => a.classList.add('sb-plain'));
    el.classList.add('sb-split');
  }
  function splitWords(el) {
    remember(el);
    textNodes(el).forEach((n) => {
      const f = document.createDocumentFragment();
      n.textContent.split(/(\s+)/).forEach((part) => {
        if (!part) return;
        if (/^\s+$/.test(part)) { f.appendChild(document.createTextNode(part)); return; }
        const s = document.createElement('span'); s.className = 'sb-wd'; s.textContent = part; f.appendChild(s);
      });
      n.replaceWith(f);
    });
    el.classList.add('sb-split');
  }
  const label = (el) => el.dataset.swarmLabel || (el.id ? '#' + el.id : el.tagName.toLowerCase() + (el.classList[0] && !el.classList[0].startsWith('sb-') ? '.' + el.classList[0] : ''));

  // ---------------------------------------------------------------- trace + you
  function say(who, msg) {
    if (!o.trace) return;
    if (!trace) {
      trace = div('sb-trace');
      trace.setAttribute('aria-hidden', 'true');
      document.body.appendChild(trace);
    }
    trace.style.setProperty('--c', o.crew[who] || 'currentColor');
    trace.innerHTML = '<b>' + esc(who) + '</b><span class="sb-trace__sep">▸</span>' + esc(msg);
    trace.classList.remove('is-out', 'is-in');
    void trace.offsetWidth;
    trace.classList.add('is-in');
    clearTimeout(traceTimer);
    traceTimer = setTimeout(() => trace && trace.classList.add('is-out'), 2600);
  }
  function youOn(on) {
    if (!o.you || !matchMedia('(hover: hover) and (pointer: fine)').matches) return;
    if (!you) {
      you = div('sb-you');
      you.setAttribute('aria-hidden', 'true');
      you.innerHTML = '<span>you</span>';
      document.body.appendChild(you);
      addEventListener('pointermove', (e) => { you.style.transform = `translate3d(${e.clientX}px,${e.clientY}px,0)`; you.classList.add('has-pos'); }, { passive: true });
    }
    you.classList.toggle('is-on', on);
  }

  // ---------------------------------------------------------------- one region
  function plan(region, isFirst) {
    const tl = new Timeline();
    tl.scale = o.speed;
    region.classList.add('sb-host');
    root.classList.add('sb-building');   // off-screen agents must not widen the page (mobile zooms out)
    if (getComputedStyle(region).position === 'static') region.classList.add('sb-rel');
    const layer = div('sb-layer');
    layer.setAttribute('aria-hidden', 'true');
    region.appendChild(layer);
    const origin = () => region.getBoundingClientRect();
    const rel = (el) => { const r = el.getBoundingClientRect(), g = origin(); return { x: r.left - g.left, y: r.top - g.top, w: r.width, h: r.height }; };
    const view = () => { const g = origin(); return { x0: -g.left, y0: -g.top, x1: innerWidth - g.left, y1: innerHeight - g.top }; };
    const put = (cls) => { const e = div(cls); layer.appendChild(e); return e; };

    // what this region builds, and the crew it needs
    const own = $$('[data-swarm-step]', region).filter((el) => el.closest('[data-swarm]') === region);
    const orphans = isFirst ? $$('[data-swarm-step]').filter((el) => !el.closest('[data-swarm]')) : [];
    const list = [...orphans, ...own];
    const need = new Set();
    list.forEach((el) => {
      stepsOf(el).forEach((s) => ROLE[s] && need.add(ROLE[s]));
      if (stepsOf(el).includes('type') && $$(ACCENTS, el).length) need.add('stylist');
      if (el.dataset.swarmAttack) { need.add('red-team'); need.add('guardrail'); }
      if (stepsOf(el).includes('scene')) sitesOf(el).forEach((s) => need.add(s.by || 'renderer'));
    });
    // the opening orbit shows the whole crew; the renderer only joins when this region has a 3D scene
    if (isFirst) Object.keys(o.crew).forEach((id) => { if (!ON_CALL.has(id) || need.has(id)) need.add(id); });
    const A = {};
    Object.keys(o.crew).filter((id) => need.has(id)).forEach((id, i) => {
      const el = put('sb-ag');
      el.dataset.g = 'arrow';
      el.style.setProperty('--c', o.crew[id]);
      el.innerHTML = '<div class="sb-ag__in" style="animation-delay:' + (-i * 0.37).toFixed(2) + 's">' + GLYPHS + '<span class="sb-ag__tag">' + esc(id) + '<span class="sb-ag__do"></span></span></div>';
      const caret = put('sb-caret');
      caret.style.background = o.crew[id];
      const a = { id, el, caret, x: -999, y: -999 };
      a.set = (x, y) => { a.x = x; a.y = y; el.style.transform = `translate3d(${x}px,${y}px,0)`; };
      a.tag = el.querySelector('.sb-ag__tag'); a.now = ''; a.tw = 0; a.side = 0;
      const line = el.querySelector('.sb-ag__do');
      a.doing = (txt) => {   // what it says it is doing, a second line on its name tag
        txt = txt ? String(txt) : '';
        if (txt === a.now) return;
        a.now = txt; a.tw = 0;
        if (txt) line.textContent = txt;
        el.classList.toggle('is-doing', !!txt);
      };
      a.set(-9999, -9999);
      A[id] = a;
      agentsUsed.add(id);
    });
    const crew = Object.values(A);
    // name tags keep clear of each other: a tag that would cover another flips to a free side of its cursor
    const SIDES = [(w) => [12, 16], (w) => [-w - 6, 16], (w, h) => [24, -h - 8], (w, h) => [-w - 6, -h - 8]];
    const tidy = () => {
      const placed = [];
      const free = (r) => !placed.some((q) => r[0] < q[0] + q[2] + 3 && r[0] + r[2] + 3 > q[0] && r[1] < q[1] + q[3] + 2 && r[1] + r[3] + 2 > q[1]);
      for (const ag of crew.filter((c) => c.x > -500 && c.y > -500).sort((c, d) => (d.now ? 1 : 0) - (c.now ? 1 : 0))) {
        if (!ag.tw) { ag.tw = ag.tag.offsetWidth; ag.th = ag.tag.offsetHeight; }
        const at = (k) => { const [dx, dy] = SIDES[k](ag.tw, ag.th); return [ag.x + dx, ag.y + dy, ag.tw, ag.th]; };
        let k = ag.side;
        if (!free(at(k))) k = [0, 1, 2, 3].find((i) => free(at(i))) ?? ag.side;
        placed.push(at(k));
        if (k !== ag.side) { ag.side = k; const [dx, dy] = SIDES[k](ag.tw, ag.th); ag.tag.style.left = dx + 'px'; ag.tag.style.top = dy + 'px'; }
      }
    };

    // primitives
    const go = (a, x, y, t, d = 0.45, ease = 'out') => {
      let fx, fy;
      tl.tween(Math.max(0, t), d, ease, (p) => a.set(fx + (x - fx) * p, fy + (y - fy) * p), () => { fx = a.x; fy = a.y; });
    };
    const glyph = (a, g, t) => tl.call(Math.max(0, t), () => { a.el.dataset.g = g; });
    const log = (who, msg, t) => tl.call(t, () => say(who, msg));
    const fade = (el, t, d = 0.3) => {
      tl.tween(t, d, 'out', (p) => { el.style.opacity = p; }, () => { el.classList.add('sb-built'); el.style.opacity = 0; });
      tl.call(t + d, () => { el.style.opacity = ''; });
    };
    const caretAt = (a, ch, before) => {
      const r = rel(ch), x = before ? r.x : r.x + r.w;
      Object.assign(a.caret.style, { display: 'block', left: x + 'px', top: (r.y + r.h * 0.14) + 'px', height: (r.h * 0.72) + 'px' });
      a.set(x + 5, r.y + r.h * 0.5);
    };

    function frame(a, el, t, d = 0.42) {
      const b = rel(el), pad = 4, x0 = b.x - pad, y0 = b.y - pad, w = b.w + pad * 2, h = b.h + pad * 2;
      const s = put('sb-sel');
      s.innerHTML = '<i></i><i></i><i></i><i></i><span class="sb-sel__wh"></span>';
      Object.assign(s.style, { left: x0 + 'px', top: y0 + 'px', width: 0, height: 0, opacity: 0 });
      const wh = s.lastChild;
      glyph(a, 'cross', t - 0.32);
      go(a, x0, y0, t - 0.32, 0.32);
      tl.tween(t, d, 'inOut2', (p) => {
        const cw = w * p, ch = h * p;
        s.style.opacity = 1; s.style.width = cw + 'px'; s.style.height = ch + 'px';
        wh.textContent = Math.round(cw) + ' × ' + Math.round(ch);
      });
      go(a, x0 + w, y0 + h, t, d, 'inOut2');
      tl.tween(t + d + 0.28, 0.25, 'out', (p) => { s.style.opacity = 1 - p; });
      glyph(a, 'arrow', t + d + 0.05);
      return t + d;
    }
    function type(a, chars, t, cps) {
      let tt = t;
      const b = rel(chars[0]);
      glyph(a, 'ibeam', t - 0.3);
      go(a, b.x + 4, b.y + b.h * 0.5, t - 0.3, 0.3);
      tl.call(t - 0.02, () => caretAt(a, chars[0], true));
      chars.forEach((ch) => {
        tt += (1 / cps) * (0.55 + Math.random() * 0.9);
        tl.call(tt, () => { ch.classList.add('on'); if (ch.textContent.trim()) caretAt(a, ch); });
      });
      tl.call(tt + 0.12, () => { a.caret.style.display = 'none'; });
      glyph(a, 'arrow', tt + 0.15);
      return tt;
    }
    function restyle(a, accent, t) {
      const chs = $$('.sb-ch', accent);
      if (!chs.length) return t;
      const r0 = rel(chs[0]), r1 = rel(chs[chs.length - 1]);
      const hl = put('sb-hl');
      Object.assign(hl.style, { left: r0.x + 'px', top: (r0.y + r0.h * 0.1) + 'px', height: (r0.h * 0.8) + 'px', width: 0, opacity: 0 });
      glyph(a, 'ibeam', t - 0.3);
      go(a, r0.x, r0.y + r0.h * 0.5, t - 0.3, 0.3);
      tl.tween(t, 0.3, 'inOut2', (p) => { hl.style.opacity = 1; hl.style.width = (r1.x + r1.w - r0.x) * p + 'px'; });
      go(a, r1.x + r1.w, r0.y + r0.h * 0.5, t, 0.3, 'inOut2');
      tl.call(t + 0.4, () => accent.classList.remove('sb-plain'));
      tl.tween(t + 0.42, 0.2, 'out', (p) => { hl.style.opacity = 1 - p; });
      glyph(a, 'arrow', t + 0.45);
      log('stylist', 'accent → “' + accent.textContent.trim() + '”', t + 0.05);
      return t + 0.45;
    }
    function scramble(el, t, d = 0.45) {
      let nodes = [], finals = [];
      tl.tween(t, d, 'linear', (p) => {
        nodes.forEach((n, i) => {
          const f = finals[i], k = Math.floor(p * f.length);
          let s = f.slice(0, k);
          for (let j = k; j < f.length; j++) s += /\s/.test(f[j]) ? f[j] : SCRAMBLE[(Math.random() * SCRAMBLE.length) | 0];
          n.textContent = p >= 1 ? f : s;
        });
      }, () => { el.classList.add('sb-built'); nodes = textNodes(el).filter((n) => n.textContent.trim()); finals = nodes.map((n) => n.textContent); });
    }
    function count(el, t, d = 0.8) {
      let parts = [];
      tl.tween(t, d, 'out', (p) => {
        parts.forEach((q) => { q.n.textContent = p >= 1 ? q.text : q.pre + (q.num * p).toFixed(q.dec) + q.post; });
      }, () => {
        el.classList.add('sb-built');
        parts = textNodes(el).map((n) => {
          const m = n.textContent.match(/^([\s\S]*?)(\d[\d,]*\.?\d*)([\s\S]*)$/);
          return m ? { n, pre: m[1], num: parseFloat(m[2].replace(/,/g, '')), dec: (m[2].split('.')[1] || '').length, post: m[3], text: n.textContent } : null;
        }).filter(Boolean);
      });
    }
    // the parts of things that show a value ("98%", "4.2K", "$12", "800 ms"); they count up as they appear
    const VALUE = /^(\s*[$€£¥]?)(\d[\d,]*\.?\d*)(\s*(?:%|[kKmMbB]|ms|s|x)?\s*)$/;
    const values = (el) => textNodes(el).map((n) => {
      const m = n.textContent.match(VALUE);
      return m ? { n, pre: m[1], num: parseFloat(m[2].replace(/,/g, '')), dec: (m[2].split('.')[1] || '').length, post: m[3], text: n.textContent } : null;
    }).filter(Boolean);
    const tally = (parts, p) => parts.forEach((q) => { q.n.textContent = p >= 1 ? q.text : q.pre + (q.num * p).toFixed(q.dec) + q.post; });
    const partsOf = (el, mark) => { const marked = $$('[' + mark + ']', el); return marked.length ? marked : Array.from(el.children).filter((c) => !c.matches('script, style, template')); };

    // grow: the analyst drags each bar of a chart out from its base, its value counting up with it.
    // A clip reveal, not a scale, so text inside a bar never squashes.
    function grow(a, el, t) {
      const bars = partsOf(el, 'data-swarm-bar');
      tl.call(t, () => el.classList.add('sb-built'));
      if (!bars.length) { fade(el, t, 0.3); return t + 0.3; }
      const axisOf = (bar) => { const f = bar.dataset.swarmGrow || el.dataset.swarmGrow; if (f === 'x' || f === 'y') return f; const r = bar.getBoundingClientRect(); return r.height >= r.width ? 'y' : 'x'; };
      const per = Math.min(0.42, Math.max(0.14, 2.4 / bars.length));
      const axis0 = axisOf(bars[0]);
      glyph(a, axis0 === 'y' ? 'ns' : 'ew', t - 0.15);
      log('analyst', 'plotting ' + label(el) + ' · ' + bars.length + ' bars', t);
      bars.forEach((b) => { b.dataset.sbClip = b.style.clipPath; b.style.clipPath = 'inset(0 0 100% 0)'; });   // from now: a frame step may show the chart first
      bars.forEach((bar, i) => {
        const axis = axisOf(bar), r = rel(bar), ti = t + i * per;
        const base = axis === 'y' ? [r.x + r.w / 2, r.y + r.h] : [r.x, r.y + r.h / 2];
        go(a, base[0], base[1], ti - (i ? per * 0.3 : 0.4), i ? per * 0.3 : 0.4);
        let parts = [];
        tl.tween(ti, per * 0.85, 'out', (p) => {
          bar.style.clipPath = p >= 1 ? bar.dataset.sbClip : axis === 'y' ? `inset(${(1 - p) * 100}% 0 0 0)` : `inset(0 ${(1 - p) * 100}% 0 0)`;
          if (p >= 1) delete bar.dataset.sbClip;
          tally(parts, p);
          if (p < 1) a.set(axis === 'y' ? base[0] : r.x + r.w * p, axis === 'y' ? r.y + r.h * (1 - p) : base[1]);
        }, () => { parts = values(bar); });
      });
      const done = t + bars.length * per;
      glyph(a, 'arrow', done + 0.05);
      return done;
    }

    // check: the eval agent works down a list, ticking each item in as it lands, then signs the list off
    function check(a, el, t) {
      const items = partsOf(el, 'data-swarm-item');
      tl.call(t, () => el.classList.add('sb-built'));
      if (!items.length) { fade(el, t, 0.3); return t + 0.3; }
      const per = Math.min(0.26, Math.max(0.1, 2 / items.length));
      log('eval', 'checking ' + label(el) + ' · ' + items.length + ' items', t);
      items.forEach((it) => { it.dataset.sbFade = it.style.opacity; it.style.opacity = '0'; });   // from now: a frame step may show the list first
      const ticks = [];
      let last = null;
      items.forEach((it, i) => {
        const r = rel(it), ti = t + 0.15 + i * per, cs = getComputedStyle(it);
        const lh = parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.4 || 20;
        const y = r.y + Math.min(r.h / 2, (parseFloat(cs.paddingTop) || 0) + lh / 2);   // the middle of its first line
        last = r;
        go(a, r.x - 30, y + 4, ti - (i ? per * 0.55 : 0.35), i ? per * 0.55 : 0.35);
        const tick = put('sb-tick');
        ticks.push(tick);
        Object.assign(tick.style, { left: (r.x - 14) + 'px', top: y + 'px', opacity: 0 });
        tick.style.setProperty('--sb-tick', o.crew[a.id] || '#6aa8ff');
        tl.tween(ti, 0.18, 'out', (p) => { tick.style.opacity = p; tick.style.transform = `scale(${0.4 + 0.6 * p})`; });
        tl.tween(ti + 0.02, 0.28, 'out', (p) => {
          it.style.opacity = p >= 1 ? it.dataset.sbFade : String(p);
          it.style.translate = p >= 1 ? '' : `${-8 * (1 - p)}px 0`;
          if (p >= 1) delete it.dataset.sbFade;
        });
      });
      const done = t + 0.15 + items.length * per;
      chip('✓ ' + items.length + '/' + items.length + ' passed', o.crew.eval, last.x, last.y + last.h + 8, done, 1.1);
      log('eval', label(el) + ' · ' + items.length + '/' + items.length + ' passed', done);
      tl.tween(done + 0.8, 0.35, 'in', (p) => ticks.forEach((k) => { k.style.opacity = 1 - p; }));
      return done;
    }

    function chip(text, color, x, y, t, life) {
      const c = put('sb-chip');
      c.textContent = text;
      Object.assign(c.style, { background: color, left: x + 'px', top: y + 'px', opacity: 0 });
      tl.tween(t, 0.25, 'out', (p) => { c.style.opacity = p; c.style.transform = `translateY(${6 * (1 - p)}px)`; });
      tl.tween(t + life, 0.3, 'in', (p) => { c.style.opacity = 1 - p; });
    }
    function attack(el, chars, t) {
      const [from = '', to = ''] = el.dataset.swarmAttack.split('>').map((s) => s.trim());
      const text = chars.map((c) => c.textContent).join('');
      const at = from ? text.indexOf(from) : -1;
      const Rd = A['red-team'], Gd = A.guardrail;
      if (at < 0 || !Rd || !Gd) return t;
      attacks++;
      const word = chars.slice(at, at + from.length);
      let k = 0;
      while (k < from.length && k < to.length && from[k] === to[k]) k++;
      const doomed = word.slice(k), first = rel(word[0]), last = rel(word[word.length - 1]), v = view();
      tl.call(Math.max(0, t - 0.01), () => Rd.set(v.x1 + 60, first.y + first.h * 0.5 - 40));
      go(Gd, Math.min(v.x1 - 110, last.x + last.w + 50), first.y - 4, t - 1.2, 0.55);
      go(Rd, last.x + last.w + 5, last.y + last.h * 0.5, t, 0.5);
      glyph(Rd, 'ibeam', t + 0.38);
      log('red-team', 'rewrite “' + from + '” → “' + to + '”', t + 0.3);
      tl.call(t + 0.5, () => caretAt(Rd, word[word.length - 1]));
      let tt = t + 0.62;
      const inserted = [];
      doomed.slice().reverse().forEach((c) => {
        tl.call(tt, () => { c.classList.add('del'); const prev = word[word.indexOf(c) - 1]; if (prev) caretAt(Rd, prev); });
        tt += 0.12;
      });
      to.slice(k).split('').forEach((ch) => {
        tl.call(tt, () => {
          const s = document.createElement('span');
          s.className = 'sb-ch on sb-ins'; s.textContent = ch;
          const anchor = inserted.length ? inserted[inserted.length - 1] : (doomed[doomed.length - 1] || word[word.length - 1]);
          anchor.after(s); inserted.push(s); caretAt(Rd, s);
        });
        tt += 0.1;
      });
      const tG = tt + 0.25;
      const guard = put('sb-guard');
      guard.style.opacity = 0;
      const fit = () => {
        const live = word.filter((c) => !c.classList.contains('del'));
        const a0 = rel(live[0] || inserted[0] || word[0]);
        const z = rel(inserted.length ? inserted[inserted.length - 1] : live[live.length - 1] || word[0]);
        Object.assign(guard.style, { left: (a0.x - 8) + 'px', top: (a0.y + a0.h * 0.04) + 'px', width: Math.max(24, z.x + z.w - a0.x + 16) + 'px', height: (a0.h * 0.92) + 'px' });
      };
      go(Gd, first.x - 4, first.y + first.h * 0.92, tG - 0.3, 0.3);
      tl.call(tG, fit);
      tl.tween(tG, 0.22, 'out', (p) => { guard.style.opacity = p; guard.style.transform = `scale(${1.08 - 0.08 * p})`; });
      chip('BLOCKED · prompt injection', o.crew.guardrail, first.x - 4, first.y + first.h * 0.92 + 26, tG + 0.05, 1.25);
      log('guardrail', 'blocked prompt injection · rolled back', tG + 0.04);
      let shook = 0;
      tl.tween(tG + 0.02, 0.27, 'linear', (p) => { const off = p >= 1 ? 0 : Math.sin(p * Math.PI * 6) * 7; Rd.set(Rd.x - shook + off, Rd.y); shook = off; });
      tl.call(tG + 0.32, () => {
        Rd.caret.style.display = 'none';
        inserted.forEach((s) => s.remove());
        doomed.forEach((c) => { c.classList.remove('del'); c.classList.add('flash'); });
        fit();
      });
      glyph(Rd, 'arrow', tG + 0.32);
      go(Rd, v.x1 + 90, first.y - 60, tG + 0.4, 0.45, 'in');
      tl.call(tG + 1.05, () => doomed.forEach((c) => c.classList.remove('flash')));
      tl.tween(tG + 1.05, 0.3, 'out', (p) => { guard.style.opacity = 1 - p; });
      return tG + 0.55;
    }
    // a point inside a 3D scene, projected into this layer; follows it while it moves
    const project = (fn) => () => {
      const q = fn && fn();
      if (!q) return null;
      const g = origin();
      return { x: q.x - g.left, y: q.y - g.top };
    };
    // agent `ag` travels to a scene point at `t`, then holds on to it for `hold` seconds under a pin,
    // and then `stay`s with it (no pin) so a moving camera never leaves it hanging in mid-air
    // `look`: { glyph } is the cursor it works with (arrow, cross, ibeam or pen), { pin: false } leaves out the ring,
    // { doing } a line (or a function returning one) shown under its name while it works, { next } where it goes after
    function visit(ag, at, t, hold, text, color, stay = 0, look = {}) {
      const g = look.glyph || 'arrow', off = g === 'arrow' ? 6 : 0;   // the arrow points at its work, the others sit on it
      const pin = look.pin === false ? null : put('sb-pin');
      if (pin) {
        pin.style.setProperty('--c', color);
        if (text === false) pin.classList.add('sb-pin--bare'); else pin.innerHTML = '<span>' + esc(text) + '</span>';
        pin.style.opacity = 0;
      }
      let fx = 0, fy = 0;
      glyph(ag, 'arrow', t);
      if (g !== 'arrow') { glyph(ag, g, t + 0.3); glyph(ag, 'arrow', t + 0.35 + hold); }
      tl.tween(t, 0.35, 'out', (p) => { const q = at(); if (q) ag.set(fx + (q.x + off - fx) * p, fy + (q.y + off - fy) * p); }, () => { fx = ag.x; fy = ag.y; });
      const doing = look.doing;
      tl.tween(t + 0.35, hold, 'linear', (p) => {
        if (doing) ag.doing(p >= 1 ? '' : typeof doing === 'function' ? doing() : doing);
        const q = at();
        if (!q) { if (pin) pin.style.opacity = 0; return; }
        ag.set(q.x + off, q.y + off);                  // keeps hold of a point that is moving
        if (!pin) return;
        pin.style.left = q.x + 'px';
        pin.style.top = q.y + 'px';
        pin.style.opacity = p >= 1 ? 0 : Math.min(1, (p * hold) / 0.15, ((1 - p) * hold) / 0.15);
      });
      // stays with the point a beat, then heads for its next job and waits there; whatever it follows,
      // once that has passed out of view it slips off the nearest side
      const nx = look.next, beat = nx && stay > 0.9 ? 0.3 : Infinity;
      let sx = null, sy = 0, s0 = 0;
      if (stay > 0.05) tl.tween(t + 0.35 + hold, stay, 'linear', (p) => {
        const e = p * stay, n = e > beat ? nx.at() : null;
        if (n) {
          if (sx === null) { sx = ag.x; sy = ag.y; s0 = e; }
          const k = 1 - (1 - Math.min(1, (e - s0) / 0.55)) ** 3;
          ag.set(sx + (n.x + nx.off - sx) * k, sy + (n.y + nx.off - sy) * k);
          return;
        }
        sx = null;
        const q = e > beat ? null : at();
        if (q) { ag.set(q.x + off, q.y + off); return; }
        const v = view(), tx = ag.x < (v.x0 + v.x1) / 2 ? v.x0 - 90 : v.x1 + 90;
        ag.set(ag.x + (tx - ag.x) * 0.08, ag.y);
      });
      return t + 0.35 + hold;
    }
    // 3D: the renderer frames the viewport, waits for the scene's assets if asked to, then sweeps the
    // scene in top to bottom (geometry → materials → lighting) while the scene follows `swarm:scene`.
    // Build sites put other agents to work inside the scene during the sweep; afterwards the renderer
    // can visit named points, following them as they move.
    function scene(a, el, t) {
      const b = rel(el), name = label(el), color = o.crew.renderer || DEFAULT_CREW.renderer;
      // data-swarm-sweep="none": no wipe, the scene shows its own build; data-swarm-duration: seconds
      const still = el.dataset.swarmSweep === 'none';
      const D = Math.min(30, Math.max(0.5, parseFloat(el.dataset.swarmDuration) || 1.5));
      let ts = t;
      if (a) { log('renderer', 'viewport ' + name, t); ts = frame(a, el, t, 0.4) + 0.06; }
      const ov = put('sb-scene' + (still ? ' sb-scene--still' : ''));
      ov.style.setProperty('--c', color);
      Object.assign(ov.style, { left: b.x + 'px', top: b.y + 'px', width: b.w + 'px', height: b.h + 'px', opacity: 0, borderRadius: getComputedStyle(el).borderRadius });
      ov.innerHTML = '<i class="sb-scene__grid"></i><i class="sb-scene__scan"></i><span class="sb-scene__hud"></span>';
      const [grid, scan, hud] = ov.children;
      // shown to the page, but (unless still) clipped away until the sweep passes over it
      const arm = () => {
        if (!still) {
          if (!('sbClip' in el.dataset)) el.dataset.sbClip = el.style.clipPath || '';
          el.style.clipPath = 'inset(0 0 100% 0)';
        }
        el.classList.add('sb-built');
        el.style.opacity = '';
      };
      if (el.hasAttribute('data-swarm-await')) {
        tl.call(ts, () => {
          arm();
          if (loaded.has(el)) { if (still) sceneEvent(el, 0, 'geometry'); return; }   // shown unclipped: start it empty
          ov.style.opacity = 1;
          ov.classList.add('is-loading');
          hud.textContent = 'loading assets';
          say('renderer', 'loading assets · ' + name);
          sceneEvent(el, 0, 'loading');
          tl.hold();
          let timer = 0;
          const proceed = () => { clearTimeout(timer); el.removeEventListener('swarm:ready', proceed); tl.resume(); };
          timer = setTimeout(proceed, o.sceneTimeout * 1000);
          el.addEventListener('swarm:ready', proceed);
        });
      }
      const tS = ts + 0.3;
      // still scenes keep the renderer by the progress readout instead of riding the scan line
      if (a) { glyph(a, 'cross', ts); go(a, still ? b.x + 22 : b.x + b.w - 26, still ? b.y + 46 : b.y, ts, 0.28); }
      let phase = '';
      const rBusy = [];                                     // windows when the renderer is away at its own build sites
      tl.tween(tS, D, still ? 'linear' : 'inOut2', (p) => {
        const ph = p >= 1 ? 'ready' : PHASES.filter(([at]) => p >= at).pop()[1];
        if (ph !== phase) { phase = ph; if (ph !== 'ready') say('renderer', ph + ' · ' + name); }
        ov.style.opacity = 1;
        hud.textContent = (ph === 'ready' ? 'first frame' : ph) + ' · ' + Math.round(p * 100) + '%';
        if (!still) {
          scan.style.transform = 'translateY(' + (p * b.h).toFixed(1) + 'px)';
          grid.style.clipPath = 'inset(' + (p * 100).toFixed(2) + '% 0 0 0)';
          if (p < 1) el.style.clipPath = 'inset(0 0 ' + ((1 - p) * 100).toFixed(2) + '% 0)';
          if (a && !rBusy.some(([t0, t1]) => tl.t >= t0 && tl.t < t1)) {
            const x = b.x + b.w - 26, y = b.y + p * b.h, k = p >= 1 || Math.hypot(x - a.x, y - a.y) < 3 ? 1 : 0.3;
            a.set(a.x + (x - a.x) * k, a.y + (y - a.y) * k);   // glides back to the scan line after a site
          }
        }
        if (p < 1) sceneEvent(el, p, ph); else sceneDone(el);
      }, () => { arm(); ov.classList.remove('is-loading'); });
      tl.tween(tS + D + 0.05, 0.3, 'out', (p) => { ov.style.opacity = 1 - p; });
      let end = tS + D;

      // build sites: each agent goes where the scene is being built at that progress
      const inv = still ? (p) => p : (p) => (p < 0.5 ? Math.sqrt(p / 2) : 1 - Math.sqrt(2 * (1 - p)) / 2);
      const sites = sitesOf(el).map((s) => ({ ...s, ag: A[s.by || 'renderer'], t: Math.max(ts, tS + D * inv(s.at) - 0.35) }));
      sites.forEach((s, i) => {
        if (!s.ag) { console.warn('[swarm-build] site "' + s.name + '": no agent "' + s.by + '" in the crew'); return; }
        const next = sites.slice(i + 1).find((q) => q.ag === s.ag);           // the same agent's next site cuts this one short
        const hold = Math.max(0.2, Math.min(s.hold > 0 ? +s.hold : 0.7, next ? next.t - s.t - 0.35 : Infinity));
        // stay with the site until the next job, or the end of the build (the renderer returns to its scan line)
        const stay = s.ag === a && !still ? 0 : Math.max(0, (next ? next.t : tS + D) - (s.t + 0.35 + hold));
        log(s.ag.id, s.say || 'building ' + s.name, s.t + 0.3);
        // the page hears each job start and finish, with what the agent says it is doing at that moment
        const says = () => { try { return String((typeof s.doing === 'function' ? s.doing() : s.doing) || ''); } catch { return ''; } };
        const work = (phase) => () => workEvent(el, { site: s.name, agent: s.ag.id, phase, doing: says() });
        tl.call(s.t + 0.35, work('start'));
        tl.call(s.t + 0.35 + hold, work('done'));
        const look = next ? { ...s, next: { at: project(next.fn), off: (next.glyph || 'arrow') === 'arrow' ? 6 : 0 } } : s;
        const done = visit(s.ag, project(s.fn), s.t, hold, s.label === false ? false : s.label || s.name, o.crew[s.ag.id] || color, stay, look);
        if (s.ag === a) rBusy.push([s.t, done + stay]);
        end = Math.max(end, done);
      });
      if (sites.length) tl.tween(ts, Math.max(end, tS + D) - ts + 0.4, 'linear', tidy);
      if (!a) return end;
      glyph(a, 'arrow', tS + D + 0.05);
      // inspect points inside the scene: the app projects them to the screen with swarm.anchor(name, fn)
      const t0 = Math.max(tS + D + 0.15, rBusy.reduce((m, w) => Math.max(m, w[1] + 0.05), 0));
      anchorNames(el).forEach((n, i) => {
        const ti = t0 + i * 0.85;
        const at = project(anchors.get(n) && anchors.get(n).fn);
        if (!anchors.has(n)) tl.call(ti, () => console.warn('[swarm-build] no anchor "' + n + '": register it with swarm.anchor("' + n + '", fn)'));
        tl.call(ti + 0.36, () => { if (at()) say('renderer', 'inspected ' + n + ' · ' + name); });
        end = Math.max(end, visit(a, at, ti, 0.6, n, color));
      });
      return end;
    }

    // 1. arrival: the first region opens with the crew orbiting the origin
    let start = 0.35;
    const v0 = view();
    if (isFirst) {
      const anchor = document.querySelector('[data-swarm-origin]') || list[0] || region;
      const b = rel(anchor), cx = b.x + b.w / 2, cy = b.y + b.h / 2;
      const orbiters = crew.filter((a) => a.id !== 'red-team');
      const R = (innerWidth <= 720 ? 36 : 50) * Math.max(1, Math.sqrt(orbiters.length / 7)), W = v0.x1 - v0.x0, H = v0.y1 - v0.y0;   // a bigger crew gets a wider ring
      const seed = put('sb-seed');
      Object.assign(seed.style, { left: cx + 'px', top: cy + 'px', opacity: 0 });
      tl.tween(0, 0.35, 'out', (p) => { seed.style.opacity = p; seed.style.transform = `scale(${p})`; });
      orbiters.forEach((a, i) => {
        const ang = (i / orbiters.length) * Math.PI * 2;
        const from = [[v0.x0 - 50, v0.y0 + H * (0.2 + Math.random() * 0.6)], [v0.x1 + 50, v0.y0 + H * (0.2 + Math.random() * 0.6)], [v0.x0 + W * (0.2 + Math.random() * 0.6), v0.y0 - 50], [v0.x0 + W * (0.2 + Math.random() * 0.6), v0.y1 + 50]][i % 4];
        a.set(from[0], from[1]);
        go(a, cx + Math.cos(ang) * R, cy + Math.sin(ang) * R * 0.62, 0.05 + i * 0.04, 0.6);
      });
      log('orchestrator', 'spawned ' + crew.length + ' agents · goal: build the page', 0.1);
      tl.tween(0.75, 0.6, 'sine', (p) => {
        orbiters.forEach((a, i) => { const ang = (i / orbiters.length) * Math.PI * 2 + p * Math.PI * 0.8; a.set(cx + Math.cos(ang) * R, cy + Math.sin(ang) * R * 0.62); });
      });
      tl.tween(1.4, 0.2, 'out', (p) => { seed.style.opacity = 1 - p; });
      start = 1.45;
    } else {
      const first = list[0] ? rel(list[0]) : { x: 0, y: 0, w: 0, h: 0 };
      crew.forEach((a, i) => {
        a.set(i % 2 ? v0.x1 + 50 : v0.x0 - 50, first.y + i * 18);
        go(a, first.x + 20 + i * 40, first.y + first.h + 12 + (i % 2) * 14, 0.02 + i * 0.06, 0.45);
      });
    }

    // 2. the steps, in DOM order; each agent works through its own queue
    const free = {}, shown = new Map();
    const waitFor = (el) => { let t = 0; shown.forEach((at, host) => { if (host !== el && host.contains(el)) t = Math.max(t, at); }); return t; };
    let cursor = start, end = start;
    list.forEach((el) => {
      stepsOf(el).forEach((s) => {
        const role = ROLE[s], a = role ? A[role] : null;
        let t = Math.max(cursor, waitFor(el), role ? free[role] || 0 : 0);
        if (shown.has(el)) t = Math.max(t, shown.get(el));
        let done = t;
        if (s === 'frame' && a) {
          log('planner', 'frame ' + label(el), t);
          done = frame(a, el, t, 0.42);
          fade(el, done + 0.02, 0.3);
          shown.set(el, done + 0.05);
        } else if (s === 'reveal') {
          fade(el, t, 0.35);
          shown.set(el, t + 0.1);
        } else if (s === 'fetch' && a) {
          const b = rel(el);
          go(a, b.x + Math.min(b.w, 80) + 8, b.y + b.h * 0.5, t - 0.22, 0.22);
          log('retriever', 'fetched ' + label(el), t);
          scramble(el, t, 0.45);
          done = t + 0.25;
          shown.set(el, t);
        } else if (s === 'count' && a) {
          const b = rel(el);
          go(a, b.x + b.w * 0.6, b.y - 16, t - 0.4, 0.4);
          count(el, t, 0.8);
          chip('✓ verified', o.crew.eval, b.x + b.w * 0.6 + 16, b.y + 20, t + 0.15, 1.0);
          log('eval', 'verified ' + label(el), t + 0.1);
          done = t + 0.5;
          shown.set(el, t);
        } else if (s === 'type' && a) {
          const chars = $$('.sb-ch', el);
          if (!chars.length) return;
          log('writer', 'typing ' + label(el), t);
          tl.call(t, () => el.classList.add('sb-built'));
          done = type(a, chars, t, parseFloat(el.dataset.swarmCps) || (el.matches('h1') ? 36 : 50));
          shown.set(el, t);
          const st = A.stylist;
          if (st) {
            let ts = Math.max(done + 0.35, free.stylist || 0);
            $$(ACCENTS, el).forEach((acc) => { ts = restyle(st, acc, ts) + 0.05; });
            free.stylist = ts;
            done = Math.max(done, ts - 0.4);
          }
          if (el.dataset.swarmAttack) done = attack(el, chars, done + 0.35);
        } else if (s === 'stream' && a) {
          const words = $$('.sb-wd', el);
          if (!words.length) return;
          const b = rel(words[0]), d = Math.min(1.4, 0.018 * words.length + 0.2);
          glyph(a, 'ibeam', t - 0.3);
          go(a, b.x, b.y + b.h * 0.5, t - 0.3, 0.3);
          log('writer', 'streaming ' + label(el) + ' · ' + words.length + ' tokens', t);
          tl.call(t, () => el.classList.add('sb-built'));
          words.forEach((w, i) => tl.call(t + (i / words.length) * d, () => {
            w.classList.add('on');
            if (i % 4 === 0 || i === words.length - 1) { const r = rel(w); a.set(r.x + r.w + 4, r.y + r.h * 0.5); }
          }));
          glyph(a, 'arrow', t + d + 0.1);
          done = t + d;
          shown.set(el, t);
        } else if (s === 'grow' && a) {
          done = grow(a, el, t);
          shown.set(el, t);
        } else if (s === 'check' && a) {
          done = check(a, el, t);
          shown.set(el, t);
        } else if (s === 'scene') {
          done = scene(a, el, t);
          shown.set(el, t);
        }
        if (role) free[role] = done + 0.05;
        cursor += 0.2;
        end = Math.max(end, done);
      });
    });

    // 3. leave, sign, restore
    const tX = end + 0.45;
    tl.call(tX, () => {
      const v = view();
      crew.forEach((a, i) => {
        a.caret.style.display = 'none';
        const tx = a.x - v.x0 < (v.x1 - v.x0) / 2 ? v.x0 - 90 : v.x1 + 90, ty = a.y + (Math.random() * 60 - 30);
        const fx = a.x, fy = a.y, t0 = performance.now() + i * 40;
        const fly = (now) => {
          const p = Math.max(0, Math.min(1, (now - t0) / 550)), e = EASE.in(p);
          a.set(fx + (tx - fx) * e, fy + (ty - fy) * e);
          a.el.style.opacity = String(1 - e);
          if (p < 1) requestAnimationFrame(fly);
        };
        requestAnimationFrame(fly);
      });
    });
    if (isFirst) {
      $$('[data-swarm-credit]').forEach((c) => {
        tl.call(tX + 0.3, () => {
          c.textContent = c.textContent.replace('{agents}', String(agentsUsed.size)).replace('{attacks}', String(attacks));
          c.hidden = false;
        });
        scramble(c, tX + 0.35, 0.6);
      });
      tl.call(tX + 0.35, () => say('orchestrator', 'done · ' + agentsUsed.size + ' agents' + (attacks ? ' · ' + attacks + (attacks > 1 ? ' attacks' : ' attack') + ' blocked' : '')));
    }
    tl.call(tX + 0.95, () => {});
    const finishUp = () => {
      list.forEach((el) => { restore(el); el.classList.remove('sb-split'); el.classList.add('sb-built'); el.style.opacity = ''; sceneDone(el); });
      unstep(region);
      region.classList.add('swarm-done');
      region.classList.remove('sb-host', 'sb-rel');
      setTimeout(() => { layer.remove(); if (!document.querySelector('.sb-layer')) root.classList.remove('sb-building'); }, 900);
    };
    return { tl, region, finishUp };
  }

  // ---------------------------------------------------------------- running
  // whatever a grow or check step had in hand when the build ended is put back: bars unclipped, items shown
  function unstep(scope) {
    $$('[data-sb-clip]', scope).forEach((b) => { b.style.clipPath = b.dataset.sbClip; delete b.dataset.sbClip; });
    $$('[data-sb-fade]', scope).forEach((it) => { it.style.opacity = it.dataset.sbFade; it.style.translate = ''; delete it.dataset.sbFade; });
  }
  function release(region, withOrphans) {
    const list = $$('[data-swarm-step]', region).concat(withOrphans ? $$('[data-swarm-step]').filter((el) => !el.closest('[data-swarm]')) : []);
    list.forEach((el) => { restore(el); el.classList.remove('sb-split'); el.classList.add('sb-built'); el.style.opacity = ''; sceneDone(el); });
    unstep(region);
    $$('[data-swarm-credit]').forEach((c) => { if (withOrphans) c.hidden = true; });
    region.classList.add('swarm-done');
  }
  function runNext() {
    if (current || !queue.length) return;
    const { region, isFirst } = queue.shift();
    const box = region.getBoundingClientRect();
    if (!isFirst && io && (box.top > innerHeight * 0.85 || box.bottom < 0)) { delete region.dataset.sbQueued; io.observe(region); runNext(); return; }
    let job;
    try { job = plan(region, isFirst); } catch (err) { console.error('[swarm-build]', err); release(region, isFirst); runNext(); return; }
    current = job;
    youOn(true);
    if (o.onRegionStart) o.onRegionStart(region);
    const ff = () => { job.tl.scale = Math.max(job.tl.scale, 5); job.tl.resume(); };   // an impatient visitor also skips a scene's asset wait
    const evs = ['keydown', 'pointerdown', 'wheel', 'touchstart'];
    evs.forEach((e) => addEventListener(e, ff, { passive: true }));
    const away = new IntersectionObserver(([e]) => { if (!e.isIntersecting && job.tl.active) job.tl.finish(); });
    away.observe(region);
    job.tl.onDone = () => {
      evs.forEach((e) => removeEventListener(e, ff));
      away.disconnect();
      try { job.finishUp(); } catch (err) { console.error('[swarm-build]', err); release(region, isFirst); }
      current = null;
      youOn(false);
      if (o.onRegionEnd) o.onRegionEnd(region);
      runNext();
    };
    job.tl.play();
  }
  function enqueue(region, isFirst) {
    if (region.classList.contains('swarm-done') || region.dataset.sbQueued) return;
    region.dataset.sbQueued = '1';
    queue.push({ region, isFirst });
    runNext();
  }

  return {
    version: VERSION,
    active,
    enabled,
    /** Build every [data-swarm] region: the first one when it is in view, the rest as they scroll in. */
    start() {
      if (started) return this;
      started = true;
      // remember scenes that finish loading before their turn comes
      $$('[data-swarm-await]').forEach((el) => el.addEventListener('swarm:ready', () => loaded.add(el), { once: true }));
      const regions = $$('[data-swarm]');
      if (!active) { regions.forEach((r, i) => release(r, i === 0)); root.classList.remove('swarm-js'); return this; }
      if (o.once === 'session') session.set(o.key, '1');
      regions.forEach((r, i) => {
        $$('[data-swarm-step]', r).concat(i === 0 ? $$('[data-swarm-step]').filter((el) => !el.closest('[data-swarm]')) : []).forEach((el) => {
          if (stepsOf(el).includes('type')) splitChars(el);
          if (stepsOf(el).includes('stream')) splitWords(el);
        });
      });
      io = new IntersectionObserver((entries) => {
        entries.forEach((e) => {
          if (!e.isIntersecting) return;
          io.unobserve(e.target);
          const isFirst = e.target === regions[0] && !firstClaimed;
          if (isFirst) firstClaimed = true;
          enqueue(e.target, isFirst);
        });
      }, { rootMargin: o.rootMargin, threshold: 0.05 });
      const fonts = document.fonts && document.fonts.ready ? Promise.race([document.fonts.ready, new Promise((r) => setTimeout(r, 1500))]) : Promise.resolve();
      fonts.then(() => requestAnimationFrame(() => regions.forEach((r) => io.observe(r))));
      return this;
    },
    /** Finish whatever is building right now. */
    skip() { if (current) current.tl.finish(); },
    /** A data-swarm-await scene has loaded its assets: sweep it in. Takes an element or a selector. */
    ready(target) {
      (typeof target === 'string' ? $$(target) : [target]).forEach((el) => {
        if (!el) return;
        loaded.add(el);
        el.dispatchEvent(new CustomEvent('swarm:ready'));
      });
      return this;
    },
    /**
     * Name a point inside a 3D scene. `fn` returns its viewport position { x, y } in CSS pixels, or null when it is off screen.
     * With `{ at }` (0–1) it is a build site: agent `by` (default 'renderer') works there while the scene is at that
     * progress, for `hold` seconds (default 0.7). `say` is the trace line, `label` the pin text (false for none),
     * `pin` false leaves out the ring, `glyph` the cursor it works with (arrow, cross, ibeam or pen), `doing` a line
     * (or a function returning one) under its name while it works, `on` the scene element or selector (default the
     * first scene on the page). Register sites before the region builds.
     */
    anchor(name, fn, opts = {}) {
      if (!fn) { anchors.delete(name); return this; }
      // a site or `doing` line that throws is logged once, then reads as off screen (the agent slips away) or blank
      const guard = (f, fallback) => { let broken = false; return (...args) => {
        if (broken) return fallback;
        try { return f(...args); } catch (err) { broken = true; console.error('[swarm-build] build site "' + name + '":', err); return fallback; }
      }; };
      anchors.set(name, { ...opts, fn: guard(fn, null), doing: typeof opts.doing === 'function' ? guard(opts.doing, '') : opts.doing });
      return this;
    },
    /** Build again from the top: clears the once-per-session flag and reloads. */
    replay() { session.set(o.key, '0'); local.set(o.key + '-off', '0'); scrollTo(0, 0); location.reload(); },
    /** Persistently turn the effect on or off for this visitor. */
    setEnabled(on) { local.set(o.key + '-off', on ? '0' : '1'); },
  };
}

/**
 * Turns a Three.js or Babylon.js camera, and the element it renders into, into a function for build sites and
 * anchors: give it a Three.js Object3D, a Babylon node, a { x, y, z } or an [x, y, z] in world space and it
 * returns the point on screen, or null when the point is behind the camera or more than `margin` pixels off
 * the element. Any camera with column-major `projectionMatrix` and `matrixWorldInverse` (as Three's are), or
 * with `getViewMatrix()` and `getProjectionMatrix()` (as Babylon's are), works.
 *   swarm.anchor('roof', () => toScreen(roof), { at: 0.6, by: 'roofer' });   // toScreen = projector(camera, canvas)
 */
export function projector(camera, el, { margin = 40 } = {}) {
  let box = null, boxAt = -1;
  return (target) => {
    if (!target || !camera) return null;
    let x, y, z;
    if (Array.isArray(target)) [x, y, z] = target;
    else if (target.getAbsolutePosition) ({ x, y, z } = target.getAbsolutePosition());   // a Babylon node
    else if (target.matrixWorld) {
      if (target.updateWorldMatrix) target.updateWorldMatrix(true, false);
      const e = target.matrixWorld.elements; x = e[12]; y = e[13]; z = e[14];
    } else ({ x, y, z } = target);
    if (![x, y, z].every(Number.isFinite)) return null;
    let v, m;
    if (camera.getViewMatrix && camera.getProjectionMatrix) { v = camera.getViewMatrix().m; m = camera.getProjectionMatrix().m; }   // Babylon: same layout
    else {
      if (camera.updateMatrixWorld) camera.updateMatrixWorld();   // keeps matrixWorldInverse in step with a camera moved since the last render
      v = camera.matrixWorldInverse.elements; m = camera.projectionMatrix.elements;
    }
    const vx = v[0] * x + v[4] * y + v[8] * z + v[12], vy = v[1] * x + v[5] * y + v[9] * z + v[13], vz = v[2] * x + v[6] * y + v[10] * z + v[14];
    const w = m[3] * vx + m[7] * vy + m[11] * vz + m[15];
    if (w <= 1e-6) return null;                                     // behind the camera
    const nx = (m[0] * vx + m[4] * vy + m[8] * vz + m[12]) / w, ny = (m[1] * vx + m[5] * vy + m[9] * vz + m[13]) / w;
    const now = performance.now();
    if (!box || now - boxAt > 8) { box = (typeof el === 'function' ? el() : el).getBoundingClientRect(); boxAt = now; }   // once a frame
    const sx = box.left + ((nx + 1) / 2) * box.width, sy = box.top + ((1 - ny) / 2) * box.height;
    if (sx < box.left - margin || sx > box.right + margin || sy < box.top - margin || sy > box.bottom + margin) return null;
    return { x: sx, y: sy };
  };
}
swarmBuild.projector = projector;

export default swarmBuild;
