// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Arcwright Studio

import { Svifa, type SvifaOptions } from '@arcwrightstudio/svifa'
import { feelOf, subpixelKey, subpixelOf } from './adapter'
import {
  createContext,
  createElement,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
  type RefObject,
} from 'react'

/** SmoothScroll's props: Svifa's options (with `scroller` also taking a ref) and the children that can reach the Svifa. */
export type SmoothScrollProps = Omit<SvifaOptions, 'scroller'> & {
  /** What scrolls: leave it out for the page, or pass an element or a ref to one. */
  scroller?: Window | Element | RefObject<Element | null>
  /** What renders inside: anything there reaches the Svifa with `useSvifa`. */
  children?: ReactNode
}

const SvifaContext = createContext<Svifa | null>(null)

/**
 * Smooth scrolling as a component. Render it once, near the root (in Next.js, in the root layout); its props are Svifa's options.
 * Changing `lerp`, `duration`, `easing`, `wheel`, `wheelSpeed`, `nested`, `native`, `chain`, `anchors` or `snap` retunes the Svifa it
 * made, and one taken off goes back to its default; changing `scroller`, `axis`, `subpixel` (true, false or a selector), `reducedMotion` or
 * `autoRaf` makes it again. Anything rendered inside it
 * reaches the Svifa with `useSvifa`.
 *
 * @example
 * <SmoothScroll lerp={0.08} anchors={{ offset: -80 }}>{children}</SmoothScroll>
 */
export function SmoothScroll({ children, ...options }: SmoothScrollProps): ReactElement {
  const svifa = useMadeSvifa(options)
  return createElement(SvifaContext.Provider, { value: svifa }, children)
}

/**
 * The Svifa made by the nearest SmoothScroll: null on the server and until it is made. Given `onScroll`, calls it with the Svifa on
 * every change of the scroll position, whatever moved it.
 *
 * @example
 * const svifa = useSvifa()
 * return <button onClick={() => svifa?.scrollTo('#pricing')}>Pricing</button>
 */
export function useSvifa(onScroll?: (svifa: Svifa) => void): Svifa | null {
  const svifa = useContext(SvifaContext)
  const latest = useRef(onScroll)
  useEffect(() => {
    latest.current = onScroll
  })
  const listening = onScroll !== undefined
  useEffect(() => {
    if (!svifa || !listening) return
    return svifa.on('scroll', (current) => latest.current?.(current))
  }, [svifa, listening])
  return svifa
}

// Makes the Svifa once the component is in the page, and takes it off when it leaves. What it scrolls makes it again; how it feels is
// retuned in place. A `subpixel` list or function is read through the latest one given, so a new one on each render (an inline
// arrow) is not a change.
function useMadeSvifa(options: Omit<SmoothScrollProps, 'children'>) {
  const { scroller, axis, subpixel, reducedMotion, autoRaf } = options
  const [svifa, setSvifa] = useState<Svifa | null>(null)
  const latest = useRef(options)
  useEffect(() => {
    latest.current = options
  })
  const named = subpixelKey(subpixel)

  useEffect(() => {
    const target = scroller && 'current' in scroller ? (scroller.current ?? undefined) : scroller
    const source = subpixelOf(() => latest.current.subpixel)
    const made = new Svifa({ ...feelOf(latest.current), scroller: target, axis, subpixel: source, reducedMotion, autoRaf })
    setSvifa(made)
    return () => {
      made.destroy()
      setSvifa(null)
    }
  }, [scroller, axis, named, reducedMotion, autoRaf])

  useEffect(() => {
    svifa?.configure(feelOf(options))
  })
  return svifa
}
