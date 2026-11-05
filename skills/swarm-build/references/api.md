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

### Steps

| Step | Agent | What the visitor sees | Hidden until |
|---|---|---|---|
| `frame` | planner | A crosshair drags a selection box with a live `W × H` badge, then the element fades in | The box is drawn |
| `type` | writer | An I-beam types every character with a caret. Accents are restyled after. | Each character is typed |
| `stream` | writer | Words appear like model tokens | Each word appears |
| `fetch` | retriever | The text scrambles into place | The step starts |
| `count` | eval | Numbers count up from 0, keeping prefix, suffix and decimals (`2.2K`, `$1,200`), with a "✓ verified" chip | The step starts |
| `reveal` | none | A plain fade | The step starts |

Agents work through their own queues in parallel, so the planner can frame boxes while the writer types. Steps are staggered 0.2 s apart in document order, and a step inside a framed element waits until the frame is done. Regions build one at a time: a region that scrolls in while another is building waits its turn, and is skipped back to waiting if it has left the view by then.

## Options

`swarmBuild(options)`:

| Option | Default | Notes |
|---|---|---|
| `crew` | 7 agents | `{ name: color }`. Work is assigned by the role names `planner`, `retriever`, `writer`, `stylist`, `eval`, `guardrail` and `red-team`, so keep those keys. Extra names join the first region's orbit. |
| `key` | `'swarm-build'` | Storage key. `key` in sessionStorage means "already built this session", and `key + '-off'` in localStorage means "switched off". |
| `once` | `'session'` | Use `'always'` to build on every load (demos). |
| `speed` | `1` | Global time scale. |
| `trace` | `true` | The bottom pill that narrates each action. |
| `you` | `true` | A "you" tag on the visitor's own cursor during builds, fine pointers only. |
| `rootMargin` | `'0px 0px -20% 0px'` | When a region counts as in view. |
| `force` | `false` | Build even without `.swarm-js` on `<html>` (testing). |
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
swarm.version       // '1.0.1'
```

## Classes it adds

- `.swarm-js` on `<html>`: this visit builds (added by the head snippet).
- `.swarm-done` on a region: finished.
- `.sb-built` on a step element: no longer hidden by the library CSS.
- `.sb-split` on an element whose text is split into `.sb-ch` or `.sb-wd` spans while it builds.
- `.sb-plain` on an accent: typed but not yet restyled. Override it if the site's accent style uses more than `font-style` and `color`.

## Theme variables

`--sb-select`, `--sb-ok`, `--sb-glass`, `--sb-glass-ink`, `--sb-glass-line`, `--sb-mono`, `--sb-ease-out`
