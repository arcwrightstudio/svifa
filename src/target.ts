// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Arcwright Studio

import type { Scroller } from './scroller'
import type { Point, SvifaTarget } from './types'

/** The overflow values that make an element scroll its content (hidden scrolls too, by script). */
export const SCROLLS: readonly string[] = ['auto', 'scroll', 'overlay', 'hidden']

/**
 * What a target names: a position in pixels, or an element (or null when it names nothing on the page). `'#'` and `'#top'` (when
 * nothing has that id) are the top, as they are for a link.
 */
export function resolve(target: Exclude<SvifaTarget, Point>, scroller: Scroller): number | Element | null {
  if (typeof target === 'number') return Number.isFinite(target) ? target : null
  if (target === 'top' || target === 'start' || target === '#') return 0
  if (target === 'bottom' || target === 'end') return scroller.limit
  if (typeof target !== 'string') return target
  return find(target) ?? (target === '#top' ? 0 : null)
}

/**
 * The scroll position an element stands for: where its start lines up with the start of the scroller's visible area, less its own
 * `scroll-margin` and the scroller's `scroll-padding`, as the browser places it for a link to it. `drawnOffset` says how far an
 * element is drawn from where the browser alone would put it (Svifa's sub-pixel drawing), so the measurement is exact mid-glide.
 */
export function positionOf(element: Element, scroller: Scroller, drawnOffset: (element: Element) => number): number {
  const { horizontal, reversed } = scroller
  const box = element.getBoundingClientRect()
  const margin = Number.parseFloat(getComputedStyle(element)[side(horizontal, reversed, 'scrollMargin')]) || 0
  const padding = lengthOf(getComputedStyle(scroller.root)[side(horizontal, reversed, 'scrollPadding')], scroller.viewport)
  const start = reversed ? scroller.edge - box.right : (horizontal ? box.left : box.top) - drawnOffset(element) - scroller.edge
  return scroller.position + start - margin - padding
}

/**
 * Brings an element into view inside the scrolling boxes between it and the scroller, at once, as the browser does for a link to it:
 * each box is scrolled so the element starts at its start. Then only the scroller itself is left to move.
 */
export function reveal(element: Element, scroller: Scroller): void {
  for (let box = element.parentElement; box && box !== scroller.root && box !== document.body; box = box.parentElement) {
    const style = getComputedStyle(box)
    const room = { y: box.scrollHeight - box.clientHeight, x: box.scrollWidth - box.clientWidth }
    const scrollsY = room.y >= 1 && SCROLLS.includes(style.overflowY)
    const scrollsX = room.x >= 1 && SCROLLS.includes(style.overflowX)
    if (!scrollsX && !scrollsY) continue
    const own = element.getBoundingClientRect()
    const port = box.getBoundingClientRect()
    const target = getComputedStyle(element)
    const by: { top?: number; left?: number } = {}
    if (scrollsY) by.top = own.top - (port.top + box.clientTop) - (Number.parseFloat(target.scrollMarginTop) || 0)
    if (scrollsX) {
      by.left =
        style.direction === 'rtl'
          ? own.right - (port.left + box.clientLeft + box.clientWidth) + (Number.parseFloat(target.scrollMarginRight) || 0)
          : own.left - (port.left + box.clientLeft) - (Number.parseFloat(target.scrollMarginLeft) || 0)
    }
    box.scrollBy({ ...by, behavior: 'instant' })
  }
}

// The scroll-margin or scroll-padding property at the scroller's start edge.
function side(horizontal: boolean, reversed: boolean, property: 'scrollMargin' | 'scrollPadding') {
  return `${property}${horizontal ? (reversed ? 'Right' : 'Left') : 'Top'}` as const
}

/** A computed length in pixels; a percentage (scroll-padding may be one) is of the visible area. */
export function lengthOf(value: string, of: number): number {
  const number = Number.parseFloat(value) || 0
  return value.endsWith('%') ? (number / 100) * of : number
}

// '#id' looks the id up as it is written first (an id may hold characters a CSS selector cannot); anything else, and an '#...'
// that names no id ('#intro h2'), is a CSS selector. One the browser cannot read finds nothing rather than throwing.
function find(selector: string) {
  if (selector.startsWith('#') && selector.length > 1) {
    const byId = document.getElementById(selector.slice(1))
    if (byId) return byId
  }
  try {
    return document.querySelector(selector)
  } catch {
    return null
  }
}
