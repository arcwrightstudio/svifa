// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Arcwright Studio

// What every framework's component shares: the options that tune how Svifa feels (changed in place) as against those that shape
// what it scrolls (it is made again), and a `subpixel` a framework can hand over anew each time without that counting as a change.
import type { SvifaOptions, TunableOptions } from './types'

/** The options that tune how Svifa feels, each as given (one left out goes back to its default). */
export const feelOf = (options: TunableOptions): TunableOptions => ({
  lerp: options.lerp,
  duration: options.duration,
  easing: options.easing,
  wheel: options.wheel,
  wheelSpeed: options.wheelSpeed,
  nested: options.nested,
  native: options.native,
  chain: options.chain,
  anchors: options.anchors,
  snap: options.snap,
})

/** What `subpixel` names, for telling whether it changed: a selector by its text; a list or a function is read afresh anyway. */
export const subpixelKey = (subpixel: SvifaOptions['subpixel']): string =>
  typeof subpixel === 'string' ? subpixel : subpixel === undefined ? '' : 'given'

/** The `subpixel` to make a Svifa with: a selector as it is; a list or a function read through `latest` each time Svifa asks. */
export function subpixelOf(latest: () => SvifaOptions['subpixel']): SvifaOptions['subpixel'] {
  const given = latest()
  if (given === undefined || typeof given === 'string') return given
  return () => {
    const now = latest()
    return typeof now === 'function' ? now() : typeof now === 'string' ? document.querySelectorAll(now) : (now ?? [])
  }
}
