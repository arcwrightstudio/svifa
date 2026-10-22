<h1 align="center">
  <img alt="Svifa" src="https://raw.githubusercontent.com/arcwrightstudio/svifa/main/.github/assets/logo.svg" height="96">
</h1>

<p align="center"><strong>Smooth scroll for the web.</strong><br>Drawn between pixels, the same at every refresh rate, and out of the way of everything else.</p>

<p align="center"><a href="https://www.bestpractices.dev/projects/15754"><img alt="OpenSSF Best Practices" src="https://www.bestpractices.dev/projects/15754/badge"></a> <a href="https://www.bestpractices.dev/projects/15754"><img alt="OpenSSF Baseline" src="https://www.bestpractices.dev/projects/15754/baseline"></a></p>

Svifa is a smooth scroll library for the browser. It makes the mouse wheel and the trackpad scroll smoothly, on the whole page or
inside any scrolling element, and leaves everything else to the browser.

The name is Icelandic: *svífa* means to glide.

## Why Svifa

Smooth scrolling on the web has a flaw almost everyone has seen without naming it: the last moment of a scroll shimmers. A browser
keeps a scrolled page on whole pixels, and the end of a smooth scroll moves by less than a pixel each frame, so the page holds still
for a few frames, hops a pixel, and holds again. On a 144 Hz or 240 Hz screen there are more frames to see it in, and sharp text and
thin lines show it most. Smooth scroll libraries usually leave it, because the browser's scroll position cannot hold a fraction of
a pixel. Moving the whole page with a transform instead avoids it, but breaks sticky elements and everything else that reads the
scroll position.

<p align="center">
  <img alt="The last 6 pixels of one wheel scroll at 240 Hz. On whole pixels the page waits, then hops a pixel, holding 44 frames (183 ms) before the last hop. Drawn by Svifa, it moves a little every frame." src="https://raw.githubusercontent.com/arcwrightstudio/svifa/main/.github/assets/settle.svg" width="728">
</p>

<p align="center"><sub>Measured frame by frame with the built library, on the test clock.</sub></p>

Svifa fixes it where it starts. It scrolls to the nearest pixel the browser can show and draws the fraction left over on the GPU
(the `subpixel` option), so the page moves continuously and comes to rest exactly on the browser's own grid. Around that, it gets
the rest of smooth scrolling right:

- **The same at any refresh rate.** A scroll takes the same time and follows the same curve on a 60 Hz laptop and a 500 Hz monitor.
- **The real scroll position.** `position: sticky`, `IntersectionObserver`, scroll-driven animations, `scroll` events and anything
  else that reads the scroll position work as they do without it.
- **Out of the way.** The keyboard, the scroll bar, touch and find in page stay the browser's own, and any of them takes over from
  a scroll at once, as does any scroll Svifa did not make. A reader who asks for reduced motion gets the browser's own scrolling.
- **Small and anywhere.** Plain JavaScript with no dependencies, about 10 kB minified and gzipped, and safe to import during server
  rendering. Components for React, Vue, Svelte, Solid, Angular and Astro, so for Next.js, Nuxt and SvelteKit too. ES module,
  CommonJS and a `<script>` build, with TypeScript types.
- **Ready for AI coding tools.** Every option is documented in the types, and [`llms.txt`](./llms.txt) holds the whole API in one
  file.

Every claim here is checked by the tests, which run in Chromium, Firefox and WebKit and drive the frame clock at 60 to 1000 Hz, and
the motion was measured frame by frame on a 254 Hz screen. If a site already uses a smooth scroll library, switching is usually
two lines: the import and the constructor.

## Try it

Each example opens on StackBlitz, ready to run and change:

- **[Vite](https://stackblitz.com/github/arcwrightstudio/svifa/tree/main/examples/vite)**: plain TypeScript, with a reading progress bar from Svifa's scroll event.
- **[Next.js](https://stackblitz.com/github/arcwrightstudio/svifa/tree/main/examples/next)**: `SmoothScroll` in the root layout and `useSvifa` in a client component.
- **[Vue](https://stackblitz.com/github/arcwrightstudio/svifa/tree/main/examples/vue)** and **[Nuxt](https://stackblitz.com/github/arcwrightstudio/svifa/tree/main/examples/nuxt)**: `SmoothScroll` around the app and `useSvifa` in a component.
- **[SvelteKit](https://stackblitz.com/github/arcwrightstudio/svifa/tree/main/examples/sveltekit)**: `smoothScroll` in the root layout and `useSvifa` in a component.
- **[Solid](https://stackblitz.com/github/arcwrightstudio/svifa/tree/main/examples/solid)**: `SmoothScroll` around the app and `useSvifa` in a component.
- **[Angular](https://stackblitz.com/github/arcwrightstudio/svifa/tree/main/examples/angular)**: `provideSmoothScroll` in the app's providers, `injectSvifa` for the reading progress, and a box with a Svifa of its own from `createSvifa`, rendered on the server.
- **[Astro](https://stackblitz.com/github/arcwrightstudio/svifa/tree/main/examples/astro)**: `SmoothScroll` in the layout, with view transitions between two pages.
- **[A plain page](https://stackblitz.com/github/arcwrightstudio/svifa/tree/main/examples/html)**: one HTML file, with Svifa from a CDN.

## Install

```sh
npm install @arcwrightstudio/svifa
```

`pnpm add`, `yarn add` and `bun add` work the same, and Deno takes `deno add npm:@arcwrightstudio/svifa`. Each installs and
imports it as published, Yarn's Plug'n'Play mode included.

Or load the script build, which sets `window.Svifa`:

```html
<script src="https://cdn.jsdelivr.net/npm/@arcwrightstudio/svifa@1.2.0/dist/svifa.global.min.js" integrity="sha384-Cvbx0AtzHAYXN/83k5dga5GIWLE56mbxDTK87Hk3OdpWBtLbcH3kYCymXOMyyIaC" crossorigin="anonymous"></script>
```

Pin the exact version in the address, as here: the `integrity` hash then makes the browser refuse any file that differs from the
published one.

## Use

```js
import Svifa from '@arcwrightstudio/svifa'
import '@arcwrightstudio/svifa/svifa.css'

const svifa = new Svifa()
```

That is all a page needs. Create Svifa once the page is in the browser, and call `svifa.destroy()` when whatever created it goes
away. A scroller takes one Svifa: creating a second for the same one throws an error until the first is destroyed.

`svifa.css` is optional. While Svifa is stopped it hides the scroller's overflow, so the keyboard and the scroll bar are held as
well as the wheel; and while a glide is under way it keeps an embedded frame under the pointer from catching the wheel.

It works the same in any framework, or none. There are components for [React and Next.js](#react-and-nextjs), [Vue](#vue) and
[Nuxt](#nuxt), [Svelte and SvelteKit](#svelte-and-sveltekit), [Solid](#solid), [Angular](#angular) and [Astro](#astro), and
[a plain page](#a-plain-page) needs none.

### React and Next.js

The React entry has a component and a hook:

```tsx
// app/layout.tsx in Next.js, or the root of any React app
import { SmoothScroll } from '@arcwrightstudio/svifa/react'
import '@arcwrightstudio/svifa/svifa.css'

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <SmoothScroll lerp={0.08}>{children}</SmoothScroll>
      </body>
    </html>
  )
}
```

`SmoothScroll` takes Svifa's options as props (and `scroller` as a ref too). It is a client component, so a server layout can render
it. Changing a prop that shapes the feel (`lerp`, `duration`, `easing`, `wheel`, `wheelSpeed`, `nested`, `native`, `chain`,
`anchors`, `snap`) retunes the running Svifa, and one taken off goes back to its default; changing what it scrolls makes it again.
Anything inside reaches the Svifa with `useSvifa` (in Next.js, from a client component: `'use client'` at the top of its file):

```tsx
import { useState } from 'react'
import { useSvifa } from '@arcwrightstudio/svifa/react'

function BackToTop() {
  const svifa = useSvifa()
  return <button onClick={() => svifa?.scrollTo('top')}>Back to top</button>
}

function ReadingProgress() {
  const [progress, setProgress] = useState(0)
  useSvifa((svifa) => setProgress(svifa.progress))
  return <progress value={progress} />
}
```

`useSvifa()` is null on the server and until the Svifa is made. React 18 and 19 are supported, `StrictMode` included. Next.js
scrolls to the top on a route change; Svifa gives way to that as it does to any scroll it did not make.

Without the entry, the same takes a few lines:

```jsx
useEffect(() => {
  const svifa = new Svifa()
  return () => svifa.destroy()
}, [])
```

**Yarn Plug'n'Play.** A bundler (Vite, webpack, Next.js) loads Svifa and each of its entries through Plug'n'Play as it loads
anything else, and installing Svifa does not make Yarn turn on its experimental ES module loader (`.pnp.loader.mjs`). Code that
Node runs directly under Plug'n'Play loads Svifa with `require`; an ES module run that way needs that loader, which a project turns
on itself (`pnpEnableEsmLoader: true`).

### Vue

The Vue entry has a component and a composable:

```vue
<!-- App.vue -->
<script setup>
import { SmoothScroll } from '@arcwrightstudio/svifa/vue'
import '@arcwrightstudio/svifa/svifa.css'
</script>

<template>
  <SmoothScroll :lerp="0.08">
    <RouterView />
  </SmoothScroll>
</template>
```

`SmoothScroll` takes Svifa's options as props (and `scroller` as a template ref too) and renders only what it holds. Changing a prop
that shapes the feel retunes the running Svifa, and one taken off goes back to its default; changing what it scrolls makes it again.
A flag written alone is on (`<SmoothScroll anchors>`), and one left out keeps its default. Anything inside reaches the Svifa with
`useSvifa`, a ref that is null on the server and until the Svifa is made:

```vue
<script setup>
import { ref } from 'vue'
import { useSvifa } from '@arcwrightstudio/svifa/vue'

const svifa = useSvifa()
const progress = ref(0)
useSvifa((current) => (progress.value = current.progress))
</script>

<template>
  <button @click="svifa?.scrollTo('top')">Back to top</button>
  <progress :value="progress" max="1" />
</template>
```

Vue 3.3 and later.

### Nuxt

The Vue component, in `app/app.vue` (in Nuxt 3, `app.vue`) or a layout. It makes the Svifa in the browser only, so server
rendering is untouched:

```vue
<script setup>
import { SmoothScroll } from '@arcwrightstudio/svifa/vue'
</script>

<template>
  <SmoothScroll :anchors="{ offset: -80 }">
    <NuxtPage />
  </SmoothScroll>
</template>
```

Add the stylesheet in `nuxt.config.ts`: `css: ['@arcwrightstudio/svifa/svifa.css']`. Pages and components reach the Svifa with
`useSvifa`, as above.

### Svelte and SvelteKit

In a component, or for a whole SvelteKit site in `src/routes/+layout.svelte`:

```svelte
<script>
  import { smoothScroll } from '@arcwrightstudio/svifa/svelte'
  import '@arcwrightstudio/svifa/svifa.css'

  let { children } = $props()
  const svifa = smoothScroll({ lerp: 0.08 })
</script>

{@render children()}
```

`smoothScroll` is called while the component starts. It makes the Svifa once the component is in the page, takes it off when the
component leaves, and returns a store of it: `$svifa` is null on the server and until the Svifa is made. Components inside reach the
same store with `useSvifa`, which also takes a function to call on every scroll:

```svelte
<script>
  import { useSvifa } from '@arcwrightstudio/svifa/svelte'

  const svifa = useSvifa()
  let progress = $state(0)
  useSvifa((current) => (progress = current.progress))
</script>

<button onclick={() => $svifa?.scrollTo('top')}>Back to top</button>
<progress value={progress} max="1"></progress>
```

For a scrolling element, pass a function that returns it: `smoothScroll({ scroller: () => box })`, with `bind:this={box}` on the
element. Retune it with `$svifa?.configure({ lerp })`, in an `$effect` to follow state. Svelte 4 and 5.

### Solid

The Solid entry has a component and a primitive:

```tsx
import { SmoothScroll } from '@arcwrightstudio/svifa/solid'
import '@arcwrightstudio/svifa/svifa.css'

export function App(props) {
  return <SmoothScroll lerp={0.08}>{props.children}</SmoothScroll>
}
```

`SmoothScroll` takes Svifa's options as props, with `scroller` also taking a function that returns an element (one set with
`ref`). Changing a prop that shapes the feel retunes the running Svifa; changing what it scrolls makes it again. Anything inside
reaches the Svifa with `useSvifa`, an accessor that is null on the server and until the Svifa is made:

```tsx
import { createSignal } from 'solid-js'
import { useSvifa } from '@arcwrightstudio/svifa/solid'

function BackToTop() {
  const svifa = useSvifa()
  return <button onClick={() => svifa()?.scrollTo('top')}>Back to top</button>
}

function ReadingProgress() {
  const [progress, setProgress] = createSignal(0)
  useSvifa((current) => setProgress(current.progress))
  return <progress value={progress()} max={1} />
}
```

Solid 1.6 and later, SolidStart included.

### Angular

In the app's providers, `src/app/app.config.ts`:

```ts
import { type ApplicationConfig } from '@angular/core'
import { provideSmoothScroll } from '@arcwrightstudio/svifa/angular'

export const appConfig: ApplicationConfig = {
  providers: [provideSmoothScroll({ lerp: 0.08 })],
}
```

Add `node_modules/@arcwrightstudio/svifa/svifa.css` to `styles` in `angular.json`. The Svifa is made once the app has first
rendered, only in the browser, so server rendering is untouched; and outside Angular's zone, so a glide's frames do not run change
detection. It works with zone.js and without it. Anything in the app reaches it with `injectSvifa`, a signal that is null until the
Svifa is made, which also takes a function to call on every scroll:

```ts
import { Component, signal } from '@angular/core'
import { injectSvifa } from '@arcwrightstudio/svifa/angular'

@Component({
  selector: 'app-reading',
  template: `
    <button (click)="svifa()?.scrollTo('top')">Back to top</button>
    <progress [value]="progress()" max="1"></progress>
  `,
})
export class Reading {
  protected readonly svifa = injectSvifa()
  protected readonly progress = signal(0)

  constructor() {
    injectSvifa((svifa) => this.progress.set(svifa.progress))
  }
}
```

For a scrolling element in a component, `createSvifa` makes a Svifa of the component's own, taken off with it. Its options may be a
function, read once the component has rendered, so they can name an element from a view query:

```ts
private readonly box = viewChild.required<ElementRef<HTMLElement>>('box')
private readonly boxed = createSvifa(() => ({ scroller: this.box().nativeElement }))
```

Angular 19 and later.

### Astro

In a layout:

```astro
---
import SmoothScroll from '@arcwrightstudio/svifa/astro'
---

<body>
  <SmoothScroll lerp={0.08} anchors={{ offset: -80 }} />
  <slot />
</body>
```

The component brings the stylesheet with it. Its props are the options that can be written in markup: all but `easing` and
`native`, with `scroller` and `subpixel` as CSS selectors. With Astro's view transitions (`<ClientRouter />`), a Svifa is made for
each page as it comes in. A script reaches the page's Svifa through the hidden element the component renders, `svifa-scroll`:

```astro
<script>
  document.addEventListener('astro:page-load', () => {
    document.querySelector('svifa-scroll')?.svifa?.on('scroll', ({ progress }) => {})
  })
</script>
```

### A plain page

```html
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@arcwrightstudio/svifa@1.2.0/svifa.css" integrity="sha384-otF4Jeb3ig0lwx4TPg07EA4DX21Rv2bYdenWzivt0s9iF/itD6ESvFkAKjyNPwyE" crossorigin="anonymous" />
<script src="https://cdn.jsdelivr.net/npm/@arcwrightstudio/svifa@1.2.0/dist/svifa.global.min.js" integrity="sha384-Cvbx0AtzHAYXN/83k5dga5GIWLE56mbxDTK87Hk3OdpWBtLbcH3kYCymXOMyyIaC" crossorigin="anonymous"></script>
<script>
  const svifa = new Svifa()
</script>
```

## Tuning the feel

Two settings shape how a glide feels. `lerp` closes in on the target by a share of the way that is left, so a glide starts quick
and settles softly; the lower it is, the longer and softer the glide. `duration` instead takes a set time along an `easing` curve.

| Feel        | Setting                       |
| ----------- | ----------------------------- |
| Snappy      | `lerp: 0.16`                  |
| The default | `lerp: 0.1`                   |
| Soft        | `lerp: 0.07`                  |
| Slow        | `lerp: 0.05`                  |
| Very slow   | `lerp: 0.03`                  |
| A set time  | `duration: 1`, with `easing`  |

`wheelSpeed` sets how far each turn of the wheel goes (`0.8` is calmer, `1.2` covers more). A glide to one place can have its own
feel: `svifa.scrollTo('#faq', { duration: 1.4 })`.

All of these can change while the page is open, for a settings panel, or a feel per page:

```js
svifa.configure({ lerp: 0.05 })
svifa.configure({ duration: 1.2, easing: (t) => 1 - (1 - t) ** 3 })
svifa.configure({ duration: undefined }) // back to lerp
```

Whatever the setting, a glide takes the same time at every refresh rate, from 60 Hz to 1000 Hz.

Each component is tested in an app of its framework, and every example is built with its framework's own tool and driven in a
browser on each change: Next.js 16 with React 19, Vue 3.5 with Vite, Nuxt 4, SvelteKit 3 with Svelte 5, Solid 1.9 with Vite,
Angular 22 and Astro 7, as well as plain Vite and the plain page. The components are also tested on the oldest version of each
framework they support: React 18, Vue 3.3, Svelte 4, Solid 1.6 and Angular 19 (with zone.js and without). GSAP 3 drives Svifa from
its own ticker.

## Options

```js
new Svifa({ lerp: 0.08, anchors: { offset: -80 } })
```

| Option          | Default              | What it does                                                                                                                                                                                                   |
| --------------- | -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `scroller`      | `window`             | What scrolls: the page, or a scrolling element (one with `overflow: auto` or `scroll` and more content than fits).                                                                                            |
| `axis`          | `'vertical'`         | `'horizontal'` for a scroller that moves sideways, right-to-left content included; it then takes the wheel's up and down as left and right. `'both'` for one that moves both ways. See [Both ways](#both-ways). |
| `lerp`          | `0.1`                | How quickly a glide closes in, the same at any refresh rate: at `0.1`, about a tenth of the remaining distance every sixtieth of a second. Lower glides longer and softer; higher follows the wheel more closely, up to `1`. |
| `duration`      | none                 | Glide for a set time instead, in seconds, along `easing`. Used by the wheel and by `scrollTo`.                                                                                                                  |
| `easing`        | exponential ease-out | The curve of a timed glide: a function from the share of the time gone (0 to 1) to the share of the distance covered.                                                                                          |
| `wheel`         | `true`               | Glide the mouse wheel and the trackpad. `false` leaves them to the browser; `scrollTo` still glides.                                                                                                           |
| `wheelSpeed`    | `1`                  | Multiplies every wheel and trackpad movement.                                                                                                                                                                  |
| `nested`        | `true`               | A scrolling box inside the scroller (a menu, a code sample, a chat log) scrolls on its own for as long as it can move the way the wheel turns, or while its `overscroll-behavior` keeps the wheel. `false` glides over such boxes. |
| `native`        | none                 | `(element) => boolean`. Elements whose wheel turns are always left to the browser.                                                                                                                             |
| `chain`         | `true`               | For a scrolling element: once it is at its start or end, the wheel carries on to the page around it, as the browser's own scrolling does.                                                                    |
| `subpixel`      | none                 | The elements to draw between whole pixels while the content glides. See [Drawing between pixels](#drawing-between-pixels).                                                                                    |
| `anchors`       | `false`              | Glide to same-page links when they are clicked. `true`, or `scrollTo` options for every such glide. See [Same-page links](#same-page-links).                                                                  |
| `snap`          | `false`              | Glide to the snap points the page sets in CSS (`scroll-snap-type`). See [Scroll snapping](#scroll-snapping).                                                                                                  |
| `reducedMotion` | `true`               | Follow the reader's reduced-motion setting: while it is on, the wheel is the browser's and `scrollTo` moves at once.                                                                                          |
| `autoRaf`       | `true`               | Run Svifa's own frame loop, which runs only while something moves. `false` to call `svifa.raf(time)` from your own loop.                                                                                      |

An option that should be a number and is not a finite one (`NaN` or `Infinity`, for example) is taken as its default.

## Methods

### `scrollTo(target, options?)`

```js
svifa.scrollTo('#pricing', { offset: -80 })
svifa.scrollTo(0)
const arrived = await svifa.scrollTo(document.querySelector('.faq'), { duration: 0.8 })
svifa.scrollTo({ x: 1200, y: 400 }) // with axis: 'both'
```

`target` is a position in pixels from the start, an element, a CSS selector or `#id`, `'top'` or `'start'`, or `'bottom'` or
`'end'`. An element lands where the browser puts it for a link to it: its start at the start of the scroller, less its own
`scroll-margin` and the scroller's `scroll-padding`. An element inside a scrolling box of its own is first brought into view in that
box, as the browser does for a link. On a scroller that moves both ways, a number is the vertical position, `{ x, y }` sets each axis
(an axis left out stays where it is), and an element, a selector or a keyword sets both.

| Option      | Default | What it does                                                    |
| ----------- | ------- | --------------------------------------------------------------- |
| `offset`    | `0`     | Added to the position, for example `-80` to stop below a sticky header. Both ways: a number for the vertical axis, or `{ x, y }`. |
| `immediate` | `false` | Move at once, without a glide.                                  |
| `lerp`      | Svifa's | This glide's own `lerp`.                                        |
| `duration`  | Svifa's | This glide's own `duration`, in seconds.                        |
| `easing`    | Svifa's | This glide's own `easing`.                                      |
| `lock`      | `false` | Keep the wheel from moving the scroller until this glide arrives. |
| `force`     | `false` | Glide even while Svifa is stopped.                              |

A glide's own `lerp` or `duration` replaces Svifa's; with neither, it glides as the wheel does.

Returns a promise that resolves `true` when the glide arrives, and `false` when it does not: something else moved the scroller
first, a later `scrollTo` or the wheel took over, Svifa is stopped, or the target is not on the page (which also logs a warning). It
never rejects. While the reader asks for reduced motion, and on a scroller that snaps (see [Scroll snapping](#scroll-snapping)), it
moves at once and resolves `true`.

### `configure(changes)`

Changes how Svifa feels while it runs: `lerp`, `duration`, `easing`, `wheel`, `wheelSpeed`, `nested`, `native`, `chain`, `anchors`
and `snap`. Each one given replaces the one in use, from the next glide or wheel turn; `duration: undefined` goes back to gliding by
`lerp`, and a number that is not a finite one leaves that option as it was. `scroller`, `axis`, `subpixel`, `reducedMotion` and
`autoRaf` belong to the scroller itself: to change them, destroy Svifa and make it again. See [Tuning the feel](#tuning-the-feel).

### `stop()` and `start()`

`stop()` holds the scroller where it is, for a dialog or a menu: the wheel no longer moves it, and with `svifa.css` neither do the
keyboard or the scroll bar. Where a scroll bar takes room on the page, that room is kept, so nothing shifts sideways. `start()`
lets it move again. The wheel is held this way whatever the other options say, and so it is while a glide with `lock` is under way.

### `on('scroll', listener)` and `off('scroll', listener)`

```js
const unsubscribe = svifa.on('scroll', ({ scroll, progress, velocity, direction }) => {
  progressBar.style.scale = `${progress} 1`
})
```

The listener is called with the Svifa instance whenever the scroller's position changes, whatever moved it: once a frame during a
glide, and on every scroll of the browser's own. `on` returns a function that removes the listener.

### `raf(time)`

Moves a glide on to `time`, in milliseconds as `requestAnimationFrame` gives it. Only needed with `autoRaf: false`; see
[Your own frame loop](#your-own-frame-loop).

### `destroy()`

Takes Svifa off the page. The scroller stays where it is, and every listener, class and style Svifa added is removed. Calling it
again does nothing.

## Properties

| Property     | What it is                                                                                                       |
| ------------ | ---------------------------------------------------------------------------------------------------------------- |
| `scroll`     | Where the content is, in pixels from the start: the glide's exact position while it moves, and the scroller's own position at rest. |
| `target`     | Where the scroller is heading: the end of the glide under way, or at rest the same as `scroll`.                  |
| `limit`      | The furthest it can scroll, in pixels, measured as it is now.                                                     |
| `progress`   | `scroll` as a share of `limit`, from 0 to 1 (1 when it cannot scroll at all).                                     |
| `velocity`   | How fast it is moving, in pixels a second, positive toward the end.                                              |
| `direction`  | `1` toward the end, `-1` toward the start, `0` before it has moved.                                              |
| `isGliding`  | Whether a glide is under way.                                                                                     |
| `isStopped`  | Whether Svifa is stopped.                                                                                         |
| `element`    | The element that scrolls: `<html>` for the page.                                                                  |
| `axis`       | `'vertical'`, `'horizontal'` or `'both'`.                                                                         |
| `options`    | The options in use, every default filled in. Read only: change them with `configure`.                           |
| `x`, `y`     | Each axis on its own: `{ scroll, target, limit, progress, velocity, direction }`. `x` is `null` unless Svifa moves the scroller sideways, and `y` unless it moves it up and down. |

On a scroller that moves both ways, `scroll`, `target`, `limit`, `progress`, `velocity` and `direction` are its vertical axis.

The module also exports `easeOut`, the default easing, and `version`.

## Events, classes and attributes

The browser's own `scroll` events fire as they always do, since Svifa moves the real scroll position. A `scrollend` event is sent
once for each glide that moved the scroller, when it arrives, in place of the one the browser would send after each of Svifa's
frames; it carries `detail.svifa === true`. For the page it is sent on `document` and bubbles to `window`; for an element, on the
element. Only the scroller's own `scrollend` events are held back: every other scrolling box on the page keeps its own.

Svifa sets these classes on the scroller's element (`<html>` for the page), and puts them back if other code rewrites the `class`
attribute:

| Class            | When                                                                                                    |
| ---------------- | ------------------------------------------------------------------------------------------------------- |
| `svifa`          | Svifa is running.                                                                                       |
| `svifa-gliding`  | A glide is under way.                                                                                   |
| `svifa-stopped`  | Svifa is stopped.                                                                                       |
| `svifa-subpixel` | Svifa draws between pixels: `subpixel` is set, the browser can, and the reader has not asked for reduced motion. |

An element with the `data-svifa-native` attribute, and everything inside it, keeps the browser's own wheel scrolling.

## Both ways

```js
const svifa = new Svifa({ scroller: document.querySelector('.board'), axis: 'both' })
svifa.scrollTo({ x: 2400, y: 900 })
svifa.on('scroll', ({ x, y }) => minimap.show(x.progress, y.progress))
```

With `axis: 'both'`, a scroller that moves up and down and sideways (a map, a board, a wide table) glides both ways at once: one
movement of the wheel or the trackpad moves each axis by its own part, with the same feel. Each axis stops at its own end, and the
wheel goes on to the page around the scroller only when every way it turned is at its end. A mouse wheel turned with Shift moves it
sideways, as the browser's own scrolling does. Drawing between pixels works on both axes.

## Drawing between pixels

A browser keeps a page's scroll position on whole pixels: Chrome and Edge on device pixels, Firefox and Safari on whole CSS pixels.
In the slow end of a glide the page moves less than a pixel a frame, and on a fast screen it does so for many frames in a row, so
the page stands still and then hops a pixel. With `subpixel`, Svifa puts the scroller on the nearest whole pixel and moves the
elements you list by the part of a pixel left over, which the GPU draws in between. At rest nothing is moved.

```js
new Svifa({ subpixel: 'main > section, footer' })
```

```css
.svifa-subpixel main > section,
.svifa-subpixel footer {
  will-change: translate;
}
```

`subpixel` takes a CSS selector, a list of elements, or a function that returns them. Only elements inside the scroller are used.
Elements added while the content glides are picked up from the next frame.

**What to list.** The blocks that scroll with the content, together covering everything that moves: usually the top-level
sections of the page and its footer. Content left out is drawn on the whole pixel and can drift up to half a pixel from its listed
neighbours during a glide. Prefer a few large blocks to many small ones; each is a layer the GPU keeps.

**What not to list.** An element with `position: fixed`, or any ancestor of one: `will-change: translate` makes an element the
containing block of the fixed elements inside it, so they would scroll with it.

**Sticky elements.** List every sticky element that sits inside a listed element, with the same `will-change` rule. Svifa moves it
only while it travels with the page and holds it still while it is held; left out, it would move with the element around it by up
to half a pixel while it should be still. Svifa checks this once the page has settled and names any it finds missing in the
console.

**What changes.**

- Each listed element becomes a stacking context. A menu inside one section, with a `z-index`, no longer rises above the next
  section. Give that section a higher `z-index`, or render the menu outside the listed elements (most dialog and menu libraries
  render at the end of `<body>`).
- On a system that draws text with subpixel colour antialiasing (ClearType on Windows), Chrome and Edge draw the text inside a
  listed element with greyscale antialiasing instead, at rest as well. macOS has drawn all text in greyscale since macOS 10.14,
  so there it makes no difference. Compare a page with and without the option before you decide.
- An element's own `translate` style is replaced while the content glides and put back when it rests. Animate a listed element
  with `transform` instead.

Svifa leaves this off where the browser has no `translate` property, for a horizontal scroller in right-to-left content, and
while the reader asks for reduced motion (when `svifa-subpixel` is not set, so the `will-change` rule above does not apply).

## Same-page links

With `anchors`, a click on a link to a place on the same page (`href="#id"`, `"#"` or `"#top"`) glides there in place of the
browser's jump:

```js
new Svifa({ anchors: { offset: -80 } })
```

The link still goes into the address as a new history entry, and `hashchange` is sent. No `popstate` is sent, so a client-side
router does not take the click for a navigation. A target inside a scrolling box of its own is brought into view in that box first,
as the browser does. A link pressed from the keyboard, as a skip link is, also moves keyboard focus to the place, so the next Tab
carries on from there. An element that cannot take focus is given `tabindex="-1"` until it loses focus; if your styles show a focus
outline on such elements, you may want to hide it.

Links to other pages, links opened in a new tab or window, downloads, and links to an id that is not on the page are left to the
browser. A Svifa on a scrolling element takes only links to places inside it, and leaves `#` and `#top` to the page. `:target`
keeps matching what it matched before the click: the browser updates it only for a jump of its own.

Rather than `offset`, you can give the targets `scroll-margin-top`. Svifa honours it as the browser does, and so does everything else
that scrolls to an element.

## Accessibility

- The reader's reduced-motion setting is followed by default. A change to it while the page is open takes effect at once, and a
  glide under way finishes at once.
- Svifa moves the scroller only for the wheel, the trackpad and your own calls. The keyboard, the scroll bar, touch, find in page
  and the browser's own scrolling of a focused field into view stay the browser's, and a key that scrolls ends a glide at once.
- With `anchors`, keyboard focus follows a link pressed from the keyboard. See [Same-page links](#same-page-links).

## Scroll snapping

```js
new Svifa({ snap: true })
```

With `snap: true`, a scroller with `scroll-snap-type` glides to the snap points its CSS sets. The wheel moves as far as it would
without snapping, and the glide comes to rest on the nearest snap point:

- With `mandatory`, a turn too small to get halfway to the next point still goes on to it, so one notch or one trackpad swipe moves
  one point, and a longer movement goes as far as the wheel takes it.
- With `proximity`, it rests where the wheel takes it, unless a snap point is within a third of the visible area; then it rests on
  the point ahead.
- `scrollTo` and same-page links rest on the snap point nearest their target.
- `scroll-padding`, `scroll-margin`, `scroll-snap-stop: always` and areas longer than the visible area are honoured.

Browsers differ over where a scroller may rest, most of all inside an area longer than the visible area, so before each glide Svifa
asks the browser and rests exactly where the browser itself would. The browser's snapping is held off while Svifa glides and put
back when it rests, so it never moves the scroller afterwards. The keyboard, the scroll bar and touch snap as the browser does.

Without `snap`, a scroller that snaps is left to the browser: the wheel scrolls it as the browser does, and `scrollTo` moves at
once. So is a scroller in a vertical writing mode, with or without it.

## Your own frame loop

With `autoRaf: false`, call `raf` from your loop every frame:

```js
const svifa = new Svifa({ autoRaf: false })

function frame(time) {
  svifa.raf(time)
  requestAnimationFrame(frame)
}
requestAnimationFrame(frame)
```

With GSAP, let its ticker drive Svifa:

```js
const svifa = new Svifa({ autoRaf: false })
gsap.ticker.add((time) => svifa.raf(time * 1000))
gsap.ticker.lagSmoothing(0)
```

ScrollTrigger needs nothing more: it reads the real scroll position, which Svifa moves.

## Server rendering

Importing the package is safe anywhere and touches nothing, on Node 14 and later. Creating a Svifa needs a browser; on the server
the constructor throws an error that says so. Create it where only the browser runs your code: an effect, `onMounted`, `onMount`,
`afterNextRender`, a client-only plugin.

## Troubleshooting

**Nothing glides.** Check that the page itself scrolls. A layout that sets `html, body { height: 100%; overflow: auto }` makes
`<body>` the scroller instead; pass `scroller: document.body`, or whichever element really scrolls. Svifa also leaves the wheel
alone while the scroller has `overflow: hidden`, which is how many dialogs lock scrolling, and on a scroller that snaps unless
`snap` is on.

**A box inside the page does not scroll, or the page scrolls instead.** A box scrolls on its own only while it has room to move the
way the wheel turns and its `overflow` is `auto` or `scroll`. For anything else (a map, a canvas, a custom scroller), add
`data-svifa-native` or use the `native` option.

**A fixed element scrolls away with the page.** One of its ancestors is in the `subpixel` list. List its siblings instead.

**A sticky element shivers while it is held.** It sits inside an element in the `subpixel` list without being listed itself. See
[Drawing between pixels](#drawing-between-pixels); the console names it.

**"Svifa: this scroller already has a Svifa".** Two parts of the app each create a Svifa for the same scroller. Create it once,
near the root, or destroy the first before creating another.

**A dropdown is hidden behind the next section.** See the stacking note under [Drawing between pixels](#drawing-between-pixels).

**The page jumps when a script scrolls it.** Svifa gives way to every scroll it did not make, so a script that sets `scrollTop`
moves the page at once. Use `svifa.scrollTo` for a glide.

## Browser support

Svifa is tested in current Chromium, Firefox and WebKit, the engine of Safari. It needs a browser that runs ES2019 and supports the
options form of `scrollTo`. Drawing between pixels also needs the CSS `translate` property (Chrome and Edge 104, Firefox 72,
Safari 14.1) and is left off without it. Keeping a scroll bar's room while stopped uses `scrollbar-gutter` (Chrome and Edge 94,
Firefox 97, Safari 18.2); where it is missing, a page with a scroll bar that takes room can shift by its width while stopped.

Taking over from a key, a touch and a script's scroll is tested in all three engines, from find in page in Chromium and Firefox,
and from a drag of the scroll bar in Chromium.

Svifa works on a page with a strict Content Security Policy: it writes no inline script or style attribute, evaluates no strings,
fetches nothing, and passes no string to a script sink, so `require-trusted-types-for 'script'` holds too. It styles elements
only through their `style` property, which no policy restricts. This is tested in all three engines.

## Package

| Import                                                        | File                                                   |
| ------------------------------------------------------------- | ------------------------------------------------------ |
| `import Svifa from '@arcwrightstudio/svifa'`                  | `dist/svifa.js` (ES module)                            |
| `const { Svifa } = require('@arcwrightstudio/svifa')`         | `dist/svifa.cjs` (CommonJS)                            |
| `<script src=".../dist/svifa.global.min.js">`                 | sets `window.Svifa`                                    |
| `@arcwrightstudio/svifa/svifa.css`                            | the optional stylesheet                                |
| `import { SmoothScroll } from '@arcwrightstudio/svifa/react'` | `dist/react.js`, for React and Next.js (needs `react`) |
| `import { SmoothScroll } from '@arcwrightstudio/svifa/vue'`   | `dist/vue.js`, for Vue and Nuxt (needs `vue`)          |
| `import { smoothScroll } from '@arcwrightstudio/svifa/svelte'`| `dist/svelte.js`, for Svelte and SvelteKit (needs `svelte`) |
| `import { SmoothScroll } from '@arcwrightstudio/svifa/solid'` | `dist/solid.js`, for Solid (needs `solid-js`)          |
| `import { provideSmoothScroll } from '@arcwrightstudio/svifa/angular'` | `dist/angular.js`, for Angular (needs `@angular/core`) |
| `import SmoothScroll from '@arcwrightstudio/svifa/astro'`     | `astro/SmoothScroll.astro`, for Astro                  |

Types are included for every entry and module format, including TypeScript's older `node` resolution (the Astro component is typed
by Astro itself). React, Vue, Svelte, Solid and Angular are optional peer dependencies: each is needed only by its own entry. The ES
module and the CommonJS file are separate copies of the code, so use one of them throughout an app.

Each version carries its software bill of materials, `dist/sbom.cdx.json` (CycloneDX), and its signed provenance; SECURITY.md says
[how to verify a release](./SECURITY.md#verifying-a-release).

Svifa follows [semantic versioning](https://semver.org).

## With AI coding tools

Every option, method and property is documented in the types, so an editor or an assistant shows the explanation where the code is
written. The package also carries [`llms.txt`](./llms.txt) (`node_modules/@arcwrightstudio/svifa/llms.txt`): the whole API and the
rules for using it in one plain file, to give an AI coding tool as context.

## Roadmap

What Svifa is set to do next:

- Keeping up with browsers: a new scrolling feature is adopted as browsers ship it, and anything it makes unnecessary is removed.
- A ready-made component for each framework that comes into wide use, as there are for React, Vue, Svelte, Solid, Angular and
  Astro.

What it will not do: effects driven by scrolling (parallax, reveals), which its scroll event and the browser's own scroll-driven
animations already make possible; virtual scrolling of long lists; and work in browsers that lack what it needs, which keep their
own scrolling.

## Working on Svifa

[CONTRIBUTING.md](./CONTRIBUTING.md) has the commands, how the code works and the rules every change follows, and
[GOVERNANCE.md](./GOVERNANCE.md) who decides and how. Report a security issue as [SECURITY.md](./SECURITY.md) describes, which also
says what Svifa can and cannot promise and how to verify a release, and ask questions in
[Discussions](https://github.com/arcwrightstudio/svifa/discussions).

## License

[MIT](./LICENSE), © Arcwright Studio.
