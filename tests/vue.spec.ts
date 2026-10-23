// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Arcwright Studio

// The Vue entry, in a real Vue 3 app.
import type { Page } from '@playwright/test'
import { glide, mountApp, otherVersion } from './app'
import { expect, test } from './fixtures'

const APP = `
import { createApp, defineComponent, h, ref, watchEffect } from 'vue'
import { SmoothScroll, useSvifa } from '../src/vue'

const w = window as any
w.reports = 0

const Probe = defineComponent(() => {
  const svifa = useSvifa(() => w.reports++)
  watchEffect(() => (w.probe = svifa.value))
  return () => null
})

const lerp = ref(0.1)
const duration = ref<number | undefined>(undefined)
const axis = ref('vertical')
const on = ref(true)
Object.assign(w, {
  setLerp: (value: number) => (lerp.value = value),
  setDuration: (value: number | undefined) => (duration.value = value),
  setAxis: (value: string) => (axis.value = value),
  setOn: (value: boolean) => (on.value = value),
})

const Page = defineComponent(() => () =>
  on.value ? h(SmoothScroll, { lerp: lerp.value, duration: duration.value, axis: axis.value, autoRaf: false }, () => h(Probe)) : null
)

const Box = defineComponent(() => {
  const box = ref<HTMLElement | null>(null)
  return () =>
    h('div', null, [
      h('div', { id: 'box', ref: box, style: 'height: 300px; overflow: auto' }, h('div', { style: 'height: 3000px' })),
      h(SmoothScroll, { scroller: box, autoRaf: false }, () => h(Probe)),
    ])
})

// subpixel as a list of elements
const Drawn = defineComponent(() => () => h(SmoothScroll, { subpixel: [document.querySelector('.tall')!], autoRaf: false }, () => h(Probe)))

// a flag written alone in a template arrives as an empty string
const Flags = defineComponent(() => () => h(SmoothScroll, { anchors: '', autoRaf: false }, () => h(Probe)))

createApp({ Page, Box, Flags, Drawn }[w.which as 'Page' | 'Box' | 'Flags' | 'Drawn']).mount('#root')
`

const VUE = {
  plugins: otherVersion('vue', ['vue']),
  define: { __VUE_OPTIONS_API__: 'true', __VUE_PROD_DEVTOOLS__: 'false', __VUE_PROD_HYDRATION_MISMATCH_DETAILS__: 'false' },
}
const mount = (page: Page, which: 'Page' | 'Box' | 'Flags' | 'Drawn') =>
  mountApp(page, 'vue', APP, { globals: { which }, esbuild: VUE })

test('SmoothScroll makes one Svifa, retunes it, makes it again when what it scrolls changes, and takes it off when it leaves', async ({
  page,
}) => {
  const errors = await mount(page, 'Page')
  const first = await page.evaluate(() => {
    const w = window as any
    w.made = w.probe
    const prevented = w.wheel(window, 200)
    return {
      classes: [...document.documentElement.classList].filter((name) => name !== 'svifa-subpixel').join(' '),
      prevented,
      lerp: w.made.options.lerp,
    }
  })
  expect(first).toEqual({ classes: 'svifa svifa-gliding', prevented: true, lerp: 0.1 })
  await glide(page)
  expect(await page.evaluate(() => [window.scrollY, (window as any).reports > 0])).toEqual([200, true])

  await page.evaluate(() => (window as any).setLerp(0.3))
  await page.waitForFunction(() => (window as any).probe.options.lerp === 0.3)
  // a prop taken off goes back to its default
  await page.evaluate(() => (window as any).setDuration(1.5))
  await page.waitForFunction(() => (window as any).probe.options.duration === 1.5)
  await page.evaluate(() => (window as any).setDuration(undefined))
  await page.waitForFunction(() => (window as any).probe.options.duration === undefined)
  expect(await page.evaluate(() => (window as any).probe === (window as any).made)).toBe(true)

  await page.evaluate(() => (window as any).setAxis('horizontal'))
  await page.waitForFunction(() => (window as any).probe?.axis === 'horizontal')
  expect(await page.evaluate(() => (window as any).probe !== (window as any).made)).toBe(true)

  await page.evaluate(() => (window as any).setOn(false))
  await page.waitForFunction(() => document.documentElement.className === '')
  expect(errors).toEqual([])
})

test('SmoothScroll takes a template ref to a scrolling element as its scroller', async ({ page }) => {
  const errors = await mount(page, 'Box')
  const result = await page.evaluate(() => {
    const w = window as any
    return { element: w.probe.element.id, prevented: w.wheel(document.getElementById('box'), 150) }
  })
  expect(result).toEqual({ element: 'box', prevented: true })
  await glide(page)
  expect(await page.evaluate(() => [document.getElementById('box')!.scrollTop, document.documentElement.className])).toEqual([
    150,
    '',
  ])
  expect(errors).toEqual([])
})

test('a flag written alone is on, and one left out keeps its default', async ({ page }) => {
  const errors = await mount(page, 'Flags')
  const options = await page.evaluate(() => {
    const { anchors, wheel, nested, chain, reducedMotion, snap } = (window as any).probe.options
    return { anchors, wheel, nested, chain, reducedMotion, snap }
  })
  expect(options).toEqual({ anchors: true, wheel: true, nested: true, chain: true, reducedMotion: true, snap: false })
  expect(errors).toEqual([])
})

test('SmoothScroll draws the elements of a subpixel list between pixels', async ({ page }) => {
  const errors = await mount(page, 'Drawn')
  const drawn = await page.evaluate(() => {
    const w = window as any
    w.probe.raf(1000)
    w.wheel(window, 101)
    w.probe.raf(1016)
    w.probe.raf(1032)
    return (document.querySelector('.tall') as HTMLElement).style.translate
  })
  expect(drawn).not.toBe('')
  expect(errors).toEqual([])
})
