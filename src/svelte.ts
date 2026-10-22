// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Arcwright Studio

import { Svifa, type SvifaOptions } from '@arcwrightstudio/svifa'
import { getContext, onMount, setContext } from 'svelte'
import { readable, writable, type Readable } from 'svelte/store'

/** smoothScroll's options: Svifa's, with `scroller` also taking a function, read once the component is in the page. */
export type SmoothScrollOptions = Omit<SvifaOptions, 'scroller'> & {
  /** What scrolls: leave it out for the page, or pass an element or a function that returns one (an element bound with `bind:this`). */
  scroller?: Window | Element | (() => Window | Element | null | undefined)
}

const SvifaKey = Symbol('svifa')

/**
 * Smooth scrolling for a component and everything inside it: call it while the component starts (in its `<script>`), once, near the
 * root (in SvelteKit, `src/routes/+layout.svelte`). The Svifa is made once the component is in the page and taken off when it leaves.
 * Returns a store of it, null on the server and until it is made; components inside reach the same store with `useSvifa`. Change how
 * it feels with `$svifa?.configure({ lerp })`.
 *
 * @example
 * const svifa = smoothScroll({ lerp: 0.08, anchors: { offset: -80 } })
 * // <button onclick={() => $svifa?.scrollTo('#pricing')}>Pricing</button>
 */
export function smoothScroll(options: SmoothScrollOptions = {}): Readable<Svifa | null> {
  const store = writable<Svifa | null>(null)
  const shared: Readable<Svifa | null> = { subscribe: store.subscribe }
  setContext(SvifaKey, shared)
  onMount(() => {
    const scroller = typeof options.scroller === 'function' ? options.scroller() : options.scroller
    if (scroller === null) return
    const made = new Svifa({ ...options, scroller })
    store.set(made)
    return () => {
      made.destroy()
      store.set(null)
    }
  })
  return shared
}

/**
 * The store of the Svifa made by `smoothScroll` in a component around this one: null on the server and until it is made. Given
 * `onScroll`, calls it with the Svifa on every change of the scroll position, whatever moved it, while this component is in the page.
 * Call it while the component starts.
 *
 * @example
 * let progress = $state(0)
 * useSvifa((svifa) => (progress = svifa.progress))
 */
export function useSvifa(onScroll?: (svifa: Svifa) => void): Readable<Svifa | null> {
  const store = getContext<Readable<Svifa | null> | undefined>(SvifaKey) ?? readable(null)
  if (onScroll) {
    onMount(() => {
      let off: (() => void) | undefined
      const stop = store.subscribe((svifa) => {
        off?.()
        off = svifa?.on('scroll', onScroll)
      })
      return () => {
        stop()
        off?.()
      }
    })
  }
  return store
}
