# Changelog

Svifa follows [semantic versioning](https://semver.org).

## Unreleased

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
