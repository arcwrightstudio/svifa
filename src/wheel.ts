// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Arcwright Studio

// A turn of the wheel or a move on a trackpad, in pixels, and whether an element inside the scroller should take it instead.

import type { TunableOptions } from './types'

// One notch of a mouse wheel scrolls three lines. Chrome and Safari report a notch as 100 pixels, Firefox as 3 lines; a line of 100/3
// pixels makes a notch the same distance in every browser.
const LINE = 100 / 3

/** The wheel event's movement in pixels on each axis, whatever unit the browser reported it in. */
export function wheelDelta(event: WheelEvent, page: { width: number; height: number }): { x: number; y: number } {
  let x = event.deltaX
  let y = event.deltaY
  if (event.deltaMode === 1) {
    x *= LINE
    y *= LINE
  } else if (event.deltaMode === 2) {
    x *= page.width
    y *= page.height
  }
  return { x, y }
}

const SCROLLS = new Set(['auto', 'scroll', 'overlay'])

// Form controls and editable text scroll the browser's own way.
const EDITABLE = new Set(['TEXTAREA', 'SELECT', 'INPUT'])

/** How the wheel is shared with scrolling boxes inside a scroller (the `nested` option). */
export type Nested = boolean | 'native' | ((box: Element) => boolean | 'native' | TunableOptions)

/** A box inside that glides this turn of the wheel itself, and how it feels when the `nested` option gives it a feel of its own. */
export type Inside = { box: HTMLElement; feel: TunableOptions | null }

/**
 * What takes this movement instead of the scroller, if anything: `'native'` when the browser does (an element marked
 * `data-svifa-native` or picked by `native`, a box that `nested` leaves to the browser, or one whose overscroll-behavior keeps the
 * wheel inside it at its end), a box that glides it itself, or null when the scroller takes it.
 */
export function takenInside(
  event: Event,
  scroller: Element,
  horizontal: boolean,
  delta: number,
  nested: Nested,
  native: ((element: Element) => boolean) | undefined
): Inside | 'native' | null {
  for (const node of event.composedPath()) {
    if (node === scroller || !(node instanceof Element)) {
      if (node === scroller || node === document || node === window) return null
      continue
    }
    if (node.hasAttribute('data-svifa-native') || native?.(node)) return 'native'
    if (nested === false) continue

    const room = horizontal ? node.scrollWidth - node.clientWidth : node.scrollHeight - node.clientHeight
    if (room < 1) continue
    const style = getComputedStyle(node)
    // a form control scrolls itself whatever its overflow reads (Firefox reports a textarea's as visible)
    const control = EDITABLE.has(node.tagName)
    if (!control && !SCROLLS.has(horizontal ? style.overflowX : style.overflowY)) continue
    const at = horizontal ? node.scrollLeft : node.scrollTop
    if (!(delta > 0 ? at < room - 0.5 : at > 0.5)) {
      // at its end: a browser without overscroll-behavior (Safari before 16) reports nothing, which is the same as auto
      const overscroll = horizontal ? style.overscrollBehaviorX : style.overscrollBehaviorY
      if (overscroll && overscroll !== 'auto') return 'native'
      continue
    }
    if (control || nested === 'native' || !(node instanceof HTMLElement) || node.isContentEditable) return 'native'
    const decided = typeof nested === 'function' ? nested(node) : true
    if (decided === false) continue
    if (decided === 'native') return 'native'
    return { box: node, feel: typeof decided === 'object' && decided !== null ? decided : null }
  }
  return null
}
