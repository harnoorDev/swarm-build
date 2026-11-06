# swarm-build

**A page that builds itself while you watch.** A crew of labelled agent cursors frames each block with a live `W × H` badge, types the headline, restyles the accents, streams the copy like model output and counts up the stats. If you want, a **red-team agent** tries to rewrite your promise, and the **guardrail agent** blocks it.

![swarm-build demo: agent cursors building a page](docs/demo.gif)

- **Zero dependencies.** One ES module (~30 KB, ~10 KB gzipped) and one stylesheet (~2 KB gzipped).
- **Declarative.** You add `data-swarm` and `data-swarm-step` attributes. No timeline code.
- **Built for real sites.** It plays once per session and fast-forwards on any key, click, tap or scroll. Reduced motion turns it off, the text stays in the DOM, and the agent layers are `aria-hidden`.
- **Ships as a Claude skill.** `skills/swarm-build/SKILL.md` teaches Claude how to add it to any site, with a verification checklist.

**Demo:** https://harnoordev.github.io/swarm-build/ · **In production:** https://iamharnoor.com

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

The steps are `frame` (planner), `type` (writer, with accents restyled by the stylist), `stream` (writer), `fetch` (retriever), `count` (eval) and `reveal`. The full reference is in [`references/api.md`](skills/swarm-build/references/api.md). For existing intros, GSAP and SplitText, Lenis, Next.js and custom crews, see [`references/integration.md`](skills/swarm-build/references/integration.md).

## Install the Claude skill

- **Claude Code:** copy `skills/swarm-build` into `~/.claude/skills/` (or `.claude/skills/` in a project).
- **claude.ai:** upload the `skills/swarm-build` folder as a skill.

Then ask: *"add the swarm build effect to my site"*.

## Credit

Inspired by [Swarm](https://github.com/califa/swarm-site) by Joel Califa, a website that builds itself as you scroll. This is an independent implementation written from scratch, with no code or artwork from that project.

## License

MIT © Harnoor Singh
