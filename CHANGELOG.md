# Changelog

## 1.2.0 (2026-11-09)

The crew can now build a 3D scene from the inside, not just sweep it in.

### Added

- **Build sites.** `swarm.anchor(name, fn, { at, by, hold })` sends any agent, including your own (`crew: { mason: '#ff5b3a' }`), to a point inside the scene at a given build progress. The cursor follows the point every frame, so it stays on a roof as the building rises. Up to 256 sites per scene.
- **`doing`** on a build site: a live second line on the agent's name tag while it works ("planting pines 3/5"). Pass a function and it is called every frame, so it can count.
- **`glyph`** (`'arrow'`, `'cross'`, `'ibeam'` or `'pen'`) for the cursor an agent works with, and **`pin: false`** to leave out the ring for scenes that draw their own marks.
- **`projector(camera, el)`**: turns a Three.js camera and its canvas into the function sites and anchors need. It takes an `Object3D`, `{ x, y, z }` or `[x, y, z]`, returns a screen point or `null` when the point is behind the camera or out of view, and needs no import of Three.js.
- **`swarm:work` events** on the scene element when an agent starts and finishes a site, with `{ site, agent, phase, doing }`, for build logs, sounds or analytics.
- **`data-swarm-sweep="none"`**: no wipe, grid or scan line, for scenes that animate their own construction. Progress then runs linearly.
- **`data-swarm-duration`**: how long a scene takes to build, from 0.5 to 30 seconds.
- **`examples/3d-starter.html`**: the smallest complete 3D build, four agents and an island in about 200 commented lines.
- **`examples/3d.html`**: a Three.js world that a crew of sixteen builds just ahead of a steam train, with a live object count and a build log.

### Changed

- An agent with time to spare after a site heads for its next one and waits there instead of idling on finished work. If the point it follows leaves the screen, it slips off the nearest edge.
- Name tags keep clear of each other while a scene has build sites: a tag that would cover another flips to a free side of its cursor.
- The opening orbit widens for bigger crews.

## 1.1.0 (2026-11-06)

### Added

- **3D scenes.** `data-swarm-step="scene"` on a `<canvas>`, `<model-viewer>`, `<spline-viewer>` or the element a 3D library renders into, done by a new renderer agent. It frames the viewport, then a scan line sweeps it in over a wireframe grid while the scene hears `swarm:scene` progress events (geometry, materials, lighting, ready) and assembles itself in sync. Every scene ends on one `ready` event, even when the build is skipped or switched off.
- **`data-swarm-await`** and `swarm.ready(el)`: the sweep waits for the scene's models, for at most `sceneTimeout` seconds (4 by default).
- **`data-swarm-anchors`** and `swarm.anchor(name, fn)`: points inside the scene that the renderer inspects after the sweep, following them as they move.
- Recipes for Three.js, React Three Fiber, Babylon, Spline and `<model-viewer>` in `references/integration.md`.

The renderer only joins pages that have a scene, so 2D pages are unchanged.

## 1.0.1 (2026-11-05)

### Fixed

- Regions are measured after web fonts settle and re-checked just before they build, so sections no longer build off screen.
- Agents entering from the side can no longer widen the page during a build (on phones this zoomed the page out).
- Only the visitor's input fast-forwards a build; queued regions no longer speed it up.
- Steps overlap (the planner frames boxes while the writer types), so the hero builds in about 9 seconds instead of 11.6 on desktop.

## 1.0.0 (2026-11-05)

First release: a page that builds itself while you watch. Agent cursors frame blocks with live `W × H` badges, type headlines, restyle accents, stream copy and count stats. An optional red-team agent tries to rewrite a word and the guardrail agent blocks it. It plays once per session, fast-forwards on any input, and switches off for reduced motion.
