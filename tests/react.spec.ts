// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Arcwright Studio

// The React entry, in a real React 19 app under StrictMode (which makes, takes off and makes again every effect in development).
import type { Page } from '@playwright/test'
import { mountApp, otherVersion } from './app'
import { expect, test } from './fixtures'

// SVIFA_REACT_DIR=<a node_modules folder> runs these with another React (React 18, say) in place of the one installed here
const plugins = otherVersion('react', ['react', 'react-dom'])

const APP = `
import { StrictMode, createElement as h, useEffect, useRef, useState, version } from 'react'
import { createRoot } from 'react-dom/client'
import { SmoothScroll, useSvifa } from '../src/react'

const w = window as any
w.reports = 0
w.reactVersion = version

function Probe() {
  const svifa = useSvifa(() => w.reports++)
  // runs after useSvifa's own effects, so its subscription is in place
  useEffect(() => {
    w.probe = svifa
  }, [svifa])
  return null
}

function Page() {
  const [lerp, setLerp] = useState(0.1)
  const [duration, setDuration] = useState<number | undefined>(undefined)
  const [axis, setAxis] = useState('vertical')
  const [on, setOn] = useState(true)
  w.setLerp = setLerp
  w.setDuration = setDuration
  w.setAxis = setAxis
  w.setOn = setOn
  // duration is passed only while it has a value, so taking it off leaves it out of the props altogether
  return on ? h(SmoothScroll, { lerp, axis, autoRaf: false, ...(duration === undefined ? {} : { duration }) }, h(Probe)) : null
}

function Box() {
  const box = useRef<HTMLDivElement>(null)
  return h('div', null,
    h('div', { id: 'box', ref: box, style: { height: '300px', overflow: 'auto' } }, h('div', { style: { height: '3000px' } })),
    h(SmoothScroll, { scroller: box, autoRaf: false }, h(Probe)))
}

// subpixel as a function, a new one on every render, as an inline arrow is
function Drawn() {
  const [tick, setTick] = useState(0)
  w.rerender = () => setTick(tick + 1)
  return h(SmoothScroll, { subpixel: () => document.querySelectorAll('.tall'), autoRaf: false }, h(Probe))
}

const roots = { page: Page, box: Box, drawn: Drawn }
createRoot(document.getElementById('root')!).render(h(StrictMode, null, h(roots[w.which as 'page' | 'box' | 'drawn'])))
`

async function mount(page: Page, which: 'page' | 'box' | 'drawn') {
  const errors = await mountApp(page, 'react', APP, { globals: { which }, esbuild: { plugins } })
  test.info().annotations.push({ type: 'react', description: await page.evaluate(() => (window as any).reactVersion) })
  return errors
}

test('SmoothScroll makes one Svifa (StrictMode included), retunes it when a prop changes or is taken off, and takes it off when it leaves', async ({
  page,
}) => {
  const errors = await mount(page, 'page')
  const first = await page.evaluate(() => {
    const w = window as any
    w.made = w.probe
    w.made.raf(1000)
    const prevented = w.wheel(window, 200)
    for (let t = 1016; w.made.isGliding; t += 16) w.made.raf(t)
    return {
      classes: document.documentElement.className,
      prevented,
      y: window.scrollY,
      reports: w.reports > 0,
      lerp: w.made.options.lerp,
    }
  })
  expect(first).toEqual({ classes: 'svifa', prevented: true, y: 200, reports: true, lerp: 0.1 })

  await page.evaluate(() => (window as any).setLerp(0.3))
  await page.waitForFunction(() => (window as any).probe.options.lerp === 0.3)
  // a prop taken off goes back to its default
  await page.evaluate(() => (window as any).setDuration(1.5))
  await page.waitForFunction(() => (window as any).probe.options.duration === 1.5)
  await page.evaluate(() => (window as any).setDuration(undefined))
  await page.waitForFunction(() => (window as any).probe.options.duration === undefined)
  expect(await page.evaluate(() => (window as any).probe === (window as any).made)).toBe(true)

  // what it scrolls makes it again
  await page.evaluate(() => (window as any).setAxis('horizontal'))
  await page.waitForFunction(() => (window as any).probe?.axis === 'horizontal')
  expect(await page.evaluate(() => (window as any).probe !== (window as any).made)).toBe(true)

  await page.evaluate(() => (window as any).setOn(false))
  await page.waitForFunction(() => document.documentElement.className === '')
  expect(errors).toEqual([])
})

test('SmoothScroll takes a ref to a scrolling element as its scroller', async ({ page }) => {
  const errors = await mount(page, 'box')
  const result = await page.evaluate(() => {
    const w = window as any
    const box = document.getElementById('box')!
    w.probe.raf(1000)
    const prevented = w.wheel(box, 150)
    for (let t = 1016; w.probe.isGliding; t += 16) w.probe.raf(t)
    return { element: w.probe.element.id, prevented, top: box.scrollTop, page: document.documentElement.className }
  })
  expect(result).toEqual({ element: 'box', prevented: true, top: 150, page: '' })
  expect(errors).toEqual([])
})

test('SmoothScroll draws the elements a subpixel function names, and a new function on each render is no change', async ({
  page,
}) => {
  const errors = await mount(page, 'drawn')
  const result = await page.evaluate(async () => {
    const w = window as any
    const made = w.probe
    w.rerender()
    await new Promise((resolve) => setTimeout(resolve, 50))
    made.raf(1000)
    w.wheel(window, 101)
    made.raf(1016)
    made.raf(1032)
    const drawn = (document.querySelector('.tall') as HTMLElement).style.translate
    return { same: w.probe === made, subpixel: document.documentElement.classList.contains('svifa-subpixel'), drawn }
  })
  expect(result.same).toBe(true)
  expect(result.subpixel).toBe(true)
  expect(result.drawn).not.toBe('')
  expect(errors).toEqual([])
})
