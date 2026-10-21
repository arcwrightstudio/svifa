// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Arcwright Studio

import { Scroller } from './scroller'
import { Subpixel } from './subpixel'
import { positionOf, resolve, reveal } from './target'
import { AxisView, Track } from './track'
import type {
  Axis,
  AxisState,
  Easing,
  Point,
  SvifaEvent,
  SvifaOptions,
  SvifaTarget,
  ScrollToOptions,
  TunableOptions,
} from './types'
import { takenInside, wheelDelta } from './wheel'

/** The curve a timed glide follows unless told otherwise: quick at first, settling softly (an exponential ease-out from 0 to 1). */
export const easeOut: Easing = (t) => (t >= 1 ? 1 : (1 - 2 ** (-10 * t)) / (1 - 2 ** -10))

type How = { lerp?: number; duration?: number; easing?: Easing; lock?: boolean }

// Where a glide goes on each axis, in the order of the tracks: undefined leaves that axis as it is.
type Goals = (number | undefined)[]

// How far one wheel event moves the scroller along an axis, and whether that movement is sideways.
type Turn = { turn: number; sideways: boolean }

// A media query list as Safari before 14 has it: addListener and removeListener in place of the event methods.
type OlderMediaQueryList = { addListener(listener: () => void): void; removeListener(listener: () => void): void }

/** The options as Svifa uses them, every default filled in. */
type Settings = Required<Omit<SvifaOptions, 'scroller' | 'duration' | 'native' | 'subpixel'>> &
  Pick<SvifaOptions, 'duration' | 'native' | 'subpixel'>
/** The options in use, every default filled in (read only: change them with `configure`). */
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
// An easing given as an option, or the fallback when it is not a function (a script build is given whatever a page passes).
const easingOr = (value: Easing | undefined, fallback: Easing) => (typeof value === 'function' ? value : fallback)
// The axis given as an option, or vertical for anything else.
const axisOf = (value: Axis | undefined): Axis => (value === 'horizontal' || value === 'both' ? value : 'vertical')
// A position on each axis, as opposed to one number, an element or a selector.
const isPoint = (value: unknown): value is Point =>
  typeof value === 'object' && value !== null && !(value instanceof Element) && ('x' in value || 'y' in value)

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
  /** How fast the scroller's drawn position is moving along its main axis, in pixels a second (positive toward the end). */
  velocity = 0
  /** Which way it last moved along its main axis: 1 toward the end, -1 toward the start, 0 before it has moved. */
  direction: -1 | 0 | 1 = 0

  // the scroller along its main axis (vertical, unless it moves only sideways): it carries the element, its events and its classes
  private readonly area: Scroller
  // every axis Svifa moves, the main one first
  private readonly tracks: Track[]
  private readonly main: Track
  private readonly views: Map<Track, AxisView>
  private readonly layer: Subpixel | null
  private readonly reduced: MediaQueryList | null
  private readonly listeners = new Map<SvifaEvent, Set<(svifa: Svifa) => void>>()

  private settle: number | undefined // how close a lerp glide comes before it rests
  private fromScrollTo = false // the glide under way came from scrollTo
  private finish: ((arrived: boolean) => void) | null = null // settles scrollTo's promise
  private locked = false
  private stopped = false
  private destroyed = false
  private frame = 0
  private lastTime: number | null = null
  private quietEnd = false // the browser's scrollend events for Svifa's own moves are held back
  private keeper: MutationObserver | null = null // puts Svifa's classes back when something rewrites the class attribute

  /**
   * Starts smooth scrolling on the page, or on `options.scroller`. Throws outside a browser, and when the scroller already has a
   * Svifa (destroy that one first).
   */
  constructor(options: SvifaOptions = {}) {
    if (typeof window === 'undefined') {
      throw new Error('Svifa runs in the browser: create it in client-side code (in React, inside useEffect).')
    }
    this.settings = {
      axis: axisOf(options.axis),
      lerp: lerpOr(options.lerp, 0.1),
      duration: durationOr(options.duration),
      easing: easingOr(options.easing, easeOut),
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
    const axis = this.settings.axis
    this.area = new Scroller(options.scroller, axis === 'horizontal' ? 'horizontal' : 'vertical')
    const other = installed.get(this.area.root)
    if (other && !other.destroyed) {
      throw new Error('Svifa: this scroller already has a Svifa. Destroy that one before creating another.')
    }
    installed.set(this.area.root, this)
    // both ways: the same element, read and moved sideways as well
    const areas = [this.area]
    if (axis === 'both') areas.push(new Scroller(this.area.isPage ? window : this.area.root, 'horizontal'))
    this.tracks = areas.map((area, i) => new Track(area, i === 0 ? this : { velocity: 0, direction: 0 }))
    this.main = this.tracks[0]
    this.views = new Map(this.tracks.map((track) => [track, new AxisView(track)]))
    // Drawing between pixels needs the translate property (every browser since 2022); without it, and for a right-to-left horizontal
    // scroller, the browser's own drawing stands.
    const translates = typeof CSS !== 'undefined' && typeof CSS.supports === 'function' && CSS.supports('translate', '1px')
    const forward = areas.every((area) => !area.reversed)
    this.layer = options.subpixel && translates && forward ? new Subpixel(options.subpixel, areas) : null
    // matchMedia is missing in some test environments (jsdom): motion is then taken as not reduced
    this.reduced =
      this.settings.reducedMotion && typeof window.matchMedia === 'function'
        ? window.matchMedia('(prefers-reduced-motion: reduce)')
        : null

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
      else (this.reduced as unknown as OlderMediaQueryList).addListener(this.onMotionSetting)
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
   * Where the content is now along the main axis, in pixels from the start: the glide's exact position while it moves, and otherwise
   * where the browser has the scroller (read at once, so a scroll listener that runs before Svifa's own still reads the new place).
   */
  get scroll(): number {
    return this.main.scroll
  }

  /** Where the scroller is heading along the main axis: the end of the glide under way, or where it is when nothing glides. */
  get target(): number {
    return this.main.target
  }

  /** The furthest the scroller can go along the main axis, in pixels, measured as it is now. */
  get limit(): number {
    return this.area.measure()
  }

  /** How far along the main axis it is, from 0 at the start to 1 at the end (1 when it cannot scroll at all). */
  get progress(): number {
    const limit = this.area.measure()
    return limit > 0 ? this.scroll / limit : 1
  }

  /** The sideways axis (scroll, target, limit, progress, velocity, direction), or null when Svifa does not move the scroller sideways. */
  get x(): AxisState | null {
    const track = this.tracks.find((each) => each.area.horizontal)
    return track ? (this.views.get(track) ?? null) : null
  }

  /** The up and down axis (scroll, target, limit, progress, velocity, direction), or null when Svifa moves the scroller only sideways. */
  get y(): AxisState | null {
    const track = this.tracks.find((each) => !each.area.horizontal)
    return track ? (this.views.get(track) ?? null) : null
  }

  /** Whether a glide is under way. */
  get isGliding(): boolean {
    return this.tracks.some((track) => track.motion !== null)
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

  /** The options in use, every default filled in: a frozen copy (change them with `configure`). */
  get options(): ResolvedOptions {
    return Object.freeze({ ...this.settings })
  }

  // ---- what anyone may do

  /**
   * Glides to a target: a position, an element, a selector or `#id`, or `'top'` / `'bottom'`; on a scroller that moves both ways,
   * also `{ x, y }`. Resolves `true` once it arrives and `false` if something else moves the scroller first or the target is not on
   * the page. With the reader's reduced-motion setting on (and `reducedMotion` left on), it moves at once.
   */
  scrollTo(target: SvifaTarget, options: ScrollToOptions = {}): Promise<boolean> {
    if (this.destroyed || (this.stopped && !options.force)) return Promise.resolve(false)
    this.sync()
    const goals = this.goalsOf(target, options.offset)
    if (goals === null) {
      console.warn('Svifa: nothing on the page matches the target', target)
      return Promise.resolve(false)
    }

    // a scroller that snaps is left to the browser, which puts every move on a snap point: there the move is made at once
    if (options.immediate || this.reduced?.matches || this.area.snaps) {
      this.jumpTo(goals)
      return Promise.resolve(true)
    }
    const there = (track: Track, i: number) => {
      const goal = goals[i]
      return goal === undefined || Math.abs(goal - track.value) < 0.5 / devicePixelRatio
    }
    if (!this.isGliding && this.tracks.every(there)) return Promise.resolve(true)

    // its own lerp or duration first, then Svifa's: a set duration (its own or Svifa's) makes it a timed glide
    const own = options.lerp !== undefined || options.duration !== undefined
    const how: How = {
      lerp: lerpOr(options.lerp, this.settings.lerp),
      duration: durationOr(own ? options.duration : this.settings.duration),
      easing: easingOr(options.easing, this.settings.easing),
      lock: options.lock,
    }
    return new Promise((done) => {
      this.glideTo(goals, how, true)
      this.finish = done
    })
  }

  /**
   * Changes how Svifa feels while the page is open: `lerp`, `duration`, `easing`, `wheel`, `wheelSpeed`, `nested`, `native`, `chain`
   * and `anchors`, each as described for the options. Each one given replaces the one in use, from the next glide or wheel turn;
   * `duration: undefined` goes back to gliding by `lerp`. A number that is not a finite one leaves that option as it was. The other
   * options belong to the scroller itself and are set when Svifa is made.
   *
   * @example
   * svifa.configure({ lerp: 0.05 }) // slower and softer
   * svifa.configure({ duration: 1.2, easing: (t) => 1 - (1 - t) ** 3 })
   */
  configure(changes: TunableOptions): void {
    if (this.destroyed) return
    const settings = this.settings
    if ('lerp' in changes) settings.lerp = lerpOr(changes.lerp, settings.lerp)
    if ('duration' in changes) {
      settings.duration = changes.duration === undefined ? undefined : (durationOr(changes.duration) ?? settings.duration)
    }
    if ('easing' in changes) settings.easing = easingOr(changes.easing, easeOut)
    if ('wheel' in changes) settings.wheel = changes.wheel !== false
    if ('wheelSpeed' in changes) settings.wheelSpeed = finiteOr(changes.wheelSpeed, settings.wheelSpeed)
    if ('nested' in changes) settings.nested = changes.nested !== false
    if ('native' in changes) settings.native = changes.native
    if ('chain' in changes) settings.chain = changes.chain !== false
    if ('anchors' in changes) {
      const had = Boolean(settings.anchors)
      settings.anchors = changes.anchors ?? false
      if (!had && settings.anchors) document.addEventListener('click', this.onClick)
      if (had && !settings.anchors) document.removeEventListener('click', this.onClick)
    }
  }

  /**
   * Stops where it is, for a dialog or menu: the wheel no longer moves the scroller until `start` (with svifa.css, neither do the
   * keyboard or the scroll bar).
   */
  stop(): void {
    if (this.stopped || this.destroyed) return
    const before = this.tracks.map((track) => track.value)
    this.halt()
    this.stopped = true
    this.area.holdGutter(true)
    this.mark()
    if (this.tracks.some((track, i) => track.value !== before[i])) this.emit()
  }

  /** Lets the scroller move again after `stop`. */
  start(): void {
    if (!this.stopped || this.destroyed) return
    this.stopped = false
    for (const track of this.tracks) track.value = track.goal = track.area.position
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
    if (!this.isGliding) return
    // A script that moved the scroller earlier in this frame, before its scroll event has been sent, has taken over: follow it.
    if (this.tracks.some((track) => track.written !== null && Math.abs(track.area.position - track.written) >= 1)) {
      this.halt()
      for (const track of this.tracks) this.follow(track, track.area.position)
      this.emit()
      for (const track of this.tracks) track.written = track.area.position
      return
    }

    const before = this.tracks.map((track) => track.value)
    const done = this.tracks.map((track) => this.step(track, dt))
    for (const [i, track] of this.tracks.entries()) {
      const report = track.report
      if (dt > 0 && track.motion) report.velocity = (track.value - before[i]) / dt
      if (track.value !== before[i]) report.direction = track.value > before[i] ? 1 : -1
    }

    const aimed = this.tracks.map((track) => track.motion?.to)
    const learned = this.draw()
    const finished: Track[] = []
    for (const [i, track] of this.tracks.entries()) {
      const motion = track.motion
      if (!motion) continue
      // a move that showed the browser's grid is judged again on it: drawn on the pixel of its end, the glide is there
      if (learned[i] && !done[i] && motion.kind === 'lerp' && this.arrived(track, motion.to)) done[i] = true
      // the first move showed the browser's grid and the end moved onto it: one more frame gets there
      if (done[i] && motion.to !== aimed[i]) done[i] = false
      if (!done[i]) continue
      // at rest the position is wherever the browser put the scroller (its own grid, or held short at an end), reported before the
      // last scroll event goes out so every listener sees where it stopped
      if (track.written !== null) track.value = track.written
      finished.push(track)
    }
    // the last frame of a glide is reported while it is still under way, as every frame of it is; then it rests
    if (this.tracks.some((track, i) => track.value !== before[i])) this.emit()
    for (const track of finished) track.motion = null
    if (!this.isGliding) this.arrive()
    else for (const track of finished) track.report.velocity = 0
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
    for (const track of this.tracks) clearTimeout(track.still)

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
      else (this.reduced as unknown as OlderMediaQueryList).removeListener(this.onMotionSetting)
    }
    this.keeper?.disconnect()
    this.listeners.clear()
    this.area.root.classList.remove(...CLASSES)
    // the sideways scroller first, so what both changed is put back last by the main one, as it was before either
    for (let i = this.tracks.length - 1; i >= 0; i--) this.tracks[i].area.destroy()
  }

  // ---- input

  private onWheel = (event: WheelEvent) => {
    // zooming, already handled by something else, or part of a gesture the browser has already begun scrolling on its own
    if (event.ctrlKey || event.defaultPrevented || !event.cancelable) return
    // stopped or locked, the wheel is held whatever the other settings (a box of its own inside still takes it)
    const holding = this.stopped || this.locked
    if (!holding && (!this.settings.wheel || this.reduced?.matches)) return

    const root = this.area.root
    const delta = wheelDelta(event, { width: root.clientWidth, height: root.clientHeight })
    const turns = this.tracks.length > 1 ? this.turnsBoth(event, delta) : this.turnOne(delta)
    if (!turns) return
    // a box inside that can still move the way the wheel turned takes it itself
    for (const { turn, sideways } of turns) {
      if (turn !== 0 && takenInside(event, root, sideways, turn, this.settings.nested, this.settings.native)) return
    }

    if (holding) {
      event.preventDefault()
      return
    }
    // scrolling switched off on the scroller (a dialog's scroll lock), or a scroller that snaps: the browser's own wheel stands
    const moving = turns.map(({ turn }, i) => (this.tracks[i].area.frozen ? 0 : turn))
    if (moving.every((turn) => turn === 0) || this.area.snaps) return

    this.sync()
    const goals: Goals = this.tracks.map(() => undefined)
    let chained = true
    for (const [i, track] of this.tracks.entries()) {
      const turn = moving[i]
      if (turn === 0) continue
      const limit = track.area.measure()
      const from = this.fromScrollTo ? track.value : track.goal
      const goal = Math.min(Math.max(from + turn * this.settings.wheelSpeed, 0), limit)
      // at its start or end the wheel goes on to whatever is around the scroller, as the browser's own scrolling does
      if (!(goal === from && (turn > 0 ? track.value >= limit - 0.5 : track.value <= 0.5))) chained = false
      goals[i] = goal
    }
    // every way the wheel turned is at its end: it goes on to whatever is around the scroller
    if (this.settings.chain && chained) return

    event.preventDefault()
    const how = { lerp: this.settings.lerp, duration: this.settings.duration, easing: this.settings.easing }
    this.glideTo(goals, how, false, event.timeStamp)
  }

  // A scroller that moves one way: the wheel's larger movement, or nothing when a vertical scroller is moved only sideways (a
  // trackpad's swipe back, a carousel), which is left to the browser. A horizontal scroller also takes the wheel's up and down.
  private turnOne({ x, y }: { x: number; y: number }): Turn[] | null {
    const sideways = Math.abs(x) > Math.abs(y)
    if (sideways && !this.area.horizontal) return null
    const turn = sideways ? x : y
    return turn === 0 ? null : [{ turn, sideways }]
  }

  // A scroller that moves both ways: each axis takes its own part, and a mouse wheel turned with Shift moves it sideways, as the
  // browser's own scrolling does.
  private turnsBoth(event: WheelEvent, { x, y }: { x: number; y: number }): Turn[] | null {
    if (event.shiftKey && x === 0) [x, y] = [y, 0]
    if (x === 0 && y === 0) return null
    return this.tracks.map(({ area }) => ({ turn: area.horizontal ? x : y, sideways: area.horizontal }))
  }

  // A finger on the screen or a middle-button press (the browser's autoscroll) takes over from a glide.
  private onTouch = () => {
    if (this.isGliding) this.halt()
  }

  private onPointerDown = (event: PointerEvent) => {
    if (event.button === 1 && this.isGliding) this.halt()
  }

  // A key that scrolls takes over from a glide at once. Some browsers (Firefox) scroll for a key a moment later, and Svifa's next
  // frame would otherwise undo it before it was seen.
  private onKey = (event: KeyboardEvent) => {
    if (!this.isGliding || event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey) return
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
    void this.scrollTo(element ?? 'top', options)
    const from = location.href
    if (url.href !== from) {
      history.pushState(history.state, '', url.href)
      if (fragmentOf(url.href) !== fragmentOf(from)) {
        // as the browser sends it: in a task of its own, after the address has changed
        setTimeout(() => window.dispatchEvent(new HashChangeEvent('hashchange', { oldURL: from, newURL: url.href })))
      }
    }
    // a click with no pointer behind it (Enter on the link) moves keyboard focus to the place: one with no count, or one of no
    // pointer type (Firefox counts Enter as one click)
    const keyboard = event.detail === 0 || (event as PointerEvent).pointerType === ''
    if (keyboard && element) focusPlace(element)
  }

  // ---- the browser's own scrolling

  private onScroll = () => {
    let taken = false
    for (const track of this.tracks) {
      const actual = track.area.position
      // the echo of Svifa's own last move (it arrives a frame later, even after a glide has ended): already drawn and reported
      if (actual === track.written) continue
      // within a pixel of Svifa's own move is the browser's rounding, not someone else; nor is a move in the moment a glide began
      if (track.motion && (track.written === null || Math.abs(actual - track.written) < 1)) continue
      taken = true
    }
    if (!taken) return
    // something else moved the scroller (a key, the scrollbar, find in page, the browser restoring a place): it wins, on every axis
    this.halt()
    for (const track of this.tracks) {
      track.written = null
      this.follow(track, track.area.position)
    }
    this.emit()
  }

  // A scroll of the browser's own (or a script's) along one axis: follow it, and let its scrollend through.
  private follow(track: Track, actual: number) {
    this.quietEnd = false
    const now = performance.now()
    const before = track.value
    const report = track.report
    track.value = track.goal = actual
    const dt = (now - track.lastNative) / 1000
    report.velocity = dt > 0 && dt < 0.25 ? (actual - before) / dt : 0
    if (actual !== before) report.direction = actual > before ? 1 : -1
    track.lastNative = now
    clearTimeout(track.still)
    track.still = setTimeout(() => (report.velocity = 0), 150)
  }

  // The browser sends a scrollend after each of Svifa's moves; they are held back while it glides, and one is sent when it arrives.
  // Only this scroller's own: a box inside it (or anywhere on the page) keeps its scrollend.
  private onScrollEnd = (event: Event) => {
    const own = this.area.isPage ? event.target === document || event.target === window : event.target === this.area.root
    if (own && this.quietEnd && !(event instanceof CustomEvent && event.detail?.svifa)) event.stopImmediatePropagation()
  }

  private onResize = () => {
    for (const track of this.tracks) track.area.measure()
  }

  // The reader turned reduced motion on or off: a glide under way finishes at once, and the subpixel class follows the setting.
  private onMotionSetting = () => {
    if (this.reduced?.matches && this.isGliding) {
      const finish = this.finish
      this.finish = null
      this.jumpTo(this.tracks.map((track) => (track.motion ? track.goal : undefined)))
      finish?.(true)
    }
    this.mark()
  }

  // ---- gliding

  // Where a target puts each axis Svifa moves (undefined: that axis stays), or null when it names nothing on the page. A number is the
  // main axis; `{ x, y }` names each; an element, a selector or a keyword names a place on every axis. `offset` is added the same way.
  private goalsOf(target: SvifaTarget, offset: number | Point | undefined): Goals | null {
    const point = isPoint(target) ? target : null
    const named = point ? null : resolve(target as Exclude<SvifaTarget, Point>, this.area)
    if (point && [point.x, point.y].some((value) => value !== undefined && !Number.isFinite(value))) return null
    if (!point && typeof named !== 'number' && !(named instanceof Element)) return null
    // an element inside a scrolling box of its own is first brought into view there, as a link to it would be
    if (named instanceof Element) reveal(named, this.area)
    return this.tracks.map((track) => {
      const area = track.area
      const isMain = track === this.main
      let found: number | undefined
      if (point) found = area.horizontal ? point.x : point.y
      else if (named instanceof Element) found = positionOf(named, area, (element) => this.drawnOffset(element, area))
      else if (typeof target === 'number') found = isMain ? (named as number) : undefined
      else found = resolve(target as Exclude<SvifaTarget, Point>, area) as number
      if (found === undefined) return undefined
      const by =
        typeof offset === 'object' && offset !== null ? (area.horizontal ? offset.x : offset.y) : isMain ? offset : undefined
      return Math.min(Math.max(found + finiteOr(by, 0), 0), area.measure())
    })
  }

  // How far an element is drawn from where the browser alone puts it along an axis (Svifa's drawing between pixels), so a position
  // measured mid-glide is exact.
  private drawnOffset(element: Element, area: Scroller) {
    return this.layer?.offsetOf(element, area.horizontal) ?? 0
  }

  // At rest, starts from where the browser has the scroller when it is somewhere else: a scroll of its own made a moment ago (a script,
  // the browser bringing an element into view) may not have been reported yet. Where it is not, the goal keeps the fraction of a pixel
  // earlier turns left, so small trackpad movements add up. (A quarter pixel is less than any device pixel, and far above rounding.)
  private sync() {
    if (this.isGliding) return
    for (const track of this.tracks) {
      const actual = track.area.position
      if (Math.abs(actual - track.value) >= 0.25) track.value = track.goal = actual
    }
  }

  // `since` is when the move was asked for (an input event's time), so the first frame moves by the time since then
  private glideTo(goals: Goals, how: How, fromScrollTo: boolean, since = performance.now()) {
    this.finish?.(false)
    this.finish = null
    this.fromScrollTo = fromScrollTo
    this.locked = Boolean(how.lock)
    this.quietEnd = true
    this.layer?.begin(!this.isGliding)
    for (const [i, track] of this.tracks.entries()) {
      const goal = goals[i]
      if (goal === undefined) continue
      track.goal = goal
      // A glide asked for from rest or by scrollTo owns the scroller from its first frame: a scroll the browser makes in this same
      // moment (a focus scrolling a field into view, a link's own jump) is not taken for someone else's, nor is its scrollend sent.
      if (!track.motion || fromScrollTo) track.written = null
      if (!track.motion) {
        track.origin = track.area.position
        track.moved = false
      }
      const to = this.layer ? track.area.restingPlace(goal) : goal
      if (how.duration !== undefined) {
        track.motion = { kind: 'timed', from: track.value, to, duration: how.duration, easing: how.easing ?? easeOut, elapsed: 0 }
      } else {
        track.motion = { kind: 'lerp', to, rate: (how.lerp ?? this.settings.lerp) * 60 }
      }
    }
    this.settle = this.layer?.settle
    this.mark()
    this.run(since)
  }

  // Moves one axis's glide on by `dt` seconds. Returns whether it is at its end (an axis at rest is too).
  private step(track: Track, dt: number) {
    const motion = track.motion
    if (!motion) return true
    if (motion.kind === 'timed') {
      motion.elapsed += dt
      const t = Math.min(1, motion.elapsed / motion.duration)
      track.value = t >= 1 ? motion.to : motion.from + (motion.to - motion.from) * motion.easing(t)
      return t >= 1
    }
    track.value = motion.to + (track.value - motion.to) * Math.exp(-motion.rate * dt)
    if (!this.arrived(track, motion.to)) return false
    track.value = motion.to
    return true
  }

  // Whether a lerp glide is there: drawn between pixels, once what is left is too little to see; otherwise once the browser would
  // draw it on the same device pixel as its end.
  private arrived(track: Track, to: number) {
    if (this.settle !== undefined) return Math.abs(to - track.value) <= this.settle
    return track.area.restingPlace(track.value) === track.area.restingPlace(to)
  }

  // Draws every moving axis where it is now. Returns, for each, whether this move showed that the browser keeps whole CSS pixels.
  private draw(): boolean[] {
    this.quietEnd = true
    const learned = this.tracks.map((track) => {
      const motion = track.motion
      if (!motion) return false
      const area = track.area
      const shown = area.moveTo(track.value)
      const actual = area.position
      // Held short of the place written, at the page's real end: the page ends nearer than it did when the glide began (its height is
      // not a whole pixel, or content went away). The glide ends where the page ends, and is never drawn past it.
      if (area.short && actual >= area.measure() - 1) {
        track.goal = Math.min(track.goal, actual)
        motion.to = Math.min(motion.to, actual)
        track.value = Math.min(track.value, actual)
      }
      track.written = actual
      if (actual !== track.origin) track.moved = true
      return shown
    })
    this.layer?.place(
      this.tracks.map((track) => track.value),
      this.tracks.map((track) => track.written ?? track.area.position)
    )
    // the browser turned out to keep whole CSS pixels: aim the glide under way at a place it can rest on
    for (const [i, track] of this.tracks.entries()) {
      if (learned[i] && this.layer && track.motion) track.motion.to = track.area.restingPlace(track.goal)
    }
    return learned
  }

  private arrive() {
    this.locked = false
    this.fromScrollTo = false
    for (const track of this.tracks) track.report.velocity = 0
    this.layer?.clear()
    this.mark()
    const finish = this.finish
    this.finish = null
    finish?.(true)
    // One scrollend for the whole glide (if it moved the scroller at all), unless another glide has begun by then. The browser's own
    // scrollend for Svifa's last move stays held back; the next scroll of the browser's own lets them through again.
    if (!this.tracks.some((track) => track.moved)) return
    requestAnimationFrame(() => {
      if (this.isGliding || this.destroyed) return
      const target = this.area.isPage ? document : this.area.root
      target.dispatchEvent(new CustomEvent('scrollend', { bubbles: this.area.isPage, detail: { svifa: true } }))
    })
  }

  // Stops a glide where the browser has the scroller, for whatever is taking over.
  private halt() {
    if (!this.isGliding) return
    for (const track of this.tracks) {
      track.motion = null
      track.written = null
      track.value = track.goal = track.area.position
    }
    this.locked = false
    this.fromScrollTo = false
    this.quietEnd = false
    this.layer?.clear()
    this.mark()
    const finish = this.finish
    this.finish = null
    finish?.(false)
  }

  // A move at once: like the browser's own, it is followed by its own scroll and scrollend events.
  private jumpTo(goals: Goals) {
    this.halt()
    this.quietEnd = false
    for (const [i, track] of this.tracks.entries()) {
      const goal = goals[i]
      if (goal === undefined) continue
      track.area.moveTo(goal)
      track.value = track.goal = track.written = track.area.position
      track.report.velocity = 0
    }
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
    if (this.isGliding && !this.destroyed) this.frame = requestAnimationFrame(this.tick)
  }

  private emit() {
    const set = this.listeners.get('scroll')
    // a copy on purpose: a listener added by another one during this call is first called on the next change, not this one
    // oxlint-disable-next-line unicorn/no-useless-spread
    if (set) for (const listener of [...set]) listener(this)
  }

  // The classes on the scroller's element: svifa (installed), svifa-gliding, svifa-stopped, and svifa-subpixel while Svifa can draw
  // between pixels (not while the reader asks for reduced motion, when it never glides). toggle() with a state touches the attribute
  // only when that class changes, so nothing else on the page is restyled and the keeper above never sees a change of Svifa's own.
  private mark() {
    if (this.destroyed) return
    const list = this.area.root.classList
    list.toggle('svifa', true)
    list.toggle('svifa-gliding', this.isGliding)
    list.toggle('svifa-stopped', this.stopped)
    list.toggle('svifa-subpixel', this.layer !== null && !this.reduced?.matches)
  }
}
