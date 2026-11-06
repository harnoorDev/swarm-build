# swarm-build API

## Head snippet

This goes inline in `<head>` before the stylesheet paints. It decides whether this visit builds and is the only thing that ever hides content. With no JavaScript, reduced motion, the effect switched off, or a repeat visit in the same session, `<html>` never gets `swarm-js` and the page renders normally.

```html
<script>
(function () {
  try {
    var d = document.documentElement, k = 'swarm-build';
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    if (localStorage.getItem(k + '-off') === '1') return;
    if (sessionStorage.getItem(k) === '1') return;            // drop this line for once: 'always'
    d.classList.add('swarm-js');
    setTimeout(function () { if (!window.__swarmBuild) d.classList.remove('swarm-js'); }, 6000);
  } catch (e) {}
})();
</script>
```

If you change the `key` option, change `k` to match.

## Attributes

| Attribute | On | Effect |
|---|---|---|
| `data-swarm` | a section | A region. It builds when it scrolls into view (`rootMargin` option). The first region in the document opens with the full crew orbiting `[data-swarm-origin]`. |
| `data-swarm-step="…"` | any element | One or more steps, run in order. Elements outside every region join the first region. |
| `data-swarm-label="…"` | a step element | Name used in the trace (`planner ▸ frame nav`). Defaults to `#id` or `tag.class`. |
| `data-swarm-attack="from>to"` | a `type` element | After typing, the red-team rewrites `from` into `to` and the guardrail blocks it and rolls it back. |
| `data-swarm-cps="40"` | a `type` element | Typing speed in characters per second. The default is 30 for `h1` and 48 otherwise. |
| `data-swarm-accent` | inside a `type` element | Typed plain, then restyled by the stylist. `<em>` gets this automatically. |
| `data-swarm-origin` | a logo or dot | The crew orbits it before the first build. |
| `data-swarm-credit` | a line with `hidden` | Revealed with a scramble at the end of the first region. `{agents}` and `{attacks}` are replaced. |
| `data-swarm-await` | a `scene` element | Hold the sweep until the app calls `swarm.ready(el)` (its models and textures are loaded), for at most `sceneTimeout` seconds. Any key, click or tap ends the wait. |
| `data-swarm-anchors="a, b"` | a `scene` element | Up to three points inside the scene the renderer inspects after the sweep. Register each with `swarm.anchor(name, fn)`. |
| `data-swarm-sweep="none"` | a `scene` element | No wipe, grid or scan line: the scene is shown whole and builds itself from the `swarm:scene` progress, which runs linearly. The progress readout stays. Use it when the scene animates its own construction. |
| `data-swarm-duration="7"` | a `scene` element | How long the build takes, in seconds (0.5 to 12, default 1.5). Give a scene that builds itself room to do it. |

### Steps

| Step | Agent | What the visitor sees | Hidden until |
|---|---|---|---|
| `frame` | planner | A crosshair drags a selection box with a live `W × H` badge, then the element fades in | The box is drawn |
| `type` | writer | An I-beam types every character with a caret. Accents are restyled after. | Each character is typed |
| `stream` | writer | Words appear like model tokens | Each word appears |
| `fetch` | retriever | The text scrambles into place | The step starts |
| `count` | eval | Numbers count up from 0, keeping prefix, suffix and decimals (`2.2K`, `$1,200`), with a "✓ verified" chip | The step starts |
| `reveal` | none | A plain fade | The step starts |
| `scene` | renderer | For a 3D viewport (a `<canvas>`, `<spline-viewer>`, `<model-viewer>`, or the element wrapping one). The renderer frames it, then a scan line sweeps it in over a wireframe grid while a readout goes geometry → materials → lighting → first frame. The scene hears every step as a `swarm:scene` event, so it can assemble itself in sync. Build sites send other agents into the scene while it builds. Then the renderer visits any `data-swarm-anchors`, following them as they move. | The sweep passes over it (or, with `data-swarm-sweep="none"`, the step starts) |

Agents work through their own queues in parallel, so the planner can frame boxes while the writer types. The renderer only joins the opening orbit on pages that have a `scene`. Steps are staggered 0.2 s apart in document order, and a step inside a framed element waits until the frame is done. Regions build one at a time: a region that scrolls in while another is building waits its turn, and is skipped back to waiting if it has left the view by then.

## Options

`swarmBuild(options)`:

| Option | Default | Notes |
|---|---|---|
| `crew` | 8 agents | `{ name: color }`. Work is assigned by the role names `planner`, `retriever`, `writer`, `stylist`, `eval`, `guardrail`, `red-team` and `renderer`, so keep those keys. Extra names join the first region's orbit, and build sites can put them to work (`by`). Without a `renderer`, scenes are still swept in, just with no cursor. |
| `key` | `'swarm-build'` | Storage key. `key` in sessionStorage means "already built this session", and `key + '-off'` in localStorage means "switched off". |
| `once` | `'session'` | Use `'always'` to build on every load (demos). |
| `speed` | `1` | Global time scale. |
| `trace` | `true` | The bottom pill that narrates each action. |
| `you` | `true` | A "you" tag on the visitor's own cursor during builds, fine pointers only. |
| `rootMargin` | `'0px 0px -20% 0px'` | When a region counts as in view. |
| `force` | `false` | Build even without `.swarm-js` on `<html>` (testing). |
| `sceneTimeout` | `4` | Longest wait, in seconds, for a `data-swarm-await` scene before it is swept in anyway. |
| `onRegionStart(region)` / `onRegionEnd(region)` | none | Hooks, for example to start the site's own effects once the hero is built. |

## Methods

```js
import { swarmBuild } from './swarm-build.js';
const swarm = swarmBuild({ /* options */ }).start();

swarm.active        // whether this visit builds
swarm.enabled()     // the visitor's on/off preference
swarm.setEnabled(b) // persist on/off (localStorage)
swarm.skip()        // finish the current region now
swarm.replay()      // clear the session flag and reload from the top
swarm.ready(el)     // a data-swarm-await scene has loaded: sweep it in (element or selector)
swarm.anchor(name, () => ({ x, y }))   // a point inside a 3D scene, in viewport pixels (null when off screen)
swarm.anchor(name, fn, { at, by, hold, say, label, on })   // a build site (see below)
swarm.version       // '1.1.0'
```

## 3D scene events

A `scene` element receives `swarm:scene` events (they bubble) with `detail.progress` from 0 to 1 and `detail.phase`:

| Phase | Progress | Use it to |
|---|---|---|
| `loading` | 0 | show a placeholder while `data-swarm-await` holds |
| `geometry` | 0 – 0.45 | bring meshes in: scale up, fly faces in, draw a wireframe |
| `materials` | 0.45 – 0.8 | swap wireframe for surfaces, fade in textures |
| `lighting` | 0.8 – 1 | turn the lights and environment up |
| `ready` | 1 | the finished scene |

Every scene ends on exactly one `ready` event at progress 1: after its sweep, when the build is skipped or scrolled away, on a repeat visit, with reduced motion, or when the effect is off. Start your scene at progress 1 and only follow the events, and it can never be left half built. Recipes for Three.js, React Three Fiber, Babylon, Spline and `<model-viewer>` are in `integration.md`.

A `data-swarm-sweep="none"` scene is shown without a wipe, so it hears progress 0 before it appears. Start it empty while a build is coming (`document.documentElement.classList.contains('swarm-js') ? 0 : 1`) and switch to 1 if no event ever arrives. `examples/3d.html` does exactly this.

### Build sites

An anchor registered with `at` is a build site: while the scene is at that progress, agent `by` travels to the point and works there, so the crew is visibly building inside the scene rather than watching it.

| Option | Default | Meaning |
|---|---|---|
| `at` | none | Scene progress (0 to 1) when the work happens. Without `at`, the anchor is only inspected if `data-swarm-anchors` lists it. |
| `by` | `'renderer'` | Any crew name, including your own (`{ crew: { ..., mason: '#ffb547' } }`). The agent joins the region's crew automatically. |
| `hold` | `0.7` | Seconds the agent works there under a pin. Cut short if the same agent's next site comes first. |
| `say` | `building <name>` | The trace line, attributed to that agent. |
| `label` | the name | Pin text; `false` for a bare ring. |
| `on` | the first scene on the page | The scene element, or a selector, the site belongs to. |

`fn` is called every frame, so the agent follows a point that moves or grows (a roof as the building rises). Once its work is done, the agent stays with the point until its next site or the end of the build, so a moving camera never leaves it hanging in mid-air. Register sites before the region builds; up to 32 per scene.

The app can also dispatch `swarm:ready` on the element itself instead of calling `swarm.ready(el)`.

## Classes it adds

- `.swarm-js` on `<html>`: this visit builds (added by the head snippet).
- `.swarm-done` on a region: finished.
- `.sb-built` on a step element: no longer hidden by the library CSS.
- `.sb-split` on an element whose text is split into `.sb-ch` or `.sb-wd` spans while it builds.
- `.sb-plain` on an accent: typed but not yet restyled. Override it if the site's accent style uses more than `font-style` and `color`.
- A `scene` element gets an inline `clip-path` while it is swept in; any `clip-path` it had is put back afterwards. A `data-swarm-sweep="none"` scene is never clipped.

## Theme variables

`--sb-select`, `--sb-ok`, `--sb-glass`, `--sb-glass-ink`, `--sb-glass-line`, `--sb-mono`, `--sb-ease-out`
