// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Arcwright Studio

import { Svifa, type SvifaOptions } from '@arcwrightstudio/svifa'
import {
  createComponent,
  createContext,
  createEffect,
  createSignal,
  on,
  onCleanup,
  untrack,
  useContext,
  type Accessor,
  type JSX,
} from 'solid-js'
import { feelOf, subpixelKey, subpixelOf } from './adapter'

/** SmoothScroll's props: Svifa's options (with `scroller` also taking a function) and what renders inside. */
export type SmoothScrollProps = Omit<SvifaOptions, 'scroller'> & {
  /** What scrolls: leave it out for the page, or pass an element or a function that returns one (an element set with `ref`). */
  scroller?: Window | Element | (() => Window | Element | null | undefined)
  /** What renders inside: anything there reaches the Svifa with `useSvifa`. */
  children?: JSX.Element
}

const SvifaContext = createContext<Accessor<Svifa | null>>(() => null)

/**
 * Smooth scrolling as a component. Render it once, near the root; its props are Svifa's options. Changing `lerp`, `duration`,
 * `easing`, `wheel`, `wheelSpeed`, `nested`, `native`, `chain`, `anchors` or `snap` retunes the Svifa it made; changing `scroller`,
 * `axis`, `subpixel` (as a selector), `reducedMotion` or `autoRaf` makes it again. Anything inside it reaches the Svifa with
 * `useSvifa`. On the server it renders only what it holds.
 *
 * @example
 * <SmoothScroll lerp={0.08} anchors={{ offset: -80 }}>{props.children}</SmoothScroll>
 */
export function SmoothScroll(props: SmoothScrollProps): JSX.Element {
  const [svifa, setSvifa] = createSignal<Svifa | null>(null)
  const scroller = () => (typeof props.scroller === 'function' ? props.scroller() : props.scroller)
  // what it scrolls makes it again (an effect runs only in the browser, once the component is in the page)
  createEffect(
    on(
      [scroller, () => props.axis, () => subpixelKey(props.subpixel), () => props.reducedMotion, () => props.autoRaf],
      ([target, axis, , reducedMotion, autoRaf]) => {
        if (target === null) return
        // a subpixel list or function is read through the props as they are, so a new one each time is no change
        const made = untrack(
          () =>
            new Svifa({
              ...feelOf(props),
              scroller: target,
              axis,
              subpixel: subpixelOf(() => props.subpixel),
              reducedMotion,
              autoRaf,
            })
        )
        setSvifa(made)
        onCleanup(() => {
          made.destroy()
          setSvifa(null)
        })
      }
    )
  )
  // how it feels is retuned in place
  createEffect(() => {
    const feel = feelOf(props)
    svifa()?.configure(feel)
  })
  return createComponent(SvifaContext.Provider, {
    value: svifa,
    get children() {
      return props.children
    },
  })
}

/**
 * The Svifa made by the nearest SmoothScroll, as an accessor: null on the server and until it is made. Given `onScroll`, calls it with
 * the Svifa on every change of the scroll position, whatever moved it, while the component is in the page.
 *
 * @example
 * const svifa = useSvifa()
 * return <button onClick={() => svifa()?.scrollTo('#pricing')}>Pricing</button>
 */
export function useSvifa(onScroll?: (svifa: Svifa) => void): Accessor<Svifa | null> {
  const svifa = useContext(SvifaContext)
  if (onScroll) {
    createEffect(() => {
      const current = svifa()
      if (current) onCleanup(current.on('scroll', onScroll))
    })
  }
  return svifa
}
