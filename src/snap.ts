// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Arcwright Studio

import type { Scroller } from './scroller'
import { SCROLLS, lengthOf } from './target'

/**
 * A place a snapping scroller may rest along one axis, read from the page's CSS as the browser reads it: one position (`from` and
 * `to` the same), or a stretch it may rest anywhere in (an area longer than the visible area may be read from end to end). `stop`
 * is `scroll-snap-stop: always`: a movement may not pass over it.
 */
export interface Spot {
  from: number
  to: number
  stop: boolean
}

/** How a scroller snaps: whether every rest must be on a snap point (`mandatory`), and along which axes. */
export interface SnapType {
  strict: boolean
  x: boolean
  y: boolean
}

// A proximity snap point within this share of the visible area pulls a rest onto it. Browsers reach 0.3 (Firefox, Safari) or a
// third (Chrome) of it; the farthest of them is taken, so once a glide rests no browser snaps it somewhere else.
const PROXIMITY = 1 / 3

// Within this far of a position, in pixels, a rest counts as at it: less than the half pixel a browser rounds to.
const NEAR = 0.5

/**
 * How a scroller snaps, from its `scroll-snap-type` and writing mode, or null when it does not, or does so in a vertical writing mode
 * (where the browser's own snapping stands).
 */
export function snapTypeOf(type: string, root: Element): SnapType | null {
  const words = type.split(' ')
  if (!type || words[0] === 'none' || getComputedStyle(root).writingMode !== 'horizontal-tb') return null
  const axis = words[0]
  return {
    strict: words[1] === 'mandatory',
    x: axis === 'x' || axis === 'inline' || axis === 'both',
    y: axis === 'y' || axis === 'block' || axis === 'both',
  }
}

/**
 * Every place the scroller may rest along its axis, from the `scroll-snap-align` of the elements it holds (those whose nearest
 * scrolling ancestor it is), their `scroll-margin` and its own `scroll-padding`. `drawnOffset` says how far an element is
 * drawn from where the browser alone puts it, so a measurement mid-glide is exact.
 */
export function spotsOf(scroller: Scroller, drawnOffset: (element: Element) => number): Spot[] {
  const { root, horizontal, reversed } = scroller
  const style = getComputedStyle(root)
  const viewport = scroller.viewport
  const [start, end] = sides(horizontal, reversed)
  const padStart = lengthOf(style[`scrollPadding${start}`], viewport)
  const port = viewport - padStart - lengthOf(style[`scrollPadding${end}`], viewport)
  const limit = scroller.measure()
  const position = scroller.position
  const edge = scroller.edge
  // how far a point on the screen is from the start of the scroller's content along its axis
  const along = (point: number, shift: number) => position + (reversed ? edge - point : point - shift - edge)
  const spots: Spot[] = []

  // the elements as the page draws them: each one's children, and those of its open shadow root, where a component draws its own
  const visit = (parent: Element | ShadowRoot) => {
    for (const element of Array.from(parent.children)) {
      const own = getComputedStyle(element)
      if (own.display === 'none') continue
      if (own.display === 'contents') {
        visit(element)
        if (element.shadowRoot) visit(element.shadowRoot)
        continue
      }
      const align = alignOf(own.scrollSnapAlign, horizontal)
      // an element with no box (a component's child that no slot shows) is not drawn, so it is no snap area
      if (align !== 'none' && own.position !== 'fixed' && element.getClientRects().length > 0) {
        const box = element.getBoundingClientRect()
        const shift = drawnOffset(element)
        const areaStart = along(reversed ? box.right : horizontal ? box.left : box.top, shift) - marginOf(own, start)
        const areaEnd = along(reversed ? box.left : horizontal ? box.right : box.bottom, shift) + marginOf(own, end)
        spots.push(spotOf(areaStart, areaEnd, align, padStart, port, limit, own.scrollSnapStop === 'always'))
      }
      // what an element of its own scrolls snaps to that element, not to this scroller
      if (SCROLLS.includes(own.overflowX) || SCROLLS.includes(own.overflowY)) continue
      visit(element)
      if (element.shadowRoot) visit(element.shadowRoot)
    }
  }
  visit(root)
  return spots
}

// Where an area puts the scroller: aligned in the snapport (the visible area less scroll-padding) as its align says, or, when the area
// is longer than the snapport, anywhere from its start at the snapport's start to its end at the snapport's end. Kept to what the
// scroller can reach, as the browser keeps it.
function spotOf(start: number, end: number, align: string, padStart: number, port: number, limit: number, stop: boolean): Spot {
  const clamp = (position: number) => Math.min(Math.max(position, 0), limit)
  if (end - start > port) return { from: clamp(start - padStart), to: clamp(end - padStart - port), stop }
  const at = align === 'start' ? start - padStart : align === 'end' ? end - padStart - port : (start + end - port) / 2 - padStart
  return { from: clamp(at), to: clamp(at), stop }
}

// An area's scroll-margin at one edge.
function marginOf(style: CSSStyleDeclaration, edge: 'Top' | 'Bottom' | 'Left' | 'Right') {
  return Number.parseFloat(style[`scrollMargin${edge}`]) || 0
}

/** The position within `spot` nearest `at`. */
const within = (spot: Spot, at: number) => Math.min(Math.max(at, spot.from), spot.to)

/** The place nearest `at` where the scroller may rest, or null when there is none. */
export function nearest(spots: readonly Spot[], at: number): number | null {
  let best: number | null = null
  for (const spot of spots) {
    const place = within(spot, at)
    if (best === null || Math.abs(place - at) < Math.abs(best - at)) best = place
  }
  return best
}

/**
 * The place nearest `at` among those beyond `from` toward `way` (1 toward the end, -1 toward the start), or null when there is none
 * that way.
 */
export function ahead(spots: readonly Spot[], from: number, at: number, way: 1 | -1): number | null {
  let best: number | null = null
  for (const spot of spots) {
    let place = within(spot, at)
    if ((place - from) * way <= NEAR) {
      // the part of the spot beyond `from`, if it reaches that far
      place = way > 0 ? Math.max(spot.from, from + NEAR) : Math.min(spot.to, from - NEAR)
      if (place > spot.to || place < spot.from) continue
    }
    if (best === null || Math.abs(place - at) < Math.abs(best - at)) best = place
  }
  return best
}

/**
 * Where a movement from `from` to `to` has to stop instead: the first `scroll-snap-stop: always` place passed over on the way, or
 * `to` itself when it passes over none.
 */
export function stopOn(spots: readonly Spot[], from: number, to: number): number {
  const way = to > from ? 1 : -1
  let stop = to
  for (const spot of spots) {
    if (!spot.stop) continue
    const place = way > 0 ? spot.from : spot.to
    if ((place - from) * way > NEAR && (stop - place) * way > NEAR) stop = place
  }
  return stop
}

/**
 * The places a movement from `from` toward `way` could rest at, nearest first: every snap position beyond it, and for an area it may
 * rest anywhere in, the first place of it beyond `from` and its far end.
 */
export function placesAhead(spots: readonly Spot[], from: number, way: 1 | -1): number[] {
  const places: number[] = []
  const add = (place: number) => {
    const distance = (place - from) * way
    if (distance < NEAR || places.some((each) => same(each, place))) return
    let at = places.length
    while (at > 0 && (places[at - 1] - from) * way > distance) at--
    places.splice(at, 0, place)
  }
  for (const spot of spots) {
    add(spot.from)
    add(spot.to)
    const first = from + 2 * NEAR * way
    if (first > spot.from && first < spot.to) add(first)
  }
  return places
}

/** Whether a proximity snap place is near enough `at` to pull a rest onto it. */
export const inReach = (place: number, at: number, viewport: number): boolean => Math.abs(place - at) <= viewport * PROXIMITY

/** Whether two positions are the same place to rest at. */
export const same = (a: number, b: number): boolean => Math.abs(a - b) < NEAR

// The start and end edges of an axis, as CSS property suffixes: the right edge starts a right-to-left horizontal scroller.
function sides(horizontal: boolean, reversed: boolean) {
  if (!horizontal) return ['Top', 'Bottom'] as const
  return reversed ? (['Right', 'Left'] as const) : (['Left', 'Right'] as const)
}

// A scroll-snap-align value's keyword for one axis: the first value is the block axis (up and down here), the second, or the only
// one, the inline axis.
function alignOf(value: string, horizontal: boolean) {
  const [block, inline = block] = (value || 'none').split(' ')
  return horizontal ? inline : block
}
