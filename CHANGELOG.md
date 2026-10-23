# Changelog

Svifa follows [semantic versioning](https://semver.org).

## 1.2.0

### Added

- Drawing between pixels is on by default, with no CSS. Svifa chooses the blocks that scroll with the content and gives each a layer
  of its own (`will-change: translate`, which it sets for as long as it runs and then puts back), splitting a block around a fixed
  element inside it or a `z-index` that reaches past it, and holding sticky elements still while they are held. It chooses once the
  page is idle and again when the page changes; an element that becomes fixed inside a block loses that block's layer before the
  page is drawn again. Where a layer would change what is drawn over what (a fixed or sticky element with no `z-index`, followed by
  content), it draws on whole pixels and says why once in the console. `data-svifa-subpixel="off"` leaves an element on whole
  pixels, and `subpixel: false` turns it off. Firefox, which at a screen scale of 100% draws whole pixels whatever it is asked, and
  a device with only a touch screen get no layers.
- Scrolling boxes inside the scroller glide the wheel themselves, with the same feel and drawn between pixels, and hand it on at
  their end. Boxes found on the page are ready before the wheel first turns over them; a box with a Svifa of its own keeps it.
  `nested: 'native'` leaves boxes to the browser, and a function decides for each box, giving one a feel of its own if it returns
  options. `configure` passes on to them. While the page glides, a box's content moves with it exactly: the browser moves a box
  with a layer of its own only by whole pixels, and Svifa puts back the part of a pixel it leaves out, in every box inside, also
  one whose wheel is left to the browser.
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
- Examples for Vue, Nuxt, SvelteKit, Solid, Angular and Astro (Nuxt, SvelteKit and Angular rendered on the server). Every example
  is built with its framework's own tool from the package as it would be published, served as its framework serves it, and driven
  in a browser, on each change.

### Changed

- `nested: true`, the default, now glides a scrolling box inside the scroller; it left the box to the browser before. `nested:
  'native'` is the earlier behaviour.
- A page that names its elements in `subpixel` keeps them and no longer needs a CSS rule for them: Svifa sets each one's layer
  itself.
- Drawn on whole pixels (with `subpixel: false`, in Firefox, which at a screen scale of 100% draws whole pixels, or where Svifa
  cannot draw between pixels), a glide never moves slower than one pixel a sixtieth of a second (60 px a second), at any refresh
  rate. Its last pixels come at an even pace instead of ever more slowly, which showed as the page standing still for up to about
  180 ms and then hopping a pixel. On whole pixels a glide therefore ends sooner (one wheel notch at the default `lerp`: about 530 ms
  instead of 874 ms), and a timed glide whose easing starts or ends slowly arrives a little before its time. Drawn between pixels, a
  glide slows to a stop along its own curve, as before.

### Fixed

- Zoomed to a part of a pixel (a browser zoom such as 80% or 125%, or a screen scale such as 125%), a page drawn between pixels
  shimmered as it glided: the browser draws each scroll position on a whole device pixel, up to half of one off it, and Svifa drew
  the rest of the way from the scroll position, not from where the browser drew it. It now draws from there, and the glide ends
  where the browser draws the page at rest. The position Svifa reports is unchanged.
- Drawn between pixels, a glide could go up to a pixel past the end of the page: the fraction drawn on the last block made the page
  that much longer for the browser. The scroller is now put on the whole pixel just before the place, and the content is only ever
  moved toward the start.
- In Firefox, the wheel over a `<textarea>` that scrolls glided the page (Firefox reports a textarea's overflow as visible). It is
  left to the textarea, as is every form control and editable text.
- Installing Svifa in a Yarn Plug'n'Play project no longer turns on Yarn's experimental ES module loader, nor its warning that the
  loader is experimental. The package is `"type": "commonjs"`; `dist/package.json` marks the built ES modules for Node, every file
  keeps its name, and each framework entry imports the core from the file beside it.
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
