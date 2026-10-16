import { Scroller } from './scroller'
import { Subpixel } from './subpixel'
import { positionOf, resolve, reveal } from './target'
import type { Axis, Easing, SvifaEvent, SvifaOptions, SvifaTarget, ScrollToOptions } from './types'
import { takenInside, wheelDelta } from './wheel'

/** The curve a timed glide follows unless told otherwise: quick at first, settling softly (an exponential ease-out from 0 to 1). */
export const easeOut: Easing = (t) => (t >= 1 ? 1 : (1 - 2 ** (-10 * t)) / (1 - 2 ** -10))

// A glide either closes a share of the gap every moment (lerp) or covers it over a set time along a curve.
type Motion =
  | { kind: 'lerp'; to: number; rate: number }
  | { kind: 'timed'; from: number; to: number; duration: number; easing: Easing; elapsed: number }

type How = { lerp?: number; duration?: number; easing?: Easing; lock?: boolean }

/** The options as Svifa uses them, every default filled in. */
type Settings = Required<Omit<SvifaOptions, 'scroller' | 'duration' | 'native' | 'subpixel'>> &
  Pick<SvifaOptions, 'duration' | 'native' | 'subpixel'>
/** The options in use, every default filled in (read only). */
export type ResolvedOptions = Readonly<Settings>

const CLASSES = ['svifa', 'svifa-gliding', 'svifa-stopped', 'svifa-subpixel']

// The keys that scroll a page or a box when nothing editable has the focus.
const SCROLL_KEYS = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'PageUp', 'PageDown', 'Home', 'End', ' ']

// The Svifa on each scroller: one only, since two would each move it and each keep its own classes on it.
const installed = new WeakMap<HTMLElement, Svifa>()

// Gives keyboard focus to the place a link leads to, without scrolling: an element that cannot take focus takes it for as long as it
// keeps it (tabindex -1 until it loses focus), so the next Tab carries on from there.
function focusPlace(element: HTMLElement) {
  if (!element.hasAttribute('tabindex') && element.tabIndex < 0) {
    element.setAttribute('tabindex', '-1')
    element.addEventListener('blur', () => element.removeAttribute('tabindex'), { once: true })
  }
  element.focus({ preventScroll: true })
}

// A number given as an option, or the default when it is missing or not a finite number (a lerp is kept between 0 and 1, a duration
// above 0).
const finiteOr = (value: number | undefined, fallback: number) => (Number.isFinite(value) ? (value as number) : fallback)
const lerpOr = (value: number | undefined, fallback: number) =>
  Number.isFinite(value) && (value as number) > 0 ? Math.min(value as number, 1) : fallback
const durationOr = (value: number | undefined) => (Number.isFinite(value) && (value as number) > 0 ? value : undefined)

// The fragment of an address, '#' included, or null when it has none ('#' alone is a fragment, an empty one).
const fragmentOf = (href: string) => {
  const at = href.indexOf('#')
  return at < 0 ? null : href.slice(at)
}

// A link's '#fragment' as the id it names; a malformed escape is taken as written.
function decodeHash(hash: string) {
  const raw = hash.slice(1)
  try {
    return decodeURIComponent(raw)
  } catch {
    return raw
  }
}

/**
 * Smooth scrolling for the page or any scrolling element. The wheel and the trackpad glide; touch, the keyboard, the scrollbar and
 * find in page stay the browser's own, and a glide gives way to them the moment they move the scroller.
 *
 * @example
 * const svifa = new Svifa()
 * svifa.scrollTo('#contact', { offset: -80 })
 * svifa.on('scroll', ({ scroll, progress }) => {})
 * svifa.destroy()
 */
export class Svifa {
  private readonly settings: Settings
  /** How fast the scroller's drawn position is moving, in pixels a second (positive toward the end). */
  velocity = 0
  /** Which way it last moved: 1 toward the end, -1 toward the start, 0 before it has moved. */
  direction: -1 | 0 | 1 = 0

  private readonly area: Scroller
  private readonly layer: Subpixel | null
  private readonly reduced: MediaQueryList | null
  private readonly listeners = new Map<SvifaEvent, Set<(svifa: Svifa) => void>>()

  private value: number // where the content is drawn
  private goal: number // where it is heading (wheel turns add up here)
  private motion: Motion | null = null
  private settle: number | undefined // how close a lerp glide comes before it rests
  private written: number | null = null // where the browser put the scroller on Svifa's last move
  private fromScrollTo = false // the glide under way came from scrollTo
  private finish: ((arrived: boolean) => void) | null = null // settles scrollTo's promise
  private locked = false
  private stopped = false
  private destroyed = false
  private frame = 0
  private lastTime: number | null = null
  private quietEnd = false // the browser's scrollend events for Svifa's own moves are held back
  private lastNative = 0 // when the last scroll Svifa did not make was seen
  private still: ReturnType<typeof setTimeout> | undefined
  private keeper: MutationObserver | null = null // puts Svifa's classes back when something rewrites the class attribute
  private origin = 0 // where the scroller was when the glide under way began from rest
  private moved = false // whether that glide has moved the scroller yet

  /**
   * Starts smooth scrolling on the page, or on `options.scroller`. Throws outside a browser, and when the scroller already has a
   * Svifa (destroy that one first).
   */
  constructor(options: SvifaOptions = {}) {
    if (typeof window === 'undefined') {
      throw new Error('Svifa runs in the browser: create it in client-side code (in React, inside useEffect).')
    }
    this.settings = {
      axis: options.axis ?? 'vertical',
      lerp: lerpOr(options.lerp, 0.1),
      duration: durationOr(options.duration),
      easing: options.easing ?? easeOut,
      wheel: options.wheel ?? true,
      wheelSpeed: finiteOr(options.wheelSpeed, 1),
      nested: options.nested ?? true,
      native: options.native,
      chain: options.chain ?? true,
      subpixel: options.subpixel,
      anchors: options.anchors ?? false,
      reducedMotion: options.reducedMotion ?? true,
      autoRaf: options.autoRaf ?? true,
    }
    this.area = new Scroller(options.scroller, this.settings.axis)
    const other = installed.get(this.area.root)
    if (other && !other.destroyed) {
      throw new Error('Svifa: this scroller already has a Svifa. Destroy that one before creating another.')
    }
    installed.set(this.area.root, this)
    // Drawing between pixels needs the translate property (every browser since 2022); without it, and for a right-to-left horizontal
    // scroller, the browser's own drawing stands.
    const translates = typeof CSS !== 'undefined' && typeof CSS.supports === 'function' && CSS.supports('translate', '1px')
    this.layer = options.subpixel && translates && !this.area.reversed ? new Subpixel(options.subpixel, this.area) : null
    // matchMedia is missing in some test environments (jsdom): motion is then taken as not reduced
    this.reduced =
      this.settings.reducedMotion && typeof window.matchMedia === 'function'
        ? window.matchMedia('(prefers-reduced-motion: reduce)')
        : null
    this.value = this.goal = this.area.position

    const events = this.area.events
    events.addEventListener('wheel', this.onWheel as EventListener, { passive: false })
    events.addEventListener('scroll', this.onScroll, { passive: true })
    events.addEventListener('scrollend', this.onScrollEnd, { capture: true })
    events.addEventListener('touchstart', this.onTouch, { passive: true })
    events.addEventListener('pointerdown', this.onPointerDown as EventListener, { passive: true })
    events.addEventListener('keydown', this.onKey as EventListener, { passive: true })
    if (this.settings.anchors) document.addEventListener('click', this.onClick)
    window.addEventListener('resize', this.onResize, { passive: true })
    // the reduced-motion setting can change while the page is open (older Safari only has addListener)
    if (this.reduced) {
      if (typeof this.reduced.addEventListener === 'function') this.reduced.addEventListener('change', this.onMotionSetting)
      else this.reduced.addListener(this.onMotionSetting)
    }
    // a framework that writes the class attribute itself (a theme on <html>) would wipe Svifa's classes, and with them svifa-stopped
    if (typeof MutationObserver === 'function') {
      this.keeper = new MutationObserver(() => this.mark())
      this.keeper.observe(this.area.root, { attributes: true, attributeFilter: ['class'] })
    }
    this.mark()
    // once the page has settled, a word to the developer if the subpixel list misses a sticky element it needs
    if (this.layer) {
      const later = typeof requestIdleCallback === 'function' ? requestIdleCallback : (run: () => void) => setTimeout(run, 500)
      later(() => {
        if (!this.destroyed) this.layer?.checkSticky()
      })
    }
  }

  // ---- what anyone may read

  /**
   * Where the content is now, in pixels from the start: the glide's exact position while it moves, and otherwise where the browser has
   * the scroller (read at once, so a scroll listener that runs before Svifa's own still reads the new place).
   */
  get scroll(): number {
    return this.motion ? this.value : this.area.position
  }

  /** Where the scroller is heading: the end of the glide under way, or where it is when nothing glides. */
  get target(): number {
    return this.motion ? this.goal : this.scroll
  }

  /** The furthest the scroller can go, in pixels, measured as it is now. */
  get limit(): number {
    return this.area.measure()
  }

  /** How far along it is, from 0 at the start to 1 at the end (1 when it cannot scroll at all). */
  get progress(): number {
    const limit = this.area.measure()
    return limit > 0 ? this.scroll / limit : 1
  }

  /** Whether a glide is under way. */
  get isGliding(): boolean {
    return this.motion !== null
  }

  /** Whether Svifa is stopped (see `stop`). */
  get isStopped(): boolean {
    return this.stopped
  }

  /** The element that scrolls: <html> for the page. */
  get element(): HTMLElement {
    return this.area.root
  }

  /** The direction the scroller moves in. */
  get axis(): Axis {
    return this.settings.axis
  }

  /** The options in use, every default filled in: a frozen copy. */
  get options(): ResolvedOptions {
    return Object.freeze({ ...this.settings })
  }

  // ---- what anyone may do

  /**
   * Glides to a target: a position, an element, a selector or `#id`, or `'top'` / `'bottom'`. Resolves `true` once it arrives and
   * `false` if something else moves the scroller first or the target is not on the page. With the reader's reduced-motion setting on
   * (and `reducedMotion` left on), it moves at once.
   */
  scrollTo(target: SvifaTarget, options: ScrollToOptions = {}): Promise<boolean> {
    if (this.destroyed || (this.stopped && !options.force)) return Promise.resolve(false)
    this.sync()
    const limit = this.area.measure()
    const named = resolve(target, this.area)
    if (named === null) {
      console.warn('Svifa: nothing on the page matches the target', target)
      return Promise.resolve(false)
    }
    // an element inside a scrolling box of its own is first brought into view there, as a link to it would be
    if (typeof named !== 'number') reveal(named, this.area)
    const found =
      typeof named === 'number' ? named : positionOf(named, this.area, (element) => this.layer?.offsetOf(element) ?? 0)
    const goal = Math.min(Math.max(found + finiteOr(options.offset, 0), 0), limit)

    // a scroller that snaps is left to the browser, which puts every move on a snap point: there the move is made at once
    if (options.immediate || this.reduced?.matches || this.area.snaps) {
      this.jumpTo(goal)
      return Promise.resolve(true)
    }
    if (!this.motion && Math.abs(goal - this.value) < 0.5 / devicePixelRatio) return Promise.resolve(true)

    // its own lerp or duration first, then Svifa's: a set duration (its own or Svifa's) makes it a timed glide
    const own = options.lerp !== undefined || options.duration !== undefined
    const how: How = {
      lerp: lerpOr(options.lerp, this.settings.lerp),
      duration: durationOr(own ? options.duration : this.settings.duration),
      easing: options.easing ?? this.settings.easing,
      lock: options.lock,
    }
    return new Promise((resolve) => {
      this.glideTo(goal, how, true)
      this.finish = resolve
    })
  }

  /**
   * Stops where it is, for a dialog or menu: the wheel no longer moves the scroller until `start` (with svifa.css, neither do the
   * keyboard or the scroll bar).
   */
  stop(): void {
    if (this.stopped || this.destroyed) return
    const before = this.value
    this.halt()
    this.stopped = true
    this.area.holdGutter(true)
    this.mark()
    if (this.value !== before) this.emit()
  }

  /** Lets the scroller move again after `stop`. */
  start(): void {
    if (!this.stopped || this.destroyed) return
    this.stopped = false
    this.value = this.goal = this.area.position
    this.mark()
    this.area.holdGutter(false)
  }

  /**
   * Moves a glide on to `time` (milliseconds, as `requestAnimationFrame` gives it). Only needed with `autoRaf: false`, called from
   * your own frame loop every frame.
   */
  raf(time: number): void {
    const dt = this.lastTime === null ? 0 : Math.max(0, (time - this.lastTime) / 1000)
    this.lastTime = time
    const motion = this.motion
    if (!motion) return
    // A script that moved the scroller earlier in this frame, before its scroll event has been sent, has taken over: follow it.
    const actual = this.area.position
    if (this.written !== null && Math.abs(actual - this.written) >= 1) {
      this.halt()
      this.follow(actual)
      this.written = actual
      return
    }

    const before = this.value
    let done = false
    if (motion.kind === 'timed') {
      motion.elapsed += dt
      const t = Math.min(1, motion.elapsed / motion.duration)
      done = t >= 1
      this.value = done ? motion.to : motion.from + (motion.to - motion.from) * motion.easing(t)
    } else {
      this.value = motion.to + (this.value - motion.to) * Math.exp(-motion.rate * dt)
      if (this.arrived(motion.to)) {
        this.value = motion.to
        done = true
      }
    }
    if (dt > 0) this.velocity = (this.value - before) / dt
    if (this.value !== before) this.direction = this.value > before ? 1 : -1

    const aimed = motion.to
    this.draw()
    // the first move showed the browser's grid and the end moved onto it: one more frame gets there
    if (done && motion.to !== aimed) done = false
    // at rest the position is wherever the browser put the scroller (its own grid, or held short at an end), reported before the
    // last scroll event goes out so every listener sees where it stopped
    if (done && this.written !== null) this.value = this.written
    if (this.value !== before) this.emit()
    if (done) this.arrive()
  }

  /** Calls `listener` whenever the scroller's drawn position changes. Returns the function that stops it. */
  on(event: SvifaEvent, listener: (svifa: Svifa) => void): () => void {
    let set = this.listeners.get(event)
    if (!set) this.listeners.set(event, (set = new Set()))
    set.add(listener)
    return () => this.off(event, listener)
  }

  /** Stops calling `listener` (the function `on` returns does the same). */
  off(event: SvifaEvent, listener: (svifa: Svifa) => void): void {
    this.listeners.get(event)?.delete(listener)
  }

  /** Takes Svifa off the page: the scroller is left where it is, and every listener, class and style Svifa added is removed. */
  destroy(): void {
    if (this.destroyed) return
    if (installed.get(this.area.root) === this) installed.delete(this.area.root)
    this.halt()
    this.layer?.clear()
    this.destroyed = true
    if (this.frame) cancelAnimationFrame(this.frame)
    this.frame = 0
    clearTimeout(this.still)

    const events = this.area.events
    events.removeEventListener('wheel', this.onWheel as EventListener)
    events.removeEventListener('scroll', this.onScroll)
    events.removeEventListener('scrollend', this.onScrollEnd, { capture: true })
    events.removeEventListener('touchstart', this.onTouch)
    events.removeEventListener('pointerdown', this.onPointerDown as EventListener)
    events.removeEventListener('keydown', this.onKey as EventListener)
    document.removeEventListener('click', this.onClick)
    window.removeEventListener('resize', this.onResize)
    if (this.reduced) {
      if (typeof this.reduced.removeEventListener === 'function') this.reduced.removeEventListener('change', this.onMotionSetting)
      else this.reduced.removeListener(this.onMotionSetting)
    }
    this.keeper?.disconnect()
    this.listeners.clear()
    this.area.root.classList.remove(...CLASSES)
    this.area.destroy()
  }

  // ---- input

  private onWheel = (event: WheelEvent) => {
    // zooming, already handled by something else, or part of a gesture the browser has already begun scrolling on its own
    if (event.ctrlKey || event.defaultPrevented || !event.cancelable) return
    // stopped or locked, the wheel is held whatever the other settings (a box of its own inside still takes it)
    const holding = this.stopped || this.locked
    if (!holding && (!this.settings.wheel || this.reduced?.matches)) return

    const root = this.area.root
    const { x, y } = wheelDelta(event, { width: root.clientWidth, height: root.clientHeight })
    const sideways = Math.abs(x) > Math.abs(y)
    // a vertical scroller leaves a sideways movement to the browser: a trackpad's swipe back, a carousel
    if (sideways && !this.area.horizontal) return
    const turn = sideways ? x : y
    if (turn === 0 || takenInside(event, root, sideways, turn, this.settings.nested, this.settings.native)) return

    if (holding) {
      event.preventDefault()
      return
    }
    // scrolling switched off on the scroller (a dialog's scroll lock), or a scroller that snaps: the browser's own wheel stands
    if (this.area.frozen || this.area.snaps) return

    this.sync()
    const limit = this.area.measure()
    const from = this.fromScrollTo ? this.value : this.goal
    const goal = Math.min(Math.max(from + turn * this.settings.wheelSpeed, 0), limit)
    // at its start or end the wheel goes on to whatever is around the scroller, as the browser's own scrolling does
    if (this.settings.chain && goal === from && (turn > 0 ? this.value >= limit - 0.5 : this.value <= 0.5)) return

    event.preventDefault()
    const how = { lerp: this.settings.lerp, duration: this.settings.duration, easing: this.settings.easing }
    this.glideTo(goal, how, false, event.timeStamp)
  }

  // A finger on the screen or a middle-button press (the browser's autoscroll) takes over from a glide.
  private onTouch = () => {
    if (this.motion) this.halt()
  }

  private onPointerDown = (event: PointerEvent) => {
    if (event.button === 1 && this.motion) this.halt()
  }

  // A key that scrolls takes over from a glide at once. Some browsers (Firefox) scroll for a key a moment later, and Svifa's next
  // frame would otherwise undo it before it was seen.
  private onKey = (event: KeyboardEvent) => {
    if (!this.motion || event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey) return
    if (!SCROLL_KEYS.includes(event.key)) return
    const target = event.target
    if (target instanceof HTMLElement && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))) return
    this.halt()
  }

  // A same-page link (with the anchors option): glide to the place, and do what the browser's own jump does besides: put the link in
  // the address as a new history entry, send hashchange, and (when the link was pressed from the keyboard, as a skip link is) carry
  // keyboard focus to the place.
  private onClick = (event: MouseEvent) => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
    const link = event.composedPath().find((node): node is HTMLAnchorElement => node instanceof HTMLAnchorElement)
    if (!link || !link.hasAttribute('href') || link.hasAttribute('download')) return
    if (link.target && link.target !== '_self') return
    const url = new URL(link.href, location.href)
    if (url.origin !== location.origin || url.pathname !== location.pathname || url.search !== location.search) return
    // only a link to a place on this page: '#', '#top' or '#id'
    if (!url.hash && !link.getAttribute('href')?.endsWith('#')) return
    const id = decodeHash(url.hash)
    const element = id ? document.getElementById(id) : null
    // '#' and '#top' (when nothing has that id) are the top of the page, as the browser takes them; any other missing id is left to it,
    // and so is the top of the page for a Svifa on an element
    if (!element && ((id !== '' && id !== 'top') || !this.area.isPage)) return
    // a place outside an element scroller is not this Svifa's to reach
    if (element && !this.area.root.contains(element)) return

    event.preventDefault()
    const options = typeof this.settings.anchors === 'object' ? this.settings.anchors : {}
    // stopped: the link moves nothing, as nothing else may (unless the anchors options force it)
    if (this.stopped && !options.force) return
    void this.scrollTo(element ?? 0, options)
    const from = location.href
    if (url.href !== from) {
      history.pushState(history.state, '', url.href)
      if (fragmentOf(url.href) !== fragmentOf(from)) {
        // as the browser sends it: in a task of its own, after the address has changed
        setTimeout(() => window.dispatchEvent(new HashChangeEvent('hashchange', { oldURL: from, newURL: url.href })))
      }
    }
    // a click with no pointer behind it (Enter on the link) moves keyboard focus to the place
    if (event.detail === 0 && element) focusPlace(element)
  }

  // ---- the browser's own scrolling

  private onScroll = () => {
    const actual = this.area.position
    // the echo of Svifa's own last move (it arrives a frame later, even after a glide has ended): already drawn and reported
    if (actual === this.written) return
    if (this.motion) {
      // within a pixel of Svifa's own move is the browser's rounding, not someone else
      if (this.written === null || Math.abs(actual - this.written) < 1) return
      // something else moved the scroller mid-glide (a key, the scrollbar, find in page, the browser restoring a place): it wins
      this.halt()
    }
    this.written = null
    this.follow(actual)
  }

  // A scroll of the browser's own (or a script's): follow it, and let its scrollend through.
  private follow(actual: number) {
    this.quietEnd = false
    const now = performance.now()
    const before = this.value
    this.value = this.goal = actual
    const dt = (now - this.lastNative) / 1000
    this.velocity = dt > 0 && dt < 0.25 ? (actual - before) / dt : 0
    if (actual !== before) this.direction = actual > before ? 1 : -1
    this.lastNative = now
    clearTimeout(this.still)
    this.still = setTimeout(() => (this.velocity = 0), 150)
    this.emit()
  }

  // The browser sends a scrollend after each of Svifa's moves; they are held back while it glides, and one is sent when it arrives.
  // Only this scroller's own: a box inside it (or anywhere on the page) keeps its scrollend.
  private onScrollEnd = (event: Event) => {
    const own = this.area.isPage ? event.target === document || event.target === window : event.target === this.area.root
    if (own && this.quietEnd && !(event instanceof CustomEvent && event.detail?.svifa)) event.stopImmediatePropagation()
  }

  private onResize = () => {
    this.area.measure()
  }

  // The reader turned reduced motion on or off: a glide under way finishes at once, and the subpixel class follows the setting.
  private onMotionSetting = () => {
    if (this.reduced?.matches && this.motion) {
      const finish = this.finish
      this.finish = null
      this.jumpTo(this.goal)
      finish?.(true)
    }
    this.mark()
  }

  // ---- gliding

  // At rest, starts from where the browser has the scroller when it is somewhere else: a scroll of its own made a moment ago (a script,
  // the browser bringing an element into view) may not have been reported yet. Where it is not, the goal keeps the fraction of a pixel
  // earlier turns left, so small trackpad movements add up. (A quarter pixel is less than any device pixel, and far above rounding.)
  private sync() {
    if (this.motion) return
    const actual = this.area.position
    if (Math.abs(actual - this.value) >= 0.25) this.value = this.goal = actual
  }

  // `since` is when the move was asked for (an input event's time), so the first frame moves by the time since then
  private glideTo(goal: number, how: How, fromScrollTo: boolean, since = performance.now()) {
    this.finish?.(false)
    this.finish = null
    this.goal = goal
    this.fromScrollTo = fromScrollTo
    this.locked = Boolean(how.lock)
    // A glide asked for from rest or by scrollTo owns the scroller from its first frame: a scroll the browser makes in this same
    // moment (a focus scrolling a field into view, a link's own jump) is not taken for someone else's, nor is its scrollend sent.
    if (!this.motion || fromScrollTo) this.written = null
    this.quietEnd = true
    if (!this.motion) {
      this.origin = this.area.position
      this.moved = false
    }
    this.layer?.begin(!this.motion)
    const to = this.layer ? this.area.restingPlace(goal) : goal
    if (how.duration !== undefined) {
      this.motion = { kind: 'timed', from: this.value, to, duration: how.duration, easing: how.easing ?? easeOut, elapsed: 0 }
    } else {
      this.motion = { kind: 'lerp', to, rate: (how.lerp ?? this.settings.lerp) * 60 }
    }
    this.settle = this.layer?.settle
    this.mark()
    this.run(since)
  }

  // Whether a lerp glide is there: drawn between pixels, once what is left is too little to see; otherwise once the browser would
  // draw it on the same device pixel as its end.
  private arrived(to: number) {
    if (this.settle !== undefined) return Math.abs(to - this.value) <= this.settle
    return this.area.restingPlace(this.value) === this.area.restingPlace(to)
  }

  private draw() {
    this.quietEnd = true
    const learned = this.area.moveTo(this.value)
    const actual = this.area.position
    // Held short of the place written, at the page's real end: the page ends nearer than it did when the glide began (its height is
    // not a whole pixel, or content went away). The glide ends where the page ends, and is never drawn past it.
    if (this.area.short && this.motion && actual >= this.area.measure() - 1) {
      this.goal = Math.min(this.goal, actual)
      this.motion.to = Math.min(this.motion.to, actual)
      this.value = Math.min(this.value, actual)
    }
    this.written = actual
    if (actual !== this.origin) this.moved = true
    this.layer?.place(this.value, actual)
    // the browser turned out to keep whole CSS pixels: aim the glide under way at a place it can rest on
    if (learned && this.layer && this.motion) this.motion.to = this.area.restingPlace(this.goal)
  }

  private arrive() {
    this.motion = null
    this.locked = false
    this.fromScrollTo = false
    this.velocity = 0
    this.layer?.clear()
    this.mark()
    const finish = this.finish
    this.finish = null
    finish?.(true)
    // One scrollend for the whole glide (if it moved the scroller at all), unless another glide has begun by then. The browser's own
    // scrollend for Svifa's last move stays held back; the next scroll of the browser's own lets them through again.
    if (!this.moved) return
    requestAnimationFrame(() => {
      if (this.motion || this.destroyed) return
      const target = this.area.isPage ? document : this.area.root
      target.dispatchEvent(new CustomEvent('scrollend', { bubbles: this.area.isPage, detail: { svifa: true } }))
    })
  }

  // Stops a glide where the browser has the scroller, for whatever is taking over.
  private halt() {
    if (!this.motion) return
    this.motion = null
    this.locked = false
    this.fromScrollTo = false
    this.written = null
    this.quietEnd = false
    this.layer?.clear()
    this.value = this.goal = this.area.position
    this.mark()
    const finish = this.finish
    this.finish = null
    finish?.(false)
  }

  // A move at once: like the browser's own, it is followed by its own scroll and scrollend events.
  private jumpTo(goal: number) {
    this.halt()
    this.quietEnd = false
    this.area.moveTo(goal)
    this.value = this.goal = this.written = this.area.position
    this.velocity = 0
    this.emit()
  }

  // Svifa's own frame loop runs only while something moves; it starts from the moment the move was asked for, so the first frame
  // already moves (an input event's time is earlier than the frame that follows it)
  private run(since: number) {
    if (!this.settings.autoRaf || this.frame) return
    this.lastTime = since
    this.frame = requestAnimationFrame(this.tick)
  }

  private tick = (time: number) => {
    this.frame = 0
    this.raf(time)
    if (this.motion && !this.destroyed) this.frame = requestAnimationFrame(this.tick)
  }

  private emit() {
    const set = this.listeners.get('scroll')
    if (set) for (const listener of [...set]) listener(this)
  }

  // The classes on the scroller's element: svifa (installed), svifa-gliding, svifa-stopped, and svifa-subpixel while Svifa can draw
  // between pixels (not while the reader asks for reduced motion, when it never glides). toggle() with a state touches the attribute
  // only when that class changes, so nothing else on the page is restyled and the keeper above never sees a change of Svifa's own.
  private mark() {
    if (this.destroyed) return
    const list = this.area.root.classList
    list.toggle('svifa', true)
    list.toggle('svifa-gliding', this.motion !== null)
    list.toggle('svifa-stopped', this.stopped)
    list.toggle('svifa-subpixel', this.layer !== null && !this.reduced?.matches)
  }
}
