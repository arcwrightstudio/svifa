// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Arcwright Studio

import { choose, SILENT } from './pick'
import type { Scroller } from './scroller'
import type { SvifaOptions } from './types'

/** The elements to draw between pixels: chosen by Svifa (`'auto'`), or as the subpixel option names them. */
export type Source = Exclude<SvifaOptions['subpixel'], boolean | undefined> | 'auto'
type Styled = Element & ElementCSSInlineStyle

// One element drawn between pixels, with what decides how far: the nearest element of the set it sits inside (it already moves with
// that one), the sticky element that may hold it (itself or one around it), and the element of the set that carries that sticky one.
type Part = { element: Styled; outer: Styled | null; sticky: Element | null; carrier: Styled | null }

/** What the layer asks of the Svifa it draws for. */
export interface Host {
  /** Whether a glide is under way (the elements are chosen again only at rest, unless a fixed element needs it at once). */
  gliding(): boolean
  /** The elements were chosen again: `boxes` are the scrolling boxes found inside (when Svifa chose). */
  chosen(boxes: HTMLElement[]): void
  /** A Svifa made for a box: it says nothing about a box with too much in it to draw between pixels. */
  quiet: boolean
}

// How close a glide drawn between pixels comes before it rests, in device pixels: a step this small changes a sharp edge by a few
// shades of grey, which no one can see.
const SETTLE = 0.02

// A sticky element counts as held when the browser draws it this close to its sticky offset, in CSS pixels. A held element reads
// within a few thousandths of a pixel of it; one still travelling is at least a step of layout away (1/64 px, 1/60 in Firefox).
const HELD = 0.01

// The classes Svifa itself puts on the scroller: a change of only these is no change to the page.
const OWN_CLASS = /^svifa(-|$)/

// Shared by every Svifa on the page: the will-change an element's own styles ask for, from before Svifa gave it a layer, and the layer
// that draws it (one only: a box inside a scroller is drawn by the box's own, never also by the scroller's).
const authored = new WeakMap<Element, string>()
const owners = new WeakMap<Element, Subpixel>()

// A length on each axis the layer draws, in the order of its scrollers.
type Shift = number[]

// A length across and a length down, in CSS pixels: what is drawn on an element.
type XY = [number, number]
const NONE: XY = [0, 0]

const still = (shift: readonly number[]) => shift.every((part) => part === 0)
const same = (a: readonly number[], b: readonly number[]) => a.length === b.length && a.every((part, i) => part === b[i])

// Whether a box may scroll one way and has nothing to scroll that way: the browser would show a scroll bar there for anything more.
const free = (overflow: string, room: number) => (overflow === 'auto' || overflow === 'overlay') && room < 1

// The classes of a class attribute that are not Svifa's own, in order.
const othersOf = (value: string | null) =>
  (value ?? '')
    .split(/\s+/)
    .filter((name) => name && !OWN_CLASS.test(name))
    .join(' ')

// Runs `work` once the page is idle (or soon, where it cannot tell).
const whenIdle = (work: () => void) => {
  if (typeof requestIdleCallback === 'function') {
    const handle = requestIdleCallback(work, { timeout: 1000 })
    return () => cancelIdleCallback(handle)
  }
  const handle = setTimeout(work, 200)
  return () => clearTimeout(handle)
}

/**
 * Draws the scrolled content at its exact position while it glides. The browser keeps the scroller on whole pixels (whole device
 * pixels in most browsers, whole CSS pixels in some), so after each move the part of a pixel it left over is drawn on the chosen
 * elements as a `translate`, which the GPU places between pixels. Each chosen element keeps a layer of its own (`will-change:
 * translate`) for as long as Svifa runs, so the GPU never has to make one in the middle of a glide. A glide ends on the browser's own
 * grid, so at rest nothing is moved. It draws along each axis Svifa moves (one, or both of the same element).
 */
export class Subpixel {
  private elements: Styled[] = [] // the chosen elements, each with its layer
  private set = new Set<Element>() // the same, to look up
  private known = false // chosen since the page last changed
  private behind = false // an element was added that no chosen one carries: choose again before the next move is drawn
  private enabled = true // layers on (off while the reader asks for reduced motion)
  private parts: Part[] | null = null
  private written = new Map<Styled, XY>() // the translate on each element now
  private own = new Map<Styled, string>() // an element's own inline translate, put back when Svifa is done with it
  private wills = new Map<Styled, string>() // an element's own inline will-change, put back when it no longer has a layer
  private shown = new Map<Styled, XY>() // how far each element is drawn from where the browser alone would put it
  private leftover: Shift
  private back: XY = NONE // the part of a pixel put back where the browser rounds this box's content (see backOf)
  private overflows: [string | null, string | null] = [null, null] // the box's own inline overflow-x and -y while Svifa holds them
  private warned = '' // the last word to the developer, said once
  private anchoring: string | null = null // the scroller's own inline overflow-anchor while Svifa holds it off
  private watch: MutationObserver | null = null // notices the page changing
  private cancel: (() => void) | null = null // a choice waiting for the page to be idle
  private scratch: CSSStyleDeclaration | null = null // reads an old style attribute
  private destroyed = false
  private readonly scroller: Scroller // the first axis: the element every axis shares

  constructor(
    private readonly source: Source,
    private readonly scrollers: Scroller[],
    private readonly host: Host
  ) {
    this.scroller = scrollers[0]
    this.leftover = scrollers.map(() => 0)
    this.schedule()
  }

  /** Whether anything is drawn between pixels: elements are chosen, and their layers are on. */
  get active(): boolean {
    return this.enabled && this.elements.length > 0
  }

  /** How close, in CSS pixels, a glide comes before it rests. */
  get settle(): number {
    return SETTLE / devicePixelRatio
  }

  /**
   * A glide is starting (`fresh`: from rest): the elements are chosen now if the page has changed since, and the browser's scroll
   * anchoring is held off until it ends (Firefox would take Svifa's own translate for the content moving and scroll back against it).
   */
  begin(fresh: boolean): void {
    if (fresh && !this.known) this.choose()
    if (fresh) this.parts = null
    if (this.anchoring === null && this.active) {
      const style = this.scroller.root.style
      this.anchoring = style.overflowAnchor
      style.overflowAnchor = 'none'
      this.forgetOwn()
    }
  }

  /**
   * After the browser has put the scroller where it draws the content at `drawn` for wanted `positions` (one of each per axis, in the
   * order of the scrollers), draws the rest of the way. Null: the browser stopped the scroller short at an edge, and nothing more is
   * drawn.
   */
  place(positions: number[], drawn: (number | null)[]): void {
    if (!this.active) return
    this.draw(
      positions.map((position, i) => {
        const at = drawn[i]
        const over = at === null || at === undefined ? 0 : at - position
        // the content is never moved toward its end (the scroller is put where it draws at or before the place), which would make the
        // page longer
        return over > -1e-6 ? 0 : over
      })
    )
  }

  /** The glide is over: every element goes back to where the browser puts it, and scroll anchoring is handed back. */
  clear(): void {
    this.draw(this.scrollers.map(() => 0))
    this.parts = null
    if (this.anchoring !== null) {
      this.scroller.root.style.overflowAnchor = this.anchoring
      this.anchoring = null
      this.forgetOwn()
    }
  }

  /** Runs `read` with nothing drawn between pixels, as the browser lays the page out at rest, and draws as before afterwards. */
  bare<T>(read: () => T): T {
    if (this.written.size === 0) return read()
    for (const element of this.written.keys()) element.style.translate = this.own.get(element) ?? ''
    try {
      return read()
    } finally {
      for (const [element, offset] of this.written) {
        element.style.translate = still(offset) ? (this.own.get(element) ?? '') : this.translate(offset)
      }
      this.forgetOwn()
    }
  }

  /**
   * Something around the scroller was drawn between pixels (the page around a box glided a frame, or came to rest): draws again what
   * the box's content needs to move with it.
   */
  follow(): void {
    if (this.active) this.draw(this.leftover)
  }

  /** The translate Svifa has written on an element of this layer, if any. */
  wrote(element: Element): XY | undefined {
    return this.written.get(element as Styled)
  }

  /** Turns the layers on or off (off while the reader asks for reduced motion, when nothing glides). */
  enable(on: boolean): void {
    if (this.enabled === on || this.destroyed) return
    this.enabled = on
    if (!on) this.clear()
    this.applyLayers()
  }

  /** Chooses again once the page is idle. */
  again(): void {
    this.known = false
    this.schedule()
  }

  /** Takes every layer away and stops watching the page. */
  destroy(): void {
    this.clear()
    this.destroyed = true
    this.cancel?.()
    this.cancel = null
    this.watch?.disconnect()
    this.watch = null
    this.elements = []
    this.set.clear()
    this.applyLayers()
  }

  /**
   * How far an element (through the nearest element of the set around it) is drawn from where the browser alone puts it, along the
   * horizontal or the vertical axis.
   */
  offsetOf(element: Element, horizontal: boolean): number {
    for (let node: Element | null = element; node; node = node.parentElement) {
      const shown = this.shown.get(node as Styled)
      if (shown !== undefined) return shown[horizontal ? 0 : 1]
    }
    return 0
  }

  // ---- choosing

  // Chooses again once the page is idle, and not while a glide is under way.
  private schedule() {
    if (this.cancel || this.destroyed) return
    this.cancel = whenIdle(() => {
      this.cancel = null
      if (this.destroyed) return
      if (this.host.gliding()) this.schedule()
      else this.choose()
    })
  }

  // Chooses the elements now, gives each its layer and takes the layer from any no longer chosen.
  private choose() {
    if (this.destroyed) return
    this.known = true
    this.behind = false
    this.cancel?.()
    this.cancel = null
    const root = this.scroller.root
    let found: Element[] = []
    let boxes: HTMLElement[] = []
    if (this.source === 'auto') {
      // the page as its author made it: without what Svifa draws between pixels, and with each element's own will-change
      const choice = this.bare(() => choose(root, this.scroller.isPage, (element) => authored.get(element)))
      found = choice.layers
      boxes = choice.boxes
      // a box Svifa took on by itself, and too much in it to give each a layer, is drawn on whole pixels without a word
      const quiet = this.host.quiet && choice.about === null
      if (choice.reason && !quiet) {
        this.say(
          `Svifa draws ${this.scroller.isPage ? 'the page' : 'this element'} on whole pixels: ${choice.reason}.`,
          choice.about ?? root
        )
      }
    } else {
      const source = this.source
      try {
        found = [...(typeof source === 'string' ? root.querySelectorAll(source) : typeof source === 'function' ? source() : source)]
      } catch (error) {
        this.say('Svifa: the subpixel option found no elements', error)
      }
    }
    // only what scrolls with this scroller: elements inside it, never the scroller itself, in document order so an element's outer one
    // is worked out first
    const elements = [...new Set(found)].filter(
      (element): element is Styled =>
        element !== root && root.contains(element) && 'style' in element && (owners.get(element) ?? this) === this
    )
    elements.sort((a, b) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1))
    const changed = elements.length !== this.elements.length || elements.some((element, i) => element !== this.elements[i])
    if (changed) {
      if (this.written.size > 0) this.draw(this.scrollers.map(() => 0))
      for (const element of this.own.keys()) if (!elements.includes(element)) this.own.delete(element)
      this.elements = elements
      this.set = new Set(elements)
      this.parts = null
      this.applyLayers()
    }
    this.observe()
    this.host.chosen(boxes)
  }

  // Gives each chosen element its layer while the layers are on, and puts back the will-change of any element that no longer has one.
  private applyLayers() {
    const keep = new Set<Styled>(this.enabled ? this.elements : [])
    for (const [element, value] of this.wills) {
      if (keep.has(element)) continue
      element.style.willChange = value
      this.wills.delete(element)
      authored.delete(element)
      owners.delete(element)
    }
    for (const element of keep) {
      if (this.wills.has(element)) continue
      const style = element.style
      const computed = getComputedStyle(element).willChange
      const names = !computed || computed === 'auto' ? [] : computed.split(',').map((name) => name.trim())
      this.wills.set(element, style.willChange)
      authored.set(element, computed)
      owners.set(element, this)
      // what the element's own styles ask for stays, with translate beside it
      if (!names.includes('translate')) style.willChange = [...names, 'translate'].join(', ')
    }
    this.forgetOwn()
  }

  // Says something to the developer, once until it changes.
  private say(message: string, about: unknown) {
    if (this.warned === message) return
    this.warned = message
    console.warn(message, about ?? '')
  }

  // ---- watching the page

  // Watches the page for changes that may change what is chosen: elements added or taken away, a class or style that changes, an
  // element marked data-svifa-subpixel.
  private observe() {
    if (this.watch || typeof MutationObserver !== 'function') return
    this.watch = new MutationObserver((records) => this.changed(records))
    this.watch.observe(this.scroller.root, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeOldValue: true,
      attributeFilter: ['class', 'style', 'data-svifa-subpixel'],
    })
  }

  // What Svifa itself just wrote (a translate, a layer, overflow-anchor) is no change to the page.
  private forgetOwn() {
    const records = this.watch?.takeRecords()
    if (!records?.length) return
    const ours = new Set<Element>([...this.wills.keys(), this.scroller.root])
    const others = records.filter((record) => !(record.attributeName === 'style' && ours.has(record.target as Element)))
    if (others.length) this.changed(others)
  }

  // The page changed. A fixed element inside a chosen one (it would be placed against the layer, not the window) is dealt with at
  // once, before the browser draws the page; an element added that no chosen one carries, before the next move of a glide is drawn
  // (it would be left behind on whole pixels); anything else once the page is idle, at rest.
  private changed(records: MutationRecord[]) {
    let changed = false
    let fixed = false
    let behind = false
    // a list given in the subpixel option is the developer's: only what it names is drawn, and its elements are looked up again
    const auto = this.source === 'auto'
    for (const record of records) {
      const target = record.target as Element
      if (record.type === 'childList') {
        for (const node of [...record.addedNodes, ...record.removedNodes]) {
          if (node.nodeType !== Node.ELEMENT_NODE || SILENT.has((node as Element).tagName)) continue
          changed = true
          if (!node.isConnected) continue
          const carried = this.inLayer(target)
          if (auto && !fixed && carried && this.fixedWithin(node as Element)) fixed = true
          if (!carried && (!auto || !this.placedAgainstWindow(node as Element))) behind = true
        }
        continue
      }
      if (record.attributeName === 'class') {
        if (othersOf(record.oldValue) === othersOf(target.getAttribute('class'))) continue
        changed = true
        if (auto && !fixed && (this.inLayer(target) || this.holdsLayer(target)) && this.fixedWithin(target)) fixed = true
        continue
      }
      if (record.attributeName === 'style') {
        // only position and z-index decide what is chosen: an animation that writes a transform every frame changes nothing
        const now = (target as Styled).style
        if (!now) continue
        this.scratch ??= document.createElement('div').style
        this.scratch.cssText = record.oldValue ?? ''
        if (this.scratch.position === now.position && this.scratch.zIndex === now.zIndex) continue
        changed = true
        if (auto && !fixed && now.position === 'fixed' && this.inLayer(target)) fixed = true
        continue
      }
      changed = true
    }
    if (fixed) this.choose()
    else if (changed) {
      this.known = false
      if (behind) this.behind = true
      this.schedule()
    }
  }

  // Whether an element is fixed, or inside a fixed one: it does not move with the content.
  private placedAgainstWindow(element: Element) {
    for (let node: Element | null = element; node && node !== this.scroller.root; node = node.parentElement) {
      if (getComputedStyle(node).position === 'fixed') return true
    }
    return false
  }

  // Whether an element is a chosen one or inside one.
  private inLayer(element: Element) {
    for (let node: Element | null = element; node; node = node.parentElement) if (this.set.has(node)) return true
    return false
  }

  // Whether an element holds a chosen one.
  private holdsLayer(element: Element) {
    return this.elements.some((chosen) => element.contains(chosen))
  }

  // Whether there is a fixed element in or under `element` that is a chosen one or inside one.
  private fixedWithin(element: Element) {
    const all = [element, ...element.querySelectorAll('*')]
    return all.some((node) => getComputedStyle(node).position === 'fixed' && this.inLayer(node))
  }

  // ---- drawing

  private draw(leftover: Shift) {
    leftover = leftover.map((part) => (Number.isFinite(part) ? part : 0))
    if (this.behind && !still(leftover)) this.choose()
    const back = this.active ? this.backOf() : NONE
    if (same(leftover, this.leftover) && same(back, this.back)) return
    this.leftover = leftover
    this.back = back
    this.holdOverflow(!still(back))

    const shown = new Map<Styled, XY>()
    const written = new Map<Styled, XY>()
    if (!still(leftover) || !still(back)) {
      const parts = this.lookUp()
      // every measurement before any change, so no change makes the browser work the page out again for the next measurement
      const shifts = new Map<Element, Shift>()
      for (const { sticky, carrier } of parts) {
        if (sticky && !shifts.has(sticky)) {
          shifts.set(
            sticky,
            this.scrollers.map((scroller, i) => this.stickyShift(sticky, carrier, leftover[i], scroller))
          )
        }
      }
      for (const { element, outer, sticky } of parts) {
        const own = this.across(sticky ? (shifts.get(sticky) ?? leftover) : leftover)
        const at: XY = [own[0] + back[0], own[1] + back[1]]
        const around = outer ? shown.get(outer) : undefined
        shown.set(element, at)
        written.set(element, around ? [at[0] - around[0], at[1] - around[1]] : at)
      }
    }

    for (const [element, offset] of written) {
      const before = this.written.get(element)
      if (before ? same(before, offset) : still(offset)) continue
      if (!this.own.has(element)) this.own.set(element, element.style.translate)
      element.style.translate = still(offset) ? (this.own.get(element) ?? '') : this.translate(offset)
    }
    for (const element of this.written.keys()) {
      if (written.has(element) || !this.own.has(element)) continue
      element.style.translate = this.own.get(element) ?? ''
      this.own.delete(element)
    }
    this.written = written
    this.shown = shown
    this.forgetOwn()
  }

  // A shift along the layer's axes (one per scroller) as a length across and a length down.
  private across(shift: Shift): XY {
    const xy: XY = [0, 0]
    this.scrollers.forEach((scroller, i) => {
      xy[scroller.horizontal ? 0 : 1] = shift[i]
    })
    return xy
  }

  // The translate for a length across and a length down.
  private translate([x, y]: XY) {
    return `${x ? `${x}px` : '0'} ${y ? `${y}px` : '0'}`
  }

  // While what is put back moves a box's content, an axis on which the box has nothing to scroll is held at overflow: hidden: moved
  // by part of a pixel toward the box's end, its content would be that much larger than the box, and the box would show a scroll
  // bar for it. With nothing to scroll that way there is no scroll bar to hide, so nothing changes on screen; at rest it is put back.
  private holdOverflow(hold: boolean) {
    const root = this.scroller.root
    const style = root.style
    if (!hold) {
      if (this.overflows[0] !== null) style.overflowX = this.overflows[0]
      if (this.overflows[1] !== null) style.overflowY = this.overflows[1]
      if (this.overflows[0] !== null || this.overflows[1] !== null) this.forgetOwn()
      this.overflows = [null, null]
      return
    }
    if (this.overflows[0] !== null || this.overflows[1] !== null) return
    const computed = getComputedStyle(root)
    if (free(computed.overflowX, root.scrollWidth - root.clientWidth)) {
      this.overflows[0] = style.overflowX
      style.overflowX = 'hidden'
    }
    if (free(computed.overflowY, root.scrollHeight - root.clientHeight)) {
      this.overflows[1] = style.overflowY
      style.overflowY = 'hidden'
    }
    this.forgetOwn()
  }

  // The part of a pixel to put back on a box's content while what holds the box is drawn between pixels. The browser draws a box
  // that scrolls on a layer of its own (as one with layers inside always is) where it rests, and moves its content by whatever the
  // page around it is moved by rounded to a whole pixel: the content would stand still while the page glides, then hop. Put back, it
  // moves with the page exactly.
  private backOf(): XY {
    if (this.scroller.isPage) return NONE
    // what Svifa draws on the box and the elements around it
    let x = 0
    let y = 0
    for (let node: Element | null = this.scroller.root; node; node = node.parentElement) {
      const drawn = owners.get(node)?.wrote(node)
      if (drawn) {
        x += drawn[0]
        y += drawn[1]
      }
    }
    if (x === 0 && y === 0) return NONE
    // in device pixels, rounded half away from zero, as the browser rounds it
    const per = devicePixelRatio || 1
    const left = (moved: number) => {
      const at = moved * per
      return (at - Math.sign(at) * Math.round(Math.abs(at))) / per
    }
    return [left(x), left(y)]
  }

  /**
   * Warns, once, about sticky elements inside elements the subpixel option lists that are not listed themselves: they move with the
   * element around them by up to half a pixel while they should be held still. (Elements Svifa chooses itself include them.)
   */
  checkSticky(): void {
    if (this.source === 'auto') return
    if (!this.known) this.choose()
    const parts = this.lookUp()
    const listed = new Set<Element>(parts.map((part) => part.element))
    const missed = new Set<Element>()
    for (const { element } of parts) {
      const walker = document.createTreeWalker(element, NodeFilter.SHOW_ELEMENT)
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        const child = node as Element
        if (!listed.has(child) && getComputedStyle(child).position === 'sticky') missed.add(child)
      }
    }
    if (missed.size > 0) {
      this.say(
        'Svifa: these sticky elements sit inside elements listed in the subpixel option but are not listed themselves, so they move by up to half a pixel while held. List them too.',
        [...missed]
      )
    }
  }

  // How far a sticky element (and all it holds) is drawn from where the browser alone puts it: the leftover while it travels with the
  // content, nothing while it is held at its sticky offset, and as it reaches that offset, only the way to it.
  private stickyShift(sticky: Element, carrier: Styled | null, leftover: number, scroller: Scroller) {
    const horizontal = scroller.horizontal
    const style = getComputedStyle(sticky)
    const near = Number.parseFloat(horizontal ? style.left : style.top)
    const far = Number.parseFloat(horizontal ? style.right : style.bottom)
    if (Number.isNaN(near) && Number.isNaN(far)) return leftover

    const box = sticky.getBoundingClientRect()
    const carried = carrier ? (this.shown.get(carrier)?.[horizontal ? 0 : 1] ?? 0) : 0
    const edge = scroller.edge
    // where the browser alone draws it (without what the set drew last frame), from the start and from the end of the visible area
    const fromStart = (horizontal ? box.left : box.top) - carried - edge
    const fromEnd = edge + scroller.viewport - ((horizontal ? box.right : box.bottom) - carried)

    if (!Number.isNaN(near)) {
      if (Math.abs(fromStart - near) < HELD) return 0
      if (fromStart > near) return Math.max(near - fromStart, leftover)
    }
    if (!Number.isNaN(far)) {
      if (Math.abs(fromEnd - far) < HELD) return 0
      if (fromEnd > far) return Math.min(fromEnd - far, leftover)
    }
    return leftover
  }

  // The chosen elements, each with the elements that decide how far it is drawn, in document order so an element's outer one is
  // worked out first.
  private lookUp() {
    if (this.parts?.every((part) => part.element.isConnected)) return this.parts
    const root = this.scroller.root
    const elements = this.elements.filter((element) => element.isConnected)
    const set = new Set<Element>(elements)
    const nearest = (from: Element | null, test: (element: Element) => boolean) => {
      for (let node = from; node && node !== root; node = node.parentElement) if (test(node)) return node
      return null
    }
    this.parts = elements.map((element) => {
      const sticky = nearest(element, (node) => getComputedStyle(node).position === 'sticky')
      return {
        element,
        outer: nearest(element.parentElement, (node) => set.has(node)) as Styled | null,
        sticky,
        carrier: nearest(sticky, (node) => set.has(node)) as Styled | null,
      }
    })
    return this.parts
  }
}
