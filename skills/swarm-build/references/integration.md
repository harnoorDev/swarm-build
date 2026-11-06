# Integrating swarm-build into an existing site

## Plain HTML

Copy `assets/swarm-build.js` and `assets/swarm-build.css` into the site. Add the head snippet from `api.md`, the stylesheet and the attributes, then:

```html
<script type="module">
  import { swarmBuild } from '/js/swarm-build.js';
  swarmBuild().start();
</script>
```

## Sites with their own intro (boot screen, loader, splash)

Don't start the swarm under the intro. Start it when the intro hands over:

```js
const swarm = swarmBuild();
intro.onComplete(() => swarm.start());   // wherever your intro ends
```

If the intro also runs once per session, the two line up: the first visit gets intro plus swarm, and later visits get neither. For terminal-style intros, add one log line, such as `> deploying build agents ....... 7`, only when `swarm.active` is true.

## GSAP, SplitText and ScrollTrigger reveals

For every element the swarm builds, skip the site's own entry tween. Otherwise both animate the same element.

```js
const swarm = swarmBuild();
document.querySelectorAll('[data-split]').forEach((el) => {
  if (swarm.active && el.closest('[data-swarm]') && el.matches('[data-swarm-step]')) return; // the crew types this one
  SplitText.create(el, { /* … */ });
});
swarm.start();
```

Leave scroll-scrubbed and pinned effects alone. Regions inside pinned or translated containers work, because each region gets its own layer that moves with it.

## Smooth scroll (Lenis, Locomotive)

No changes needed. Positions are read live, and `wheel` and `touchstart` fast-forward the current build.

## Next.js and React

The engine works on the DOM directly, so run it once after hydration in a client component:

```tsx
'use client';
import { useEffect } from 'react';
import { swarmBuild } from '@/lib/swarm-build.js';

let started = false;
export function SwarmBuild() {
  useEffect(() => { if (!started) { started = true; swarmBuild().start(); } }, []);
  return null;
}
```

- Put the head snippet in `app/layout.tsx` with `<script dangerouslySetInnerHTML={{ __html: SNIPPET }} />` inside `<head>`, and import `swarm-build.css` in the layout.
- Add `suppressHydrationWarning` to `<html>`, because the snippet adds a class before React hydrates.
- Attributes go straight into JSX: `<h1 data-swarm-step="type" data-swarm-attack="without>with">`.

## Astro, Svelte, Vue

These work the same way: a client-side script after mount, plus the head snippet in the base layout.

## 3D sites (Three.js, React Three Fiber, Babylon, Spline, model-viewer)

Give the 3D viewport the `scene` step. Put it on the element you control in your markup, either the `<canvas>` or the `<div>` the library renders into, so the head snippet can hide it before first paint:

```html
<div id="stage" data-swarm-step="scene" data-swarm-await data-swarm-anchors="engine, wing" data-swarm-label="hero model"></div>
```

The renderer agent frames the viewport and waits for `swarm.ready(stage)`. Then it sweeps the scene in (geometry, then materials, then lighting) and inspects the anchors. Three rules make any engine work:

1. **Start built, follow the events.** Keep a `build` value that starts at 1 and update it from `swarm:scene`. With reduced motion, a repeat visit or no swarm at all, the scene is simply finished.
2. **Say when it's loaded.** Call `swarm.ready(stage)` once models and textures are in. Without `data-swarm-await` it doesn't wait, and with it the wait is capped at `sceneTimeout` (4 s).
3. **Project anchors to the screen.** `swarm.anchor(name, fn)` takes a function that returns viewport pixels `{ x, y }`, or `null` while the point is off screen or behind the camera. It's called every frame, so the cursor keeps hold of objects that move.

### Three.js

```js
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { swarmBuild } from './swarm-build.js';

const swarm = swarmBuild().start();
const stage = document.getElementById('stage');
let build = 1;
stage.addEventListener('swarm:scene', (e) => { build = e.detail.progress; });

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
stage.appendChild(renderer.domElement);
// …camera, lights…

const toScreen = (obj) => {
  const v = obj.getWorldPosition(new THREE.Vector3()).project(camera);
  if (v.z > 1) return null;                                    // behind the camera
  const r = renderer.domElement.getBoundingClientRect();
  return { x: r.left + (v.x + 1) / 2 * r.width, y: r.top + (1 - v.y) / 2 * r.height };
};

let model;
new GLTFLoader().load('/plane.glb', (gltf) => {
  model = gltf.scene;
  scene.add(model);
  swarm.anchor('engine', () => toScreen(model.getObjectByName('Engine')));
  swarm.anchor('wing', () => toScreen(model.getObjectByName('Wing_L')));
  swarm.ready(stage);
});

const ramp = (a, b, x) => Math.min(1, Math.max(0, (x - a) / (b - a)));
renderer.setAnimationLoop(() => {
  if (model) model.scale.setScalar(0.6 + 0.4 * ramp(0, 0.45, build));        // geometry
  model?.traverse((m) => { if (m.material) m.material.wireframe = build < 0.6; }); // materials
  keyLight.intensity = 0.3 + 2.2 * ramp(0.8, 1, build);                    // lighting
  renderer.render(scene, camera);
});
```

### React Three Fiber

Keep the step on the wrapper `<div>` and read the progress in `useFrame`:

```jsx
function useSwarmScene(ref) {
  const build = useRef(1);
  useEffect(() => {
    const el = ref.current;
    const on = (e) => { build.current = e.detail.progress; };
    el.addEventListener('swarm:scene', on);
    return () => el.removeEventListener('swarm:scene', on);
  }, [ref]);
  return build;
}

function Hero() {
  const stage = useRef(null);
  const build = useSwarmScene(stage);
  return (
    <div ref={stage} data-swarm-step="scene" data-swarm-await>
      <Canvas>
        <Suspense fallback={null}>
          <Model build={build} onLoaded={() => swarm.ready(stage.current)} />
        </Suspense>
      </Canvas>
    </div>
  );
}

function Model({ build, onLoaded }) {
  const { scene } = useGLTF('/plane.glb');
  const group = useRef();
  useEffect(onLoaded, []);                                   // runs once the model has loaded
  useFrame(() => group.current.scale.setScalar(0.6 + 0.4 * Math.min(1, build.current / 0.45)));
  return <primitive ref={group} object={scene} />;
}
```

For anchors, use `useThree()` to get `camera` and `gl.domElement`, and project the same way as the Three.js example.

### Babylon.js

```js
scene.executeWhenReady(() => swarm.ready(stage));
scene.onBeforeRenderObservable.add(() => {
  root.scaling.setAll(0.6 + 0.4 * Math.min(1, build / 0.45));
  light.intensity = build < 0.8 ? 0.3 : 0.3 + (build - 0.8) * 5;
});
```

### Spline and `<model-viewer>`

You can't reach inside these scenes, so the sweep does the building. Just say when they're loaded:

```js
// @splinetool/runtime
new Application(canvas).load('https://prod.spline.design/…/scene.splinecode').then(() => swarm.ready(canvas));

// <model-viewer data-swarm-step="scene" data-swarm-await src="robot.glb">
viewer.addEventListener('load', () => swarm.ready(viewer));
```

### A scene that builds itself, with the crew on site

When the scene animates its own construction (a city going up, a product assembling, a level being laid out), drop the wipe and give the crew jobs inside it. `examples/3d.html` builds a whole Three.js world this way, just ahead of a steam train, with no text on the page:

```html
<canvas id="world" data-swarm-step="scene" data-swarm-sweep="none" data-swarm-duration="20" data-swarm-await></canvas>
```

```js
const swarm = swarmBuild({ crew: { renderer: '#b49bff', surveyor: '#4ee9f5', mason: '#ffb547', electrician: '#ff8fd8' } });
// shown unclipped, so start empty while a build is coming, finished otherwise
let build = document.documentElement.classList.contains('swarm-js') ? 0 : 1;
canvas.addEventListener('swarm:scene', (e) => { build = e.detail.progress; });

// each site: who works there, and when (scene progress); fn follows the point as it moves or grows
swarm
  .anchor('plaza', () => toScreen(plaza), { at: 0, by: 'surveyor', say: 'staking out the plaza', label: false })
  .anchor('tower', () => toScreen(towerRoofAt(build)), { at: 0.11, by: 'mason', hold: 1.6, say: 'topping out the tower' })
  .anchor('lamps', () => toScreen(lamp), { at: 0.8, by: 'electrician', say: 'switching on the street lamps' });
swarm.start();
```

Tie each site to something the scene is visibly doing at that progress, and point `fn` at where it is happening right now (the roof as it rises, the edge of the paving as it spreads), so the cursor is always on the work. If the camera moves during the build, agents stay with their last site until their next one. Without WebGL, or before the first frame, return `null`: the agent waits where it is.

### Things to know

- **Orbit controls:** dragging the scene counts as a pointer press, so it fast-forwards the build. That's intended.
- **Full-screen background canvas:** this works. Leave it outside every region and it joins the first build, ahead of the headline, so the sweep is done before the text is typed.
- **Your render loop keeps running.** The library only clips the viewport and draws its overlay above it; it never touches the WebGL context.
- **`clip-path`:** the viewport is clipped inline during the sweep, and any `clip-path` it had before is put back.

## Custom crew

```js
swarmBuild({
  crew: {
    planner: '#4ee9f5', retriever: '#e7ff52', writer: '#ffb547', stylist: '#ff8fd8',
    eval: '#6aa8ff', guardrail: '#8dffb9', 'red-team': '#ff3b3b', renderer: '#b49bff',
    'design-qa': '#ffffff',          // extra names just join the opening orbit
  },
}).start();
```

## A toggle for visitors

```js
const swarm = swarmBuild().start();
toggle.textContent = swarm.enabled() ? 'Build agents: on' : 'Build agents: off';
toggle.onclick = () => swarm.setEnabled(!swarm.enabled());
replay.onclick = () => swarm.replay();
```

A command palette entry ("Watch the agents build the page") is a good home for `replay()`.
