// A turn of the wheel or a move on a trackpad, in pixels, and whether an element inside the scroller should take it instead.

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

/**
 * Whether an element between the event's target and the scroller takes this movement itself: one marked `data-svifa-native` (or
 * picked by `native`), or, when `nested` is on, a scrolling box that can still move this way, or whose overscroll-behavior keeps the
 * wheel inside it even at its end.
 */
export function takenInside(
  event: Event,
  scroller: Element,
  horizontal: boolean,
  delta: number,
  nested: boolean,
  native: ((element: Element) => boolean) | undefined
): boolean {
  for (const node of event.composedPath()) {
    if (node === scroller || !(node instanceof Element)) {
      if (node === scroller || node === document || node === window) return false
      continue
    }
    if (node.hasAttribute('data-svifa-native') || native?.(node)) return true
    if (!nested) continue

    const room = horizontal ? node.scrollWidth - node.clientWidth : node.scrollHeight - node.clientHeight
    if (room < 1) continue
    const style = getComputedStyle(node)
    if (!SCROLLS.has(horizontal ? style.overflowX : style.overflowY)) continue
    const at = horizontal ? node.scrollLeft : node.scrollTop
    if (delta > 0 ? at < room - 0.5 : at > 0.5) return true
    // a browser without overscroll-behavior (Safari before 16) reports nothing, which is the same as auto
    const overscroll = horizontal ? style.overscrollBehaviorX : style.overscrollBehaviorY
    if (overscroll && overscroll !== 'auto') return true
  }
  return false
}
