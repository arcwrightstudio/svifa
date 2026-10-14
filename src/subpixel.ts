import type { Scroller } from './scroller'
import type { SvifaOptions } from './types'

type Source = NonNullable<SvifaOptions['subpixel']>
type Styled = Element & ElementCSSInlineStyle

// One element drawn between pixels, with what decides how far: the nearest element of the set it sits inside (it already moves with
// that one), the sticky element that may hold it (itself or one around it), and the element of the set that carries that sticky one.
type Part = { element: Styled; outer: Styled | null; sticky: Element | null; carrier: Styled | null }

// How close a glide drawn between pixels comes before it rests, in device pixels: a step this small changes a sharp edge by a few
// shades of grey, which no one can see.
const SETTLE = 0.02

// A sticky element counts as held when the browser draws it this close to its sticky offset, in CSS pixels. A held element reads
// within a few thousandths of a pixel of it; one still travelling is at least a step of layout away (1/64 px, 1/60 in Firefox).
const HELD = 0.01

/**
 * Draws the scrolled content at its exact position while it glides. The browser keeps the scroller on whole pixels (whole device
 * pixels in most browsers, whole CSS pixels in some), so after each move the part of a pixel it left over is drawn on the chosen
 * elements as a `translate`, which the GPU places between pixels. A glide ends on the browser's own grid, so at rest nothing is moved.
 */
export class Subpixel {
  private parts: Part[] | null = null
  private written = new Map<Styled, number>() // the translate on each element now
  private own = new Map<Styled, string>() // an element's own inline translate, put back when Svifa is done with it
  private shown = new Map<Styled, number>() // how far each element is drawn from where the browser alone would put it
  private leftover = 0
  private warned = false
  private anchoring: string | null = null // the scroller's own inline overflow-anchor while Svifa holds it off
  private watch: MutationObserver | null = null // notices elements added while the content glides

  constructor(
    private readonly source: Source,
    private readonly scroller: Scroller
  ) {}

  /**
   * A glide is starting (`fresh`: from rest, so the elements are looked up afresh), and the browser's scroll anchoring is held off
   * until it ends (Firefox would take Svifa's own translate for the content moving and scroll back against it).
   */
  begin(fresh: boolean): void {
    if (fresh) this.parts = null
    if (this.anchoring === null) {
      const style = this.scroller.root.style
      this.anchoring = style.overflowAnchor
      style.overflowAnchor = 'none'
    }
    // an element added while the content glides (streamed in, appended to a list) may be one of the set: look again next frame
    if (!this.watch && typeof MutationObserver === 'function') {
      this.watch = new MutationObserver((records) => {
        for (const record of records) {
          for (let i = 0; i < record.addedNodes.length; i++) {
            if (record.addedNodes[i].nodeType === Node.ELEMENT_NODE) {
              this.parts = null
              return
            }
          }
        }
      })
      this.watch.observe(this.scroller.root, { childList: true, subtree: true })
    }
  }

  /** After the browser has put the scroller at `actual` for a wanted `position`, draws the rest of the way. */
  place(position: number, actual: number): void {
    const over = actual - position
    const size = Math.abs(over)
    // a grid never leaves a whole pixel over: that much means the browser stopped short at an edge, and nothing more is drawn
    this.draw(size < 1e-6 || size >= 1 ? 0 : over)
  }

  /** The glide is over: every element goes back to where the browser puts it, and scroll anchoring is handed back. */
  clear(): void {
    this.draw(0)
    this.parts = null
    this.watch?.disconnect()
    this.watch = null
    if (this.anchoring !== null) {
      this.scroller.root.style.overflowAnchor = this.anchoring
      this.anchoring = null
    }
  }

  /** How close, in CSS pixels, a glide comes before it rests. */
  get settle(): number {
    return SETTLE / devicePixelRatio
  }

  /** How far an element (through the nearest element of the set around it) is drawn from where the browser alone puts it. */
  offsetOf(element: Element): number {
    for (let node: Element | null = element; node; node = node.parentElement) {
      const shown = this.shown.get(node as Styled)
      if (shown !== undefined) return shown
    }
    return 0
  }

  private draw(leftover: number) {
    if (!Number.isFinite(leftover)) leftover = 0
    if (leftover === this.leftover) return
    this.leftover = leftover

    const shown = new Map<Styled, number>()
    const written = new Map<Styled, number>()
    if (leftover !== 0) {
      const parts = this.lookUp()
      // every measurement before any change, so no change makes the browser work the page out again for the next measurement
      const shifts = new Map<Element, number>()
      for (const { sticky, carrier } of parts) {
        if (sticky && !shifts.has(sticky)) shifts.set(sticky, this.stickyShift(sticky, carrier, leftover))
      }
      for (const { element, outer, sticky } of parts) {
        const offset = sticky ? (shifts.get(sticky) ?? leftover) : leftover
        shown.set(element, offset)
        written.set(element, offset - (outer ? (shown.get(outer) ?? 0) : 0))
      }
    }

    for (const [element, offset] of written) {
      if ((this.written.get(element) ?? 0) === offset) continue
      if (!this.own.has(element)) this.own.set(element, element.style.translate)
      element.style.translate = offset === 0 ? (this.own.get(element) ?? '') : this.translate(offset)
    }
    for (const element of this.written.keys()) {
      if (written.has(element) || !this.own.has(element)) continue
      element.style.translate = this.own.get(element) ?? ''
      this.own.delete(element)
    }
    this.written = written
    this.shown = shown
  }

  private translate(offset: number) {
    return this.scroller.horizontal ? `${offset}px 0` : `0 ${offset}px`
  }

  /**
   * Warns, once, about sticky elements inside listed elements that are not listed themselves: they move with the element around them
   * by up to half a pixel while they should be held still.
   */
  checkSticky(): void {
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
      console.warn(
        'Svifa: these sticky elements sit inside elements listed in the subpixel option but are not listed themselves, so they move by up to half a pixel while held. List them too, with will-change: translate.',
        [...missed]
      )
    }
  }

  // How far a sticky element (and all it holds) is drawn from where the browser alone puts it: the leftover while it travels with the
  // content, nothing while it is held at its sticky offset, and as it reaches that offset, only the way to it.
  private stickyShift(sticky: Element, carrier: Styled | null, leftover: number) {
    const horizontal = this.scroller.horizontal
    const style = getComputedStyle(sticky)
    const near = Number.parseFloat(horizontal ? style.left : style.top)
    const far = Number.parseFloat(horizontal ? style.right : style.bottom)
    if (Number.isNaN(near) && Number.isNaN(far)) return leftover

    const box = sticky.getBoundingClientRect()
    const carried = carrier ? (this.shown.get(carrier) ?? 0) : 0
    const edge = this.scroller.edge
    // where the browser alone draws it (without what the set drew last frame), from the start and from the end of the visible area
    const fromStart = (horizontal ? box.left : box.top) - carried - edge
    const fromEnd = edge + this.scroller.viewport - ((horizontal ? box.right : box.bottom) - carried)

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

  // The elements, in document order so an element's outer one is worked out first.
  private lookUp() {
    if (this.parts?.every((part) => part.element.isConnected)) return this.parts
    const source = this.source
    const root = this.scroller.root
    let found: Iterable<Element> = []
    try {
      found = typeof source === 'string' ? root.querySelectorAll(source) : typeof source === 'function' ? source() : source
    } catch (error) {
      if (!this.warned) console.warn('Svifa: the subpixel option found no elements', error)
      this.warned = true
    }
    // only what scrolls with this scroller: elements inside it, never the scroller itself
    const elements = [...new Set(found)].filter(
      (element): element is Styled => element !== root && root.contains(element) && 'style' in element
    )
    elements.sort((a, b) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1))
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
