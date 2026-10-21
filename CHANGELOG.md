# Changelog

Svifa follows [semantic versioning](https://semver.org).

## Unreleased

### Added

- `axis: 'both'`: a scroller that moves up and down and sideways glides both ways at once, each axis by its own part of a wheel or
  trackpad movement, and Shift with a mouse wheel moves it sideways. `svifa.x` and `svifa.y` report each axis; `scrollTo` takes
  `{ x, y }` and `offset` takes `{ x, y }`.

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
