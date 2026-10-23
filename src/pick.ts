// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Arcwright Studio

// The elements Svifa draws between pixels when it chooses them itself: the blocks that scroll with the scroller, split around anything
// a layer of their own would change. A layer (will-change: translate) lets the GPU draw an element between pixels; it also makes the
// element a stacking context (what is inside is drawn with it, at the level of positioned elements) and the containing block of
// fixed elements inside it. A block is given one only where its styles show that neither changes what the page looks like.

type Styled = Element & ElementCSSInlineStyle

/** What was chosen. */
export interface Choice {
  /** The elements to draw between pixels, in document order: the blocks, and the sticky elements inside them. */
  layers: Styled[]
  /** Why nothing was chosen, for the developer: empty when something was, or when there was nothing to choose. */
  reason: string
  /** The element the reason is about. */
  about: Element | null
  /** The scrolling boxes inside, which glide on their own and are drawn with what holds them. */
  boxes: HTMLElement[]
}

// More than this many layers, and the page is drawn on whole pixels: each layer is memory on the GPU.
const MOST = 200

/** Elements that draw nothing. */
export const SILENT: ReadonlySet<string> = new Set(['SCRIPT', 'STYLE', 'LINK', 'META', 'TEMPLATE', 'NOSCRIPT', 'BASE', 'TITLE'])

// Form controls and editable text scroll the browser's own way: they are never boxes that glide.
const EDITABLE = new Set(['TEXTAREA', 'SELECT', 'INPUT'])

const SCROLLING = new Set(['auto', 'scroll', 'overlay'])

const none = (value: string | undefined) => !value || value === 'none'

// Whether a will-change value names any of these.
const willChange = (value: string, names: readonly string[]) =>
  Boolean(value) && value !== 'auto' && value.split(',').some((name) => names.includes(name.trim()))

const MOVES = ['transform', 'translate', 'rotate', 'scale', 'perspective', 'filter', 'backdrop-filter']
const STACKS = [...MOVES, 'opacity', 'clip-path', 'mask', 'isolation', 'mix-blend-mode']

/**
 * Whether an element is the containing block of fixed elements inside it (they are placed against it, not the window). `will` is its
 * will-change as its own styles give it.
 */
function holdsFixed(style: CSSStyleDeclaration, will: string): boolean {
  return (
    !none(style.transform) ||
    !none(style.translate) ||
    !none(style.rotate) ||
    !none(style.scale) ||
    !none(style.perspective) ||
    !none(style.filter) ||
    !none(style.backdropFilter) ||
    /\b(paint|layout|strict|content)\b/.test(style.contain || '') ||
    willChange(will, MOVES)
  )
}

// Whether z-index applies to an element: a positioned one, or the item of a flex or grid container.
const zApplies = (style: CSSStyleDeclaration, around: CSSStyleDeclaration | null) =>
  style.position !== 'static' || (around !== null && /flex|grid/.test(around.display))

// An element's z-index as a number, or null when it has none (auto, or one that does not apply).
const zOf = (style: CSSStyleDeclaration, around: CSSStyleDeclaration | null) =>
  style.zIndex !== 'auto' && zApplies(style, around) ? Number.parseInt(style.zIndex, 10) || 0 : null

// Whether an element is already a stacking context, drawn at the level a layer would draw it.
function stacks(style: CSSStyleDeclaration, around: CSSStyleDeclaration | null, will: string) {
  const position = style.position
  return (
    position === 'fixed' ||
    position === 'sticky' ||
    zOf(style, around) !== null ||
    Number(style.opacity) < 1 ||
    holdsFixed(style, will) ||
    !none(style.clipPath) ||
    !none(style.maskImage) ||
    (Boolean(style.mixBlendMode) && style.mixBlendMode !== 'normal') ||
    style.isolation === 'isolate' ||
    willChange(will, STACKS)
  )
}

const off = (element: Element) => element.getAttribute('data-svifa-subpixel') === 'off'

// Whether an element clips what it holds on both axes.
const clips = (style: CSSStyleDeclaration) => style.overflowX !== 'visible' && style.overflowY !== 'visible'

// Whether an element is a box that scrolls on its own.
const scrolls = (style: CSSStyleDeclaration) => SCROLLING.has(style.overflowY) || SCROLLING.has(style.overflowX)

/**
 * Chooses the elements to draw between pixels inside `root` (the scrolled content: `<body>` for the page). Returns no layers, with a
 * reason, when a layer would change what is drawn over what and that cannot be split around. `authored` gives the will-change an
 * element's own styles ask for, where Svifa has given it a layer.
 */
export function choose(root: HTMLElement, page: boolean, authored: (element: Element) => string | undefined): Choice {
  const styles = new Map<Element, CSSStyleDeclaration>()
  const styleOf = (element: Element) => {
    let style = styles.get(element)
    if (!style) styles.set(element, (style = getComputedStyle(element)))
    return style
  }
  const willOf = (element: Element) => authored(element) ?? styleOf(element).willChange
  const content = page ? document.body : root
  const boxes: HTMLElement[] = []
  const result = (layers: Styled[], reason = '', about: Element | null = null): Choice => ({ layers, reason, about, boxes })
  if (!content || off(document.documentElement) || off(content) || (!page && off(root))) return result([])

  // a fixed element inside, placed against the window: a layer around it would carry it away with the content
  const loose = new Map<Element, boolean>()
  const fixedOut = (element: Element): boolean => {
    let known = loose.get(element)
    if (known !== undefined) return known
    const style = styleOf(element)
    known = style.position === 'fixed' || (!holdsFixed(style, willOf(element)) && [...element.children].some(fixedOut))
    loose.set(element, known)
    return known
  }

  // Whether a layer on `block` would change what is drawn over what: something inside it drawn among the content around it (not
  // inside a stacking context of its own within the block) that a layer would hold inside, where it reaches past the block, or has a
  // z-index below 0 (drawn under the content around it now, over the block's own background once held), or a z-index above 0 and no
  // box (hidden now, it may appear anywhere, as a menu does).
  const changesAround = (block: Element, style: CSSStyleDeclaration) => {
    const edge = block.getBoundingClientRect()
    const clipsX = style.overflowX !== 'visible'
    const clipsY = style.overflowY !== 'visible'
    const outside = (box: DOMRect) =>
      (!clipsX && (box.left < edge.left - 0.5 || box.right > edge.right + 0.5)) ||
      (!clipsY && (box.top < edge.top - 0.5 || box.bottom > edge.bottom + 0.5))
    // inside an element that clips what it holds on both axes (a scrolling box), nothing reaches past the block that it does not
    const visit = (parent: Element, clipped: boolean): boolean => {
      const around = styleOf(parent)
      for (const child of parent.children) {
        const own = styleOf(child)
        const stacked = stacks(own, around, willOf(child))
        if (stacked || own.position !== 'static') {
          const z = zOf(own, around)
          if (z !== null && z < 0) return true
          // held inside a clip, it shows nowhere past the block
          const box = clipped ? null : child.getBoundingClientRect()
          if (box && box.width === 0 && box.height === 0) {
            if (z !== null && z > 0) return true
          } else if (box && outside(box)) return true
        }
        if (!stacked && visit(child, clipped || clips(own))) return true
      }
      return false
    }
    return visit(block, false)
  }

  // Drawn at the level a layer is drawn at, among the content: a fixed or sticky element with no z-index (or 0), and an absolutely
  // positioned one with no z-index where it is placed. A block that comes after one and is drawn in the flow until now would be drawn
  // over it once it had a layer, so it may not have one.
  const over: { element: Element; kind: 'fixed' | 'sticky' | 'absolute'; box: DOMRect | null }[] = []
  const coveredBy = (block: Element) => {
    let box: DOMRect | null = null
    for (const item of over) {
      if (item.kind === 'fixed') return item
      if (item.kind === 'sticky' && item.element.parentElement?.contains(block)) return item
      if (item.kind === 'absolute' && item.box) {
        box ??= block.getBoundingClientRect()
        const a = item.box
        if (a.left < box.right && box.left < a.right && a.top < box.bottom && box.top < a.bottom) return item
      }
    }
    return null
  }

  const layers: Styled[] = []
  let blocked: { element: Element; kind: string } | null = null
  const consider = (element: Element, around: CSSStyleDeclaration | null) => {
    if (blocked || SILENT.has(element.tagName) || !('style' in element) || off(element)) return
    const style = styleOf(element)
    if (style.display === 'contents') {
      for (const child of element.children) consider(child, around)
      return
    }
    const position = style.position
    const z = zOf(style, around)
    const level = z === null || z === 0
    if (position === 'fixed') {
      if (level) over.push({ element, kind: 'fixed', box: null })
      return
    }
    const stacked = stacks(style, around, willOf(element))
    const split =
      fixedOut(element) ||
      element.querySelector('[data-svifa-subpixel="off"]') !== null ||
      (!stacked && changesAround(element, style))
    if (split) {
      // a scrolling box is never split: what it holds glides with it, and it has a Svifa of its own that draws it
      if (scrolls(style)) return
      for (const child of element.children) consider(child, style)
      return
    }
    // a block drawn in the flow until now is drawn, as a layer, at the level of positioned elements: over any that came before it
    if (position === 'static' && !stacked) {
      const covered = coveredBy(element)
      if (covered) {
        blocked = covered
        return
      }
    }
    layers.push(element as Styled)
    if (level && position === 'sticky') over.push({ element, kind: 'sticky', box: null })
    if (level && position === 'absolute') {
      const box = element.getBoundingClientRect()
      const seen = box.width > 1 && box.height > 1 && style.visibility === 'visible' && Number(style.opacity) > 0
      if (seen) over.push({ element, kind: 'absolute', box })
    }
  }
  for (const child of content.children) consider(child, page ? null : styleOf(content))

  // the boxes that scroll up and down, and the sticky elements inside the chosen blocks that stick to this scroller (not to a box)
  const chosen = new Set<Element>(layers)
  const sticky: Styled[] = []
  const all = content.querySelectorAll('*')
  for (let i = 0; i < all.length; i++) {
    const element = all[i]
    if (SILENT.has(element.tagName)) continue
    const style = styleOf(element)
    if (style.position === 'sticky' && !chosen.has(element) && 'style' in element && stickHere(element, content, styleOf, chosen)) {
      sticky.push(element as Styled)
    }
    const html = element as HTMLElement
    const down = SCROLLING.has(style.overflowY) && html.scrollHeight - html.clientHeight >= 1
    const across = SCROLLING.has(style.overflowX) && html.scrollWidth - html.clientWidth >= 1
    if ((down || across) && !EDITABLE.has(element.tagName) && !html.isContentEditable) boxes.push(html)
  }

  if (blocked) {
    const { element, kind } = blocked as { element: Element; kind: string }
    const what = kind === 'absolute' ? 'is absolutely positioned over content that comes after it' : `has position: ${kind}`
    return result(
      [],
      `this element ${what} and no z-index, so that content would be drawn over it once it had a layer of its own. Give it a z-index of 1 or more`,
      element
    )
  }
  if (layers.length + sticky.length > MOST) {
    return result(
      [],
      `more than ${MOST} elements would need a layer of their own. List the blocks to draw in the subpixel option`,
      null
    )
  }
  const every = [...layers, ...sticky]
  every.sort((a, b) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1))
  return result(every)
}

// Whether a sticky element inside a chosen block sticks to the scroller itself: no box between it and the scrolled content.
function stickHere(element: Element, content: Element, styleOf: (element: Element) => CSSStyleDeclaration, chosen: Set<Element>) {
  let inside = false
  for (let node = element.parentElement; node && node !== content; node = node.parentElement) {
    const style = styleOf(node)
    if (style.overflowX !== 'visible' && style.overflowX !== 'clip') return false
    if (style.overflowY !== 'visible' && style.overflowY !== 'clip') return false
    if (chosen.has(node)) inside = true
  }
  return inside
}
