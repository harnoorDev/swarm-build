---
name: swarm-build
description: Make a website build itself in front of the visitor. Labelled agent cursors frame boxes with live W×H badges, type headlines, restyle accents, stream copy, count stats, sweep 3D scenes in (Three.js, React Three Fiber, Babylon, Spline, model-viewer, WebGL canvases), and optionally a red-team agent tries to rewrite a word until a guardrail agent blocks it. Use when asked for a Swarm-style, multiplayer-cursor, "built by agents" or self-building page or intro, including on 3D sites.
---

# swarm-build

A crew of labelled agent cursors builds the page while the visitor watches. It's inspired by Joel Califa's Swarm, but the engine is written from scratch with zero dependencies. Everything ships in this skill:

| File | What it is |
|---|---|
| `assets/swarm-build.js` | Engine (ES module, no dependencies, about 42 KB unminified, 14 KB gzipped) |
| `assets/swarm-build.css` | Styles. Every class is `sb-` prefixed and the theme hooks are CSS variables. |
| `examples/index.html` | Working demo and reference integration |
| `examples/3d.html` | A 3D scene with no text: a crew of trades surveys, raises, clads and lights a WebGL city (no libraries), using build sites and `data-swarm-sweep="none"` |
| `references/api.md` | Every attribute, option and method, plus the head snippet |
| `references/integration.md` | Existing intros, GSAP/SplitText, smooth scroll, Next.js/React, 3D sites (Three.js, R3F, Babylon, Spline, model-viewer), custom crews |

If the assets are missing, get them from https://github.com/harnoorDev/swarm-build (`skills/swarm-build/assets/`).

## Workflow

1. **Read the site first.** Find the hero and the sections. Note any existing entry animations (SplitText, fade-ups, an intro or boot screen), smooth scroll, pinned sections, theme switching, and any 3D viewports (Three.js, R3F, Babylon, Spline, model-viewer) and how they load their assets. The swarm replaces the entry animation for each element it builds, so it never runs on top of one.
2. **Plan the build** before touching markup. Write a short list: the region, the elements in it and the step for each. Keep it to the elements that tell the story. A crew building twelve tiny things reads as noise.
   - `frame`: boxes, cards, nav, buttons, images
   - `type`: one headline per region
   - `stream`: paragraphs, bio
   - `fetch`: short labels and data (location, status, kicker)
   - `count`: numbers
   - `reveal`: anything that should just fade in
   - `scene`: a 3D viewport (`<canvas>`, the `<div>` a 3D library renders into, `<spline-viewer>`, `<model-viewer>`). Add `data-swarm-await` when it loads models, and `data-swarm-anchors` for up to three points the renderer should inspect. Wire the scene to `swarm:scene` and call `swarm.ready()` (`references/integration.md`, 3D sites). If the scene can animate its own construction, use `data-swarm-sweep="none"` with a longer `data-swarm-duration`, and register build sites (`swarm.anchor(name, fn, { at, by })`) so the crew works inside it.
   - Combine steps in order when one element needs two, for example `"frame stream"`.
3. **Pick the attack.** Optional, at most one per page, and only when the site's subject fits (AI, security, trust). Choose a word whose rewrite flips the meaning: `without>with`, `never>always`, `safe>unsafe`. The red-team deletes or types the difference, the guardrail blocks it and rolls it back, and the trace reads "blocked prompt injection". Skip it where it would read as a gimmick.
4. **Integrate** in four parts. `examples/index.html` shows all of them.
   - **Head snippet**, inline in `<head>`, copied from `references/api.md`. It adds `swarm-js` to `<html>` only when this visit should build. It's the only thing that ever hides content, and it removes itself if the engine never loads.
   - **CSS:** link `swarm-build.css`, then set `--sb-select`, `--sb-ok` and the `--sb-glass*` variables to the site's palette if needed.
   - **Markup:** add `data-swarm` to each region and `data-swarm-step` to its elements. Add `data-swarm-origin` to the logo or dot the crew orbits first, and `data-swarm-credit hidden` to the sign-off line ("Built by {agents} agents while you watched").
   - **Start:** `swarmBuild(options).start()`. If the site has its own intro, call `start()` when the intro hands over (see `references/integration.md`).
5. **Respect the existing system.** Use the site's fonts and accent colours. Crew names can match the site's domain, but keep the role names (see the API) and 5 to 7 agents. Accent words (`<em>`, `[data-swarm-accent]`) are typed plain and then restyled to their real style, so the site's own styling is the end state.
6. **Verify** with the checklist below. Don't call it done without running it.

## Rules of taste

- **Time budget:** first region about 9 seconds or less including the attack, every other region 2.5 seconds or less. Any key, click, tap or scroll fast-forwards 5×, and a region that scrolls out of view finishes at once. Never block scrolling.
- **Frequency:** `once: 'session'` (the default) for real sites, so later visits load normally. Use `'always'` only for demos.
- **Copy:** trace lines are short and literal (`writer ▸ typing h1`). Give elements a `data-swarm-label` when the auto label (`div.card`) reads badly.
- **No new motion vocabulary on top.** The crew is the animation. Don't add bounces, glows or extra transitions to the built elements.
- **Mobile:** it works as is. The "you" tag shows only on fine pointers. Check that labels don't cover the headline for long on a 390 px screen.

## Verify checklist

Run it in a real browser, for example Playwright. Do a fresh context for every pass:

- [ ] **Fresh desktop visit:** the first region builds, no console errors, and after it ends no `.sb-ch` or `.sb-wd` spans remain in that region, which means the text was restored.
- [ ] **Scroll to the bottom slowly:** every region gets `.swarm-done`, and no `[data-swarm-step]` is left with opacity 0 or visibility hidden.
- [ ] **Press a key mid-build:** the region finishes within about 2 seconds.
- [ ] **Phone viewport (390×844, touch):** the build runs, the trace pill stays clear of content, and there's no horizontal overflow.
- [ ] **Reduced motion:** nothing is hidden, no `.sb-layer` exists, and the credit stays hidden.
- [ ] **Second load in the same session:** no build. The normal page and its normal animations run.
- [ ] **Light theme, if the site has one:** the cursors, selection boxes and trace are legible.
- [ ] **3D scenes, if any:** the scene assembles in sync with the sweep (geometry, then materials, then lighting), ends fully built with no `clip-path` left on the viewport, and the renderer finds every anchor (the console warns about missing ones). Build sites put each agent on something the scene is visibly doing at that moment, and no agent is left floating off its work. With reduced motion the scene shows finished at once. Remove the `swarm.ready()` call once to check that the build waits at most `sceneTimeout` and then carries on.
- [ ] **Screenshot mid-build and at the end, and look at them.** Check the crosshair, I-beam and arrow glyphs are visible. A global `svg { max-width: 100% }` is neutralised by `.sb-g`, but a stricter reset can still hide them.

## Gotchas

- **Clipping:** a region with `overflow: hidden` clips its cursors. Put `data-swarm` on an unclipped ancestor.
- **Horizontal overflow:** while a build runs, the engine sets `overflow-x: clip` on `<html>` and `<body>` (`.sb-building`), so agents entering from the right never widen the page. A widened page makes mobile browsers zoom out and makes lower regions count as in view. Don't remove this.
- **Fixed and sticky elements** (a nav) can be built. Leave them outside any region and they join the first region's build.
- **The `hidden` attribute** loses to any CSS `display:` rule. The library forces `[data-swarm-credit][hidden]` to stay hidden, but other `hidden` elements you add can still be overridden.
- **Gradient text** (`background-clip: text`) works, because characters stay inside the gradient parent.
- **3D scenes must start built.** Initialise the scene's build value at 1 and only follow `swarm:scene`, which always ends on one `ready` event at progress 1. A scene that starts at 0 and waits for the library stays empty when the effect is off. The one exception is a `data-swarm-sweep="none"` scene, which is shown unclipped: start it at 0 only while `<html>` has `swarm-js`, and fall back to 1 if no event arrives.
- **WebGL shader precision:** a uniform used in both shaders needs the same precision in each (`uniform mediump float uBuild;`), or the program fails to link and the viewport stays blank. Check the console after the first build.
- **SEO and accessibility:** the text stays in the DOM, the agent layers are `aria-hidden`, and split spans are removed once a region finishes.
- **Licensing:** this engine is MIT. Never copy code or SVGs from `califa/swarm-site`, which has no license. Credit the idea instead.
