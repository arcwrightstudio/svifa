// The React entry, in a real React 19 app under StrictMode (which makes, takes off and makes again every effect in development).
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Page } from '@playwright/test'
import { expect, test } from './fixtures'
import { build } from 'esbuild'
import { ORIGIN, open } from './setup'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const APP_URL = `${ORIGIN}/react-app.js`
// SVIFA_REACT_DIR=<a node_modules folder> runs these with another React (React 18, say) in place of the one installed here
const OTHER = process.env.SVIFA_REACT_DIR
const alias = OTHER ? { react: join(OTHER, 'react'), 'react-dom': join(OTHER, 'react-dom') } : undefined

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
  const [axis, setAxis] = useState('vertical')
  const [on, setOn] = useState(true)
  w.setLerp = setLerp
  w.setAxis = setAxis
  w.setOn = setOn
  return on ? h(SmoothScroll, { lerp, axis, autoRaf: false }, h(Probe)) : null
}

function Box() {
  const box = useRef<HTMLDivElement>(null)
  return h('div', null,
    h('div', { id: 'box', ref: box, style: { height: '300px', overflow: 'auto' } }, h('div', { style: { height: '3000px' } })),
    h(SmoothScroll, { scroller: box, autoRaf: false }, h(Probe)))
}

createRoot(document.getElementById('root')!).render(h(StrictMode, null, h(w.which === 'box' ? Box : Page)))
`

async function mount(page: Page, which: 'page' | 'box') {
  const bundled = await build({
    stdin: { contents: APP, resolveDir: fileURLToPath(new URL('.', import.meta.url)), loader: 'tsx' },
    absWorkingDir: ROOT,
    bundle: true,
    format: 'iife',
    write: false,
    define: { 'process.env.NODE_ENV': '"development"', __VERSION__: '"test"' },
    alias,
    logLevel: 'silent',
    // a coverage run maps what ran back to src/ through it
    sourcemap: 'inline',
  })
  const errors: string[] = []
  page.on('console', (message) => message.type() === 'error' && errors.push(message.text()))
  page.on('pageerror', (error) => errors.push(String(error)))
  await open(page, '<div id="root"></div><div class="tall"></div>')
  await page.evaluate((which) => ((window as any).which = which), which)
  // served from an address of its own, as the script build is (the route registered last is asked first)
  await page.route(APP_URL, (route) => route.fulfill({ contentType: 'text/javascript', body: bundled.outputFiles[0].text }))
  await page.addScriptTag({ url: APP_URL })
  await page.waitForFunction(() => (window as any).probe != null, null, { timeout: 5000 })
  test.info().annotations.push({ type: 'react', description: await page.evaluate(() => (window as any).reactVersion) })
  return errors
}

test('SmoothScroll makes one Svifa (StrictMode included), retunes it when a prop changes, and takes it off when it leaves', async ({
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
