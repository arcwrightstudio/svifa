# Changelog

Svifa follows [semantic versioning](https://semver.org).

## Unreleased

### Added

- `snap`: a scroller with `scroll-snap-type` glides to the snap points its CSS sets. The wheel moves as far as it would without
  snapping and the glide rests on the nearest snap point; with `mandatory`, one notch or one trackpad swipe moves one point.
  `scrollTo` and same-page links rest on the snap point nearest their target. `scroll-padding`, `scroll-margin`,
  `scroll-snap-stop: always` and areas longer than the visible area are honoured, and every rest is where the browser itself would
  let the scroller rest, so its own snapping never moves it afterwards. `configure` changes it while Svifa runs.
- Components for every major framework, beside the React one: Vue and Nuxt (`@arcwrightstudio/svifa/vue`: `SmoothScroll`,
  `useSvifa`), Svelte and SvelteKit (`@arcwrightstudio/svifa/svelte`: `smoothScroll`, `useSvifa`), Solid
  (`@arcwrightstudio/svifa/solid`: `SmoothScroll`, `useSvifa`), Angular (`@arcwrightstudio/svifa/angular`: `provideSmoothScroll`,
  `injectSvifa`, `createSvifa`) and Astro (`@arcwrightstudio/svifa/astro`: `SmoothScroll`, view transitions included). Each renders
  on a server and is tested on the oldest version of its framework it supports: Vue 3.3, Svelte 4, Solid 1.6 and Angular 19.
- Examples for Vue, Nuxt, SvelteKit, Solid, Angular and Astro. Every example is built with its framework's own tool from the package
  as it would be published, and driven in a browser, on each change.

### Fixed

- React: a prop taken off `SmoothScroll` (left out of its props) now goes back to its default; it kept the value it had.
- The README gave the size as under 8 kB minified and gzipped, which 1.1.0 already passed (8.6 kB). It now gives the size as
  measured, and a test keeps it true.

## 1.1.0

### Added

- `axis: 'both'`: a scroller that moves up and down and sideways glides both ways at once, each axis by its own part of a wheel or
  trackpad movement, and Shift with a mouse wheel moves it sideways. `svifa.x` and `svifa.y` report each axis; `scrollTo` takes
  `{ x, y }` and `offset` takes `{ x, y }`.
- The package carries its software bill of materials, `dist/sbom.cdx.json` (CycloneDX).

### Fixed

- In a browser that keeps whole CSS pixels on a screen with more than one device pixel to a CSS pixel, a page's first glide near
  either end now behaves as it does everywhere else: a glide within a pixel of the end reaches it (a one-pixel wheel turn there did
  nothing), the scroller is drawn within half a pixel of the glide from its first frame, and the glide stops on the frame it is
  drawn at its end.
- An `easing` that is not a function is left out, as a number that is not finite already was. A timed glide given one stopped with
  an error on its first frame.
- With `anchors`, keyboard focus now follows a same-page link pressed with Enter in Firefox too, which counts that press as one
  click.

## 1.0.0

First release.
