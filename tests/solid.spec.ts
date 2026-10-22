// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Arcwright Studio

// The Solid entry, in a real Solid app.
import type { Page } from '@playwright/test'
import { glide, mountApp, otherVersion } from './app'
import { expect, test } from './fixtures'

const APP = `
import { createComponent, createEffect, createSignal } from 'solid-js'
import { render } from 'solid-js/web'
import { SmoothScroll, useSvifa } from '../src/solid'

const w = window as any
w.reports = 0

function Probe() {
  const svifa = useSvifa(() => w.reports++)
  createEffect(() => (w.probe = svifa()))
  return null
}

const [lerp, setLerp] = createSignal(0.1)
const [duration, setDuration] = createSignal<number | undefined>(undefined)
const [axis, setAxis] = createSignal('vertical')
const [on, setOn] = createSignal(true)
Object.assign(w, { setLerp, setDuration, setAxis, setOn })

function Page() {
  return () =>
    on()
      ? createComponent(SmoothScroll, {
          get lerp() { return lerp() },
          get duration() { return duration() },
          get axis() { return axis() as any },
          autoRaf: false,
          get children() { return createComponent(Probe, {}) },
        })
      : null
}

function Box() {
  const box = document.createElement('div')
  box.id = 'box'
  box.style.cssText = 'height: 300px; overflow: auto'
  box.append(Object.assign(document.createElement('div'), { style: 'height: 3000px' }))
  return [box, createComponent(SmoothScroll, { scroller: () => box, autoRaf: false, get children() { return createComponent(Probe, {}) } })]
}

render(() => createComponent(w.which === 'box' ? Box : Page, {}), document.getElementById('root')!)
`

const mount = (page: Page, which: 'page' | 'box') =>
  mountApp(page, 'solid', APP, { globals: { which }, esbuild: { plugins: otherVersion('solid', ['solid-js']) } })

test('SmoothScroll makes one Svifa, retunes it, makes it again when what it scrolls changes, and takes it off when it leaves', async ({
  page,
}) => {
  const errors = await mount(page, 'page')
  const first = await page.evaluate(() => {
    const w = window as any
    w.made = w.probe
    const prevented = w.wheel(window, 200)
    return { classes: document.documentElement.className, prevented, lerp: w.made.options.lerp }
  })
  expect(first).toEqual({ classes: 'svifa svifa-gliding', prevented: true, lerp: 0.1 })
  await glide(page)
  expect(await page.evaluate(() => [window.scrollY, (window as any).reports > 0])).toEqual([200, true])

  await page.evaluate(() => (window as any).setLerp(0.3))
  await page.waitForFunction(() => (window as any).probe.options.lerp === 0.3)
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

test('SmoothScroll takes a function that returns a scrolling element as its scroller', async ({ page }) => {
  const errors = await mount(page, 'box')
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
