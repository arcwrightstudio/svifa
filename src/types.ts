/** The direction a scroller moves in. */
export type Axis = 'vertical' | 'horizontal'

/** A curve from 0 to 1 over a timed glide: given the share of the time gone (0 to 1), the share of the distance covered. */
export type Easing = (t: number) => number

/**
 * Where to go: a position in pixels, an element, a CSS selector or `#id`, or `'top'`/`'start'` (the beginning) or
 * `'bottom'`/`'end'` (the furthest the scroller can go).
 */
export type SvifaTarget = number | Element | string

/** Svifa's options, every one of them optional. */
export interface SvifaOptions {
  /**
   * What scrolls: the page (leave it out, or pass `window` or `document.documentElement`) or a scrolling element (an element with
   * `overflow: auto` or `scroll` and content taller or wider than itself).
   * @default window
   */
  scroller?: Window | Element

  /**
   * The direction it scrolls in. A horizontal scroller also takes the wheel's up and down.
   * @default 'vertical'
   */
  axis?: Axis

  /**
   * How quickly a glide closes in on where it is going, the same at any refresh rate: at 0.1, about a tenth of the remaining distance
   * every sixtieth of a second. Lower glides longer and softer; higher follows the wheel more closely (at most 1).
   * @default 0.1
   */
  lerp?: number

  /**
   * Glide for a set time instead, in seconds, along `easing`. When given, wheel glides and `scrollTo` use it in place of `lerp`.
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
   * Leave a scrolling box inside the scroller (a dropdown, a code sample, a chat log) to scroll on its own for as long as it can move
   * the way the wheel turns, and while its `overscroll-behavior` keeps the wheel to itself.
   * @default true
   */
  nested?: boolean

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

/** Options for one glide made with `scrollTo`. */
export interface ScrollToOptions {
  /** Added to the target position, for example `-80` to stop short of a sticky header. @default 0 */
  offset?: number
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

/** The events Svifa hands out. `scroll` fires whenever the scroller's drawn position changes, whatever moved it. */
export type SvifaEvent = 'scroll'
