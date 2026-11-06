# swarm-build

**A page that builds itself while you watch.** A crew of labelled agent cursors frames each block with a live `W × H` badge, types the headline, restyles the accents, streams the copy like model output and counts up the stats. On 3D sites, a **renderer agent** sweeps the scene in while it assembles itself. If you want, a **red-team agent** tries to rewrite your promise, and the **guardrail agent** blocks it.

![swarm-build demo: agent cursors building a page](docs/demo.gif)

- **Zero dependencies.** One ES module (~42 KB, ~14 KB gzipped) and one stylesheet (~2.5 KB gzipped).
- **Declarative.** You add `data-swarm` and `data-swarm-step` attributes. No timeline code.
- **Works with 3D sites.** Three.js, React Three Fiber, Babylon, Spline, `<model-viewer>` or a raw WebGL canvas: the scene follows `swarm:scene` progress events (geometry, then materials, then lighting), can make the build wait for its models, and lets the renderer point at objects inside it as they move. A scene that builds itself can send any agent to a build site inside it at the right moment: the 3D demo is a Three.js world that a crew of sixteen builds just ahead of a little steam train, from sunflower fields to a snowy summit, each agent's tag saying what it is doing ("planting pines 3/5") while a build log keeps score.
- **Built for real sites.** It plays once per session and fast-forwards on any key, click, tap or scroll. Reduced motion turns it off, the text stays in the DOM, and the agent layers are `aria-hidden`.
- **Ships as a Claude skill.** `skills/swarm-build/SKILL.md` teaches Claude how to add it to any site, with a verification checklist.

**Demo:** https://harnoordev.github.io/swarm-build/ · **3D demo (a crew builds a world):** https://harnoordev.github.io/swarm-build/skills/swarm-build/examples/3d.html · **In production:** https://iamharnoor.com

## Use it

```html
<head>
  <script>/* head snippet from skills/swarm-build/references/api.md */</script>
  <link rel="stylesheet" href="swarm-build.css">
</head>

<header data-swarm>
  <span data-swarm-origin class="logo-dot"></span>
  <h1 data-swarm-step="type" data-swarm-attack="without>with">Shipping AI <em>without</em> the breach.</h1>
  <p data-swarm-step="frame stream">Bio streamed in like model output…</p>
  <a data-swarm-step="frame" href="#contact">Get in touch</a>
  <strong data-swarm-step="count">2.2K</strong>
  <p data-swarm-credit hidden>Built by {agents} agents while you watched.</p>
</header>

<script type="module">
  import { swarmBuild } from './swarm-build.js';
  swarmBuild().start();
</script>
```

The steps are `frame` (planner), `type` (writer, with accents restyled by the stylist), `stream` (writer), `fetch` (retriever), `count` (eval), `scene` (renderer, for 3D viewports) and `reveal`.

For a 3D viewport:

```html
<div id="stage" data-swarm-step="scene" data-swarm-await data-swarm-anchors="engine"></div>
<script type="module">
  const swarm = swarmBuild().start();
  const stage = document.getElementById('stage');
  let build = 1;                                            // finished unless the swarm says otherwise
  stage.addEventListener('swarm:scene', (e) => { build = e.detail.progress; });   // drive your scene from it
  loader.load('/plane.glb', () => swarm.ready(stage));      // sweep it in once the model is loaded
  swarm.anchor('engine', () => toScreen(engineMesh));       // the renderer follows it on screen
</script>
``` The full reference is in [`references/api.md`](skills/swarm-build/references/api.md). For existing intros, GSAP and SplitText, Lenis, Next.js, 3D sites and custom crews, see [`references/integration.md`](skills/swarm-build/references/integration.md).

## Install the Claude skill

- **Claude Code:** copy `skills/swarm-build` into `~/.claude/skills/` (or `.claude/skills/` in a project).
- **claude.ai:** upload the `skills/swarm-build` folder as a skill.

Then ask: *"add the swarm build effect to my site"*.

## Credit

Inspired by [Swarm](https://github.com/califa/swarm-site) by Joel Califa, a website that builds itself as you scroll. This is an independent implementation written from scratch, with no code or artwork from that project.

## License

MIT © Harnoor Singh
