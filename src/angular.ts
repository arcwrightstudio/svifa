// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Arcwright Studio

import { Svifa, type SvifaOptions } from '@arcwrightstudio/svifa'
import {
  DestroyRef,
  InjectionToken,
  NgZone,
  afterNextRender,
  effect,
  inject,
  makeEnvironmentProviders,
  provideEnvironmentInitializer,
  signal,
  type EnvironmentProviders,
  type Signal,
  type WritableSignal,
} from '@angular/core'

// the Svifa made by provideSmoothScroll, for anything in the app to reach
const PAGE = new InjectionToken<WritableSignal<Svifa | null>>('svifa', { providedIn: 'root', factory: () => signal(null) })

// Makes a Svifa once the app has first rendered (only in the browser), outside Angular's zone so a glide's frames do not run change
// detection, and takes it off when `destroyRef` is destroyed.
function make(into: WritableSignal<Svifa | null>, options: SvifaOptions | (() => SvifaOptions)) {
  const zone = inject(NgZone)
  let made: Svifa | null = null
  afterNextRender(() => {
    const given = typeof options === 'function' ? options() : options
    made = zone.runOutsideAngular(() => new Svifa(given))
    into.set(made)
  })
  inject(DestroyRef).onDestroy(() => {
    made?.destroy()
    made = null
    into.set(null)
  })
}

/**
 * Smooth scrolling for the whole page, in the app's providers (`app.config.ts`). Anything in the app reaches the Svifa with
 * `injectSvifa`. With server rendering, it is made only in the browser.
 *
 * @example
 * export const appConfig: ApplicationConfig = { providers: [provideSmoothScroll({ anchors: { offset: -80 } })] }
 */
export function provideSmoothScroll(options: SvifaOptions = {}): EnvironmentProviders {
  return makeEnvironmentProviders([provideEnvironmentInitializer(() => make(inject(PAGE), options))])
}

/**
 * The Svifa made by provideSmoothScroll, as a signal: null on the server and until it is made. Given `onScroll`, calls it with the
 * Svifa on every change of the scroll position, whatever moved it, until the component (or service) is destroyed. Call it in an
 * injection context: a constructor or a field.
 *
 * @example
 * private svifa = injectSvifa()
 * toTop() { this.svifa()?.scrollTo('top') }
 */
export function injectSvifa(onScroll?: (svifa: Svifa) => void): Signal<Svifa | null> {
  const svifa = inject(PAGE).asReadonly()
  if (onScroll) {
    effect((onCleanup) => {
      const current = svifa()
      if (current) onCleanup(current.on('scroll', onScroll))
    })
  }
  return svifa
}

/**
 * A Svifa of a component's own, for a scrolling element in it: made once the component has first rendered, taken off when it is
 * destroyed, as a signal (null until then). `options` may be a function, read once rendered, so it can name an element from a view
 * query. Call it in an injection context: a constructor or a field.
 *
 * @example
 * private box = viewChild.required<ElementRef<HTMLElement>>('box')
 * private svifa = createSvifa(() => ({ scroller: this.box().nativeElement }))
 */
export function createSvifa(options: SvifaOptions | (() => SvifaOptions) = {}): Signal<Svifa | null> {
  const svifa = signal<Svifa | null>(null)
  make(svifa, options)
  return svifa.asReadonly()
}
