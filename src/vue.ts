// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Arcwright Studio

import { Svifa, type SvifaOptions } from '@arcwrightstudio/svifa'
import {
  defineComponent,
  inject,
  onBeforeUnmount,
  onMounted,
  provide,
  shallowRef,
  unref,
  watch,
  type DefineSetupFnComponent,
  type InjectionKey,
  type PropType,
  type Ref,
  type ShallowRef,
} from 'vue'
import { feelOf, subpixelKey, subpixelOf } from './adapter'

/** SmoothScroll's props: Svifa's options, with `scroller` also taking a template ref. */
export type SmoothScrollProps = Omit<SvifaOptions, 'scroller'> & {
  /** What scrolls: leave it out for the page, or pass an element or a ref to one (null, a ref not yet filled, waits for it). */
  scroller?: Window | Element | Ref<Element | null | undefined> | null
}

const SvifaKey: InjectionKey<Readonly<ShallowRef<Svifa | null>>> = Symbol('svifa')

// A flag left out stays out (Vue would otherwise read a missing Boolean prop as false), and one written alone is true.
const flag = { type: Boolean, default: undefined }
const PROPS = {
  scroller: { type: Object as PropType<SmoothScrollProps['scroller']>, default: undefined },
  axis: String as PropType<SmoothScrollProps['axis']>,
  lerp: Number,
  duration: Number,
  easing: Function as PropType<SmoothScrollProps['easing']>,
  wheel: flag,
  wheelSpeed: Number,
  nested: { type: [Boolean, String, Function] as PropType<SmoothScrollProps['nested']>, default: undefined },
  native: Function as PropType<SmoothScrollProps['native']>,
  chain: flag,
  subpixel: { type: [Boolean, String, Array, Function, Object] as PropType<SmoothScrollProps['subpixel']>, default: undefined },
  anchors: { type: [Boolean, Object] as PropType<SmoothScrollProps['anchors']>, default: undefined },
  snap: flag,
  reducedMotion: flag,
  autoRaf: flag,
}

/**
 * Smooth scrolling as a component. Render it once, near the root (in Nuxt, in `app.vue` or a layout); its props are Svifa's options.
 * Changing `lerp`, `duration`, `easing`, `wheel`, `wheelSpeed`, `nested`, `native`, `chain`, `anchors` or `snap` retunes the Svifa it
 * made; changing `scroller`, `axis`, `subpixel` (true, false or a selector), `reducedMotion` or `autoRaf` makes it again. Anything inside it
 * reaches the Svifa with `useSvifa`. It renders only what it holds.
 *
 * @example
 * <SmoothScroll :lerp="0.08" :anchors="{ offset: -80 }"><RouterView /></SmoothScroll>
 */
export const SmoothScroll: DefineSetupFnComponent<SmoothScrollProps> = defineComponent(
  (props: SmoothScrollProps, { slots }) => {
    const svifa = shallowRef<Svifa | null>(null)
    provide(SvifaKey, svifa)
    let mounted = false

    const takeOff = () => {
      svifa.value?.destroy()
      svifa.value = null
    }
    // what it scrolls makes it again
    const make = () => {
      takeOff()
      const scroller = unref(props.scroller)
      if (!mounted || scroller === null) return
      const { axis, reducedMotion, autoRaf } = props
      // a subpixel list or function is read through the props as they are, so a new one each time is no change
      const subpixel = subpixelOf(() => props.subpixel)
      svifa.value = new Svifa({ ...feelOf(props), scroller, axis, subpixel, reducedMotion, autoRaf })
    }
    onMounted(() => {
      mounted = true
      make()
    })
    onBeforeUnmount(() => {
      mounted = false
      takeOff()
    })
    watch(() => [unref(props.scroller), props.axis, subpixelKey(props.subpixel), props.reducedMotion, props.autoRaf], make)
    // how it feels is retuned in place
    watch(
      () => feelOf(props),
      (feel) => svifa.value?.configure(feel)
    )
    return () => slots.default?.()
  },
  { name: 'SmoothScroll', props: PROPS }
)

/**
 * The Svifa made by the nearest SmoothScroll, as a ref: null on the server and until it is made. Given `onScroll`, calls it with the
 * Svifa on every change of the scroll position, whatever moved it, for as long as the component is in the page.
 *
 * @example
 * const svifa = useSvifa()
 * // <button @click="svifa?.scrollTo('#pricing')">Pricing</button>
 */
export function useSvifa(onScroll?: (svifa: Svifa) => void): Readonly<ShallowRef<Svifa | null>> {
  const svifa = inject(SvifaKey, shallowRef(null))
  if (onScroll) {
    watch(
      svifa,
      (current, _, onCleanup) => {
        if (current) onCleanup(current.on('scroll', onScroll))
      },
      { immediate: true }
    )
  }
  return svifa
}
