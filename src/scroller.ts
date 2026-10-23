// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Arcwright Studio

import type { Axis } from './types'

// Whether this browser takes behavior: 'instant' (it moves the scroller at once whatever the page's scroll-behavior says). Asked once.
let instantKnown: boolean | undefined

const SCROLLS = ['auto', 'scroll', 'overlay']

/**
 * The finest grid a browser keeps a scroll position on, in places per CSS pixel: device pixels. Zoomed out, a device pixel spans
 * more than one CSS pixel, and Chrome keeps the scroller on those (at 80%, every 1.25 CSS pixels); a browser that keeps whole CSS
 * pixels instead is learned from where it puts the scroller (see Scroller.moveTo).
 */
export const placesPerPixel = (): number => devicePixelRatio || 1

/**
 * The thing that scrolls, read and moved along one axis: the page or a scrolling element. Everything Svifa asks of it goes through
 * here, so nothing else has to tell the two apart.
 */
export class Scroller {
  /** True for the page (the window), false for a scrolling element. */
  readonly isPage: boolean
  /** The element that holds the scrolled content and carries Svifa's classes: <html> for the page. */
  readonly root: HTMLElement
  /** Where the browser sends this scroller's scroll and scrollend events. */
  readonly events: Window | HTMLElement
  readonly horizontal: boolean
  /** A horizontal scroller in right-to-left content: the browser counts its position from 0 down to minus the limit. */
  readonly reversed: boolean
  private max = 0
  // the browser keeps the scroller on whole CSS pixels rather than device pixels (learned from where it puts it)
  private coarse = false
  // the page's own inline scroll-behavior, put back on destroy when an old browser needed it overridden
  private restoreBehavior: string | null = null
  // the scroller's own inline scrollbar-gutter while Svifa holds a scrollbar's room (see holdGutter)
  private gutter: string | null = null
  // while Svifa holds snapping off for a glide: the scroller's own inline scroll-snap-type, and the snapping it held off
  private ownSnap: string | null = null
  private heldSnap = ''
  /** The last move was held short of the place written: the scroller cannot go that far (its end is nearer than measured). */
  short = false

  constructor(scroller: Window | Element | undefined, axis: Axis) {
    const horizontal = axis === 'horizontal'
    const page =
      !scroller ||
      scroller === window ||
      scroller === document.documentElement ||
      (scroller === document.body && !bodyScrolls(horizontal))
    this.isPage = page
    this.root = page ? document.documentElement : (scroller as HTMLElement)
    this.events = page ? window : this.root
    this.horizontal = horizontal
    this.reversed = horizontal && getComputedStyle(this.root).direction === 'rtl'
    this.measure()
  }

  /** Where the browser has the scroller now, from 0 at the start. Most browsers keep this on whole device pixels. */
  get position(): number {
    const raw = this.isPage
      ? this.horizontal
        ? window.scrollX
        : window.scrollY
      : this.horizontal
        ? this.root.scrollLeft
        : this.root.scrollTop
    return this.reversed ? -raw : raw
  }

  /** The furthest it can scroll, as last measured. */
  get limit(): number {
    return this.max
  }

  /** Measures again how far it can scroll. Cheap unless the page's layout has just changed. */
  measure(): number {
    const root = this.root
    const size = this.horizontal ? root.scrollWidth - root.clientWidth : root.scrollHeight - root.clientHeight
    this.max = Math.max(0, size)
    return this.max
  }

  /**
   * The place on the browser's grid nearest `position`, never past the end: the grid is device pixels, or whole CSS pixels in a
   * browser that keeps those.
   */
  restingPlace(position: number): number {
    const per = this.coarse ? 1 : placesPerPixel()
    const place = Math.round(position * per) / per
    return place > this.max ? Math.floor(this.max * per) / per : place
  }

  /**
   * The place on the browser's grid at or before `position` (within rounding), never past the end, where the browser draws the
   * content at or before `drawn`: the content drawn between pixels from there is moved toward the start, never past its own end.
   * Moved the other way, it would make the page that much longer, and the browser would let the scroller go further than the page
   * reaches at rest.
   */
  placeBefore(position: number, drawn: number = position): number {
    const per = this.coarse ? 1 : placesPerPixel()
    let place = Math.min(Math.floor(position * per + 1e-6) / per, Math.floor(this.max * per) / per)
    // zoomed to a part of a pixel a whole CSS pixel is drawn up to half a device pixel either way; a few steps back are enough down to
    // a quarter of a device pixel per CSS pixel
    for (let step = 0; step < 4 && place > 0 && this.drawnAt(place) > drawn + 1e-6; step++) place -= 1 / per
    return place
  }

  /**
   * Where the browser draws the content with the scroller at `place`: browsers draw a scroll position on whole device pixels, so
   * zoomed to a part of a pixel (125%, 80%) a whole CSS pixel is drawn up to half a device pixel off it. Worked out as Chrome does,
   * in single precision and rounded half away from 0: at 90%, 305 pixels make 274.5 device pixels, not the 274.49999 of a double.
   */
  drawnAt(place: number): number {
    const per = devicePixelRatio || 1
    return Math.round(Math.fround(place * per)) / per
  }

  /**
   * Puts the scroller at once (with no animation of the browser's own) on the place of its grid nearest `position`, or at or before it
   * (`before`, when the rest is drawn between pixels, with the content drawn at or before `drawn`): written that way, a browser that
   * cuts a position down (WebKit) lands where one that rounds it would. Returns true when this move showed that the browser keeps
   * whole CSS pixels, so a glide aimed at a device pixel must be aimed again.
   */
  moveTo(position: number, before = false, drawn: number = position): boolean {
    const placeOf = (at: number) => (before ? this.placeBefore(at, drawn) : this.restingPlace(at))
    let place = placeOf(Math.max(position, 0))
    this.write(place)
    // A browser on the device grid keeps the place as written (read back as a float32 in some, so its rounding is allowed for). One
    // that moves it by less than a pixel keeps whole CSS pixels; a pixel or more is the browser holding the scroller at an end that
    // has moved. A place moved past is always the grid, since an end only ever holds the scroller short; held short within a pixel
    // of either end, the grid and the end look alike, and one pixel further tells them apart (goesOn).
    let learned = false
    if (!this.coarse) {
      const actual = this.position
      const off = Math.abs(actual - place)
      const grid = off > slop(place) && off < 1
      if (grid && (actual > place || (actual > 0 && actual < this.max - 1) || this.goesOn(actual, place))) {
        this.coarse = learned = true
        // this once, written again on the grid just learned, so the move still lands on its place
        place = placeOf(Math.max(position, 0))
        this.write(place)
      }
    }
    this.short = this.position < place - slop(place)
    return learned
  }

  // Within a pixel of either end, a place cut down to the whole CSS pixel below it looks just like the scroller held at an end. It
  // goes one pixel further only if there is room to; if it does not, it is put back where it was.
  private goesOn(actual: number, place: number): boolean {
    if (actual !== Math.floor(place) || actual + 1 > this.measure()) return false
    this.write(actual + 1)
    if (this.position >= actual + 1 - slop(actual + 1)) return true
    this.write(place)
    return false
  }

  /** Puts the scroller at `place` at once, as written: no grid, no learning (see moveTo for a glide's moves). */
  put(place: number): void {
    this.write(place)
  }

  /** Runs `read` with the page's own snapping in place, also while Svifa holds it off for a glide, and returns what it returns. */
  withSnap<T>(read: () => T): T {
    if (this.ownSnap === null) return read()
    const style = this.root.style
    style.scrollSnapType = this.ownSnap
    try {
      return read()
    } finally {
      style.scrollSnapType = 'none'
    }
  }

  private write(place: number) {
    const target = this.isPage ? window : this.root
    const to = this.reversed ? -place : place
    const at = this.horizontal ? { left: to } : { top: to }
    if (instantKnown !== false) {
      try {
        target.scrollTo({ ...at, behavior: 'instant' })
        instantKnown = true
        return
      } catch {
        // an older browser that does not know 'instant': fall back below for good
        instantKnown = false
      }
    }
    if (this.restoreBehavior === null) {
      this.restoreBehavior = this.root.style.scrollBehavior
      this.root.style.scrollBehavior = 'auto'
    }
    target.scrollTo(at)
  }

  /** Whether scrolling is switched off on it (`overflow: hidden` or `clip`, as a dialog's scroll lock does). */
  get frozen(): boolean {
    const property = this.horizontal ? 'overflowX' : 'overflowY'
    const own = getComputedStyle(this.root)[property]
    if (own === 'hidden' || own === 'clip') return true
    // the page takes the body's overflow when <html> leaves its own visible
    if (this.isPage && own === 'visible' && document.body) {
      const body = getComputedStyle(document.body)[property]
      return body === 'hidden' || body === 'clip'
    }
    return false
  }

  /** Whether the scroller snaps (`scroll-snap-type`): the browser would put every one of Svifa's moves back on a snap point. */
  get snaps(): boolean {
    const type = this.snapType
    return Boolean(type) && type !== 'none'
  }

  /** The scroller's `scroll-snap-type`: the one in its styles, also while Svifa holds it off for a glide. */
  get snapType(): string {
    return this.ownSnap === null ? getComputedStyle(this.root).scrollSnapType : this.heldSnap
  }

  /**
   * Holds the browser's snapping off while Svifa glides (each frame's position would be put on a snap point) and puts it back when it
   * rests, on the snap point the glide was aimed at; false puts it back.
   */
  holdSnap(hold: boolean): void {
    const style = this.root.style
    if (hold && this.ownSnap === null) {
      this.heldSnap = getComputedStyle(this.root).scrollSnapType
      this.ownSnap = style.scrollSnapType
      style.scrollSnapType = 'none'
    } else if (!hold && this.ownSnap !== null) {
      style.scrollSnapType = this.ownSnap
      this.ownSnap = null
    }
  }

  /** Where the scroller's visible area begins on the screen, along its axis (its right edge in right-to-left content). */
  get edge(): number {
    if (this.isPage) return this.reversed ? document.documentElement.clientWidth : 0
    const box = this.root.getBoundingClientRect()
    if (!this.horizontal) return box.top + this.root.clientTop
    return this.reversed ? box.left + this.root.clientLeft + this.root.clientWidth : box.left + this.root.clientLeft
  }

  /** The length of the scroller's visible area along its axis. */
  get viewport(): number {
    return this.horizontal ? this.root.clientWidth : this.root.clientHeight
  }

  /**
   * While stopped, svifa.css hides the scroller's overflow, and a scrollbar that takes room (Windows) would go, moving the content
   * sideways by its width. Keeps that room (scrollbar-gutter) while held; false gives it back.
   */
  holdGutter(hold: boolean): void {
    const style = this.root.style
    if (hold && this.gutter === null) {
      const room = this.isPage
        ? window.innerWidth - document.documentElement.clientWidth
        : this.root.offsetWidth - this.root.clientWidth - borders(this.root)
      if (room <= 0) return
      this.gutter = style.scrollbarGutter
      style.scrollbarGutter = 'stable'
    } else if (!hold && this.gutter !== null) {
      style.scrollbarGutter = this.gutter
      this.gutter = null
    }
  }

  destroy(): void {
    if (this.restoreBehavior !== null) this.root.style.scrollBehavior = this.restoreBehavior
    this.holdGutter(false)
    this.holdSnap(false)
  }
}

// <body> is a scroller of its own only when both it and <html> have overflow other than visible (otherwise its overflow goes to the
// page), which is how a layout with `html, body { height: 100% }` and a scrolling body works.
function bodyScrolls(horizontal: boolean) {
  const property = horizontal ? 'overflowX' : 'overflowY'
  if (document.scrollingElement === document.body) return false
  return (
    getComputedStyle(document.documentElement)[property] !== 'visible' &&
    SCROLLS.includes(getComputedStyle(document.body)[property])
  )
}

// How far a position read back can differ from the one written by the browser's own rounding (a float32 in some browsers).
function slop(place: number) {
  return Math.abs(place) * 2 ** -23 + 1e-3
}

function borders(element: Element) {
  const style = getComputedStyle(element)
  return (Number.parseFloat(style.borderLeftWidth) || 0) + (Number.parseFloat(style.borderRightWidth) || 0)
}
