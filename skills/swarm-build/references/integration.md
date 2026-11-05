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

## Custom crew

```js
swarmBuild({
  crew: {
    planner: '#4ee9f5', retriever: '#e7ff52', writer: '#ffb547', stylist: '#ff8fd8',
    eval: '#6aa8ff', guardrail: '#8dffb9', 'red-team': '#ff3b3b',
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
