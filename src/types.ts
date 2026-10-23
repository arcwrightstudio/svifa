// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Arcwright Studio

/** The direction a scroller moves in: up and down, sideways, or both at once. */
export type Axis = 'vertical' | 'horizontal' | 'both'

/** A curve from 0 to 1 over a timed glide: given the share of the time gone (0 to 1), the share of the distance covered. */
export type Easing = (t: number) => number

/**
 * Where to go: a position in pixels, an element, a CSS selector or `#id`, or `'top'`/`'start'` (the beginning) or
 * `'bottom'`/`'end'` (the furthest the scroller can go). On a scroller that moves both ways, a number is the vertical position and
 * `{ x, y }` sets each axis (an axis left out stays where it is); an element, a selector or a keyword sets both.
 */
export type SvifaTarget = number | Element | string | Point

/** A position on each axis, in pixels from the start. Either may be left out. */
export interface Point {
  x?: number
  y?: number
}

/** Svifa's options, every one of them optional. */
export interface SvifaOptions {
  /**
   * What scrolls: the page (leave it out, or pass `window` or `document.documentElement`) or a scrolling element (an element with
   * `overflow: auto` or `scroll` and content taller or wider than itself).
   * @default window
   */
  scroller?: Window | Element

  /**
   * The direction it scrolls in. A horizontal scroller also takes the wheel's up and down. `'both'` glides each way at once, for a
   * scroller that moves up and down and sideways (a map, a board, a wide table): the wheel's up and down move it vertically and its
   * sideways movement horizontally.
   * @default 'vertical'
   */
  axis?: Axis

  /**
   * How quickly a glide closes in on where it is going, the same at any refresh rate: at 0.1, about a tenth of the remaining distance
   * every sixtieth of a second. Drawn on whole pixels (with `subpixel: false`, in Firefox, or where Svifa cannot draw between them) it
   * never moves slower than 60 px a second, so its last pixels never creep. Lower glides longer and softer; higher follows the wheel
   * more closely (at most 1).
   * @default 0.1
   */
  lerp?: number

  /**
   * Glide for a set time instead, in seconds, along `easing`. When given, wheel glides and `scrollTo` use it in place of `lerp`. Drawn
   * on whole pixels it never moves slower than 60 px a second, so with an easing that starts or ends slowly it arrives a little early.
   */
  duration?: number

  /**
   * The curve a timed glide follows (used with `duration`).
   * @default an exponential ease-out
   */
  easing?: Easing

  /**
   * Glide the mouse wheel and the trackpad. Turn off to leave them to the browser and use Svifa only for `scrollTo`.
   * @default true
   */
  wheel?: boolean

  /**
   * Multiplies the distance of every wheel or trackpad movement.
   * @default 1
   */
  wheelSpeed?: number

  /**
   * How the wheel moves a scrolling box inside the scroller (a dropdown, a code sample, a chat log) while the box can move the way the
   * wheel turns. `true`: the box glides as the scroller does, with the same feel, drawn between pixels. `'native'`: the browser scrolls
   * it, as it would without Svifa. `false`: the scroller glides instead, even over the box. A function decides for each box: given the
   * box, it returns one of those, or options for that box alone (`{ lerp: 0.2 }`). A box marked `data-svifa-native` (or picked by
   * `native`) is always left to the browser, and so is a box with a Svifa of its own (that one decides), a form control and editable
   * text. At its end, the wheel goes on to whatever is around the box, unless the box's `overscroll-behavior` keeps it inside.
   * @default true
   */
  nested?: boolean | 'native' | ((box: Element) => boolean | 'native' | TunableOptions)

  /**
   * Elements whose wheel turns are always left to the browser: return `true` for them. Elements with a `data-svifa-native` attribute,
   * and everything inside them, always are.
   */
  native?: (element: Element) => boolean

  /**
   * For a Svifa on a scrolling element: once it is at its start or end, let the wheel carry on to the page around it, as browsers do.
   * Turn off to keep every turn of the wheel inside it.
   * @default true
   */
  chain?: boolean

  /**
   * Draw the scrolled content between whole pixels while it glides. A browser draws a scrolled page only on whole pixels, so the slow
   * end of a glide would show as one-pixel hops; Svifa scrolls to the nearest whole pixel and moves the content by the part of a pixel
   * left over, which the GPU draws in between. Each element it moves has a layer of its own for as long as Svifa runs (Svifa sets
   * `will-change: translate` on it), which also makes the element a stacking context and the containing block of any fixed element
   * inside it.
   *
   * Left on, Svifa chooses the elements: the blocks that scroll with the content (the scroller's children), split around any fixed
   * element and anything else a layer would change, and the sticky elements inside them. Where a layer would change what is drawn
   * over what and cannot be split around (a fixed or sticky element with no z-index, with content after it), it draws on whole pixels
   * and says why in the console. An element marked `data-svifa-subpixel="off"`, and everything inside it, is left on whole pixels.
   *
   * Or name the elements: a CSS selector, a list of elements, or a function that returns them (asked again whenever the page's
   * elements change). List the blocks that scroll with the content and every sticky element inside them (Svifa warns once in the
   * console about one it finds missing), never an element with `position: fixed` or an ancestor of one. `false` draws on whole pixels:
   * a glide then never moves slower than 60 px a second, so its last pixels never creep.
   *
   * Firefox, at a screen scale of 100%, draws on whole pixels whatever it is asked, so there Svifa chooses none, nor on a device with
   * only a touch screen, where nothing glides under a finger. An element's own `translate` is replaced while the content glides and
   * put back when it rests. In Chrome and Edge on Windows, text in a layer is smoothed in greyscale.
   * @default true
   */
  subpixel?: boolean | string | Iterable<Element> | (() => Iterable<Element>)

  /**
   * Glide to same-page links (`href="#id"`, `"#"` or `"#top"`) when they are clicked, in place of the browser's jump. The link still
   * goes into the address as a new history entry and `hashchange` is sent; pressed from the keyboard (a skip link), it also carries
   * keyboard focus to the place. Pass `scrollTo` options to adjust every such glide, for example `{ offset: -80 }` under a sticky
   * header, or give the targets `scroll-margin-top`, which Svifa honours as the browser does.
   * @default false
   */
  anchors?: boolean | ScrollToOptions

  /**
   * Glide to the snap points the page sets in CSS: `scroll-snap-type` on the scroller, `scroll-snap-align` on what it holds. The wheel
   * moves as far as it would without snapping, and the glide comes to rest on the nearest snap point; with `mandatory`, a turn too
   * small to get halfway there still goes on to the next one, so one notch or one trackpad swipe moves one point, and with
   * `proximity` it rests on a point only within a third of the visible area. `scrollTo` and same-page links rest on the snap point
   * nearest their target. `scroll-padding`, `scroll-margin`, `scroll-snap-stop: always` and areas longer than the visible area are
   * honoured as the browser honours them. Left off, a scroller that snaps is left to the browser: the wheel scrolls it as the browser
   * does, and `scrollTo` moves at once.
   * @default false
   */
  snap?: boolean

  /**
   * Follow the reader's reduced-motion setting: while it is on, the wheel is left to the browser and `scrollTo` moves at once.
   * @default true
   */
  reducedMotion?: boolean

  /**
   * Run Svifa's own frame loop (only while something is moving). Turn off to drive it from your own loop with `raf(time)`.
   * @default true
   */
  autoRaf?: boolean
}

/** The options `configure` can change while Svifa runs: how it feels, as opposed to what it scrolls. */
export type TunableOptions = Pick<
  SvifaOptions,
  'lerp' | 'duration' | 'easing' | 'wheel' | 'wheelSpeed' | 'nested' | 'native' | 'chain' | 'anchors' | 'snap'
>

/** Options for one glide made with `scrollTo`. */
export interface ScrollToOptions {
  /**
   * Added to the target position, for example `-80` to stop short of a sticky header. On a scroller that moves both ways, a number
   * is added to the vertical position, and `{ x, y }` to each.
   * @default 0
   */
  offset?: number | Point
  /** Move at once, without a glide. @default false */
  immediate?: boolean
  /** This glide's own `lerp`. */
  lerp?: number
  /** This glide's own `duration`, in seconds. */
  duration?: number
  /** This glide's own `easing`. */
  easing?: Easing
  /** Keep the wheel from moving the scroller until this glide arrives. @default false */
  lock?: boolean
  /** Glide even while Svifa is stopped. @default false */
  force?: boolean
}

/** One axis of a scroller as Svifa moves it: `svifa.x` (sideways) and `svifa.y` (up and down). */
export interface AxisState {
  /** Where the content is along this axis, in pixels from the start: the glide's exact position while it moves. */
  readonly scroll: number
  /** Where it is heading along this axis: the end of the glide under way, or at rest the same as `scroll`. */
  readonly target: number
  /** The furthest it can scroll along this axis, in pixels, measured as it is now. */
  readonly limit: number
  /** `scroll` as a share of `limit`, from 0 to 1 (1 when it cannot scroll this way at all). */
  readonly progress: number
  /** How fast it is moving along this axis, in pixels a second, positive toward the end. */
  readonly velocity: number
  /** `1` toward the end, `-1` toward the start, `0` before it has moved this way. */
  readonly direction: -1 | 0 | 1
}

/** The events Svifa hands out. `scroll` fires whenever the scroller's drawn position changes, whatever moved it. */
export type SvifaEvent = 'scroll'
