// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Arcwright Studio

// Snapping (snap: true): a scroller with scroll-snap-type glides to the snap points its CSS sets, and rests where the browser itself
// would let it rest.
import type { Page } from '@playwright/test'
import { expect, test } from './fixtures'
import { open, settle } from './setup'

const SECTIONS = '<section></section>'.repeat(8)
const SECTION_CSS = 'section { height: 800px; scroll-snap-align: start; box-sizing: border-box; border-bottom: 1px solid #999; }'

// Opens eight 800px sections on a page that snaps as `type` says, with Svifa snapping it (window.g).
async function sections(page: Page, type = 'y mandatory', css = '', options = '{}') {
  await open(page, SECTIONS, `html { scroll-snap-type: ${type}; } ${SECTION_CSS} ${css}`)
  await page.evaluate((options) => {
    const w = window as any
    w.g = new w.Svifa({ autoRaf: false, snap: true, ...JSON.parse(options) })
    w.frame(w.g)
  }, options)
}

// A movement of the wheel made of `turns` turns of `delta` pixels, a frame apart, as a trackpad sends them; returns where it is heading.
async function turns(page: Page, delta: number, count: number, target = 'window') {
  return page.evaluate(
    ({ delta, count, target }) => {
      const w = window as any
      const on = target === 'window' ? window : document.querySelector(target)
      for (let i = 0; i < count; i++) {
        w.wheel(on, delta)
        w.frame(w.g)
      }
      return w.g.target
    },
    { delta, count, target }
  )
}

// Where the scroller is a moment after the glide rests, once the browser has had time to snap it itself.
async function restingY(page: Page) {
  await page.waitForTimeout(150)
  return page.evaluate(() => window.scrollY)
}

test.describe('snapping', () => {
  test('a notch glides to the next snap point, with the browser snapping held off until it rests there', async ({ page }) => {
    await sections(page)
    const start = await page.evaluate(() => {
      const w = window as any
      const prevented = w.wheel(window, 100)
      return { prevented, target: w.g.target, held: document.documentElement.style.scrollSnapType }
    })
    expect(start).toEqual({ prevented: true, target: 800, held: 'none' })
    const path = await settle(page)
    expect(path.length).toBeGreaterThan(20)
    for (let i = 1; i < path.length; i++) expect(path[i]).toBeGreaterThanOrEqual(path[i - 1])
    expect(path.at(-1)).toBe(800)
    expect(await page.evaluate(() => document.documentElement.style.scrollSnapType)).toBe('')
    expect(await restingY(page)).toBe(800)
  })

  test("puts the page's own inline scroll-snap-type back when it rests, and when it is taken off mid-glide", async ({ page }) => {
    await open(page, SECTIONS, SECTION_CSS)
    const result = await page.evaluate(() => {
      const w = window as any
      const root = document.documentElement
      root.style.scrollSnapType = 'y mandatory'
      w.g = new w.Svifa({ autoRaf: false, snap: true })
      w.frame(w.g)
      w.wheel(window, 100)
      const during = root.style.scrollSnapType
      while (w.g.isGliding) w.frame(w.g)
      const rested = root.style.scrollSnapType
      w.wheel(window, 100)
      w.frame(w.g, 60, 3)
      w.g.destroy()
      return { during, rested, destroyed: root.style.scrollSnapType }
    })
    expect(result).toEqual({ during: 'none', rested: 'y mandatory', destroyed: 'y mandatory' })
  })

  test('a trackpad swipe moves one snap point; turns after a pause each move one more', async ({ page }) => {
    await sections(page)
    expect(await turns(page, 6, 40)).toBe(800)
    expect((await settle(page)).at(-1)).toBe(800)
    for (const expected of [1600, 2400]) {
      await page.waitForTimeout(200)
      expect(await turns(page, 100, 1)).toBe(expected)
      await page.evaluate(() => (window as any).frame((window as any).g, 60, 4))
    }
    await page.waitForTimeout(200)
    expect(await turns(page, -100, 1)).toBe(1600)
    expect((await settle(page)).at(-1)).toBe(1600)
  })

  test('a long movement goes as far as the wheel would, and rests on the snap point nearest', async ({ page }) => {
    await sections(page)
    // the first turn goes on to 800, and the movement carries on from there: 800 + 1500 is nearest 2400
    expect(await turns(page, 100, 16)).toBe(2400)
    expect((await settle(page)).at(-1)).toBe(2400)
    expect(await restingY(page)).toBe(2400)
  })

  test('with proximity, a small turn moves on to the next point, and one far from any point rests where the wheel takes it', async ({
    page,
  }) => {
    await sections(page, 'y proximity')
    expect(await turns(page, 100, 1)).toBe(800)
    await settle(page)
    expect(await restingY(page)).toBe(800)
    await page.waitForTimeout(200)
    // 800 + 1150 = 1950: more than a third of the visible area from 1600 and 2400, so no browser snaps it there
    expect(await turns(page, 50, 23)).toBe(1950)
    await settle(page)
    expect(await restingY(page)).toBe(1950)
  })

  test('never passes over a scroll-snap-stop: always point', async ({ page }) => {
    await sections(page, 'y mandatory', 'section:nth-child(3) { scroll-snap-stop: always; }')
    expect(await turns(page, 100, 40)).toBe(1600)
    expect((await settle(page)).at(-1)).toBe(1600)
  })

  test('reads an area longer than the visible area from end to end where the browser lets it, then goes on', async ({ page }) => {
    await sections(page, 'y mandatory', 'section:nth-child(2) { height: 2000px; }')
    // section 2 runs from 800 to 2800, so the visible area may rest anywhere from 800 to 2000 inside it, where the browser allows that
    // (one that rests only on aligned edges goes on to the next section instead)
    const inside = await page.evaluate(() => {
      window.scrollTo({ top: 900, behavior: 'instant' })
      const kept = window.scrollY === 900
      ;(window as any).g.scrollTo(800, { immediate: true })
      return kept
    })
    await page.waitForTimeout(200)
    const first = inside ? 900 : 2800
    expect(await turns(page, 100, 1)).toBe(first)
    await settle(page)
    expect(await restingY(page)).toBe(first)
    await page.evaluate(() => (window as any).g.scrollTo(2000, { immediate: true }))
    await page.waitForTimeout(200)
    expect(await turns(page, 100, 1)).toBe(2800)
    await settle(page)
    expect(await restingY(page)).toBe(2800)
  })

  // mixed alignments, scroll-padding and scroll-margin, a snap area inside display: contents, and one that belongs to a scroller of its
  // own (it snaps there, not on the page)
  const MIXED = `<div style="height: 300px"></div>
      <section style="height: 500px; scroll-snap-align: start; scroll-margin-top: 40px"></section>
      <section style="height: 300px; scroll-snap-align: center"></section>
      <section style="height: 650px; scroll-snap-align: end; scroll-margin-bottom: 25px"></section>
      <div style="display: contents"><section style="height: 420px; scroll-snap-align: center"></section></div>
      <section style="height: 700px; scroll-snap-align: start"></section>
      <div style="overflow: auto; height: 300px"><section style="height: 900px; scroll-snap-align: start"></section></div>
      <section style="height: 380px; scroll-snap-align: start"></section>
      <div style="height: 2000px"></div>`
  const MIXED_CSS = 'html { scroll-snap-type: y mandatory; scroll-padding: 60px 0 30px; }'

  test('scrollTo rests exactly where the browser itself would snap, whatever the alignment, padding and margins', async ({
    page,
  }) => {
    await open(page, `${MIXED}<section style="height: 1700px; scroll-snap-align: start"></section>`, MIXED_CSS)
    const results = await page.evaluate(() => {
      const w = window as any
      const g = new w.Svifa({ autoRaf: false, snap: true })
      const root = document.documentElement
      const limit = root.scrollHeight - root.clientHeight
      const seen: { at: number; svifa: number; browser: number }[] = []
      for (let at = 0; at <= limit; at += 37) {
        // the browser's own: written with its snapping on, it puts the scroller on the snap position it picks
        window.scrollTo({ top: at, behavior: 'instant' })
        const browser = window.scrollY
        root.style.scrollSnapType = 'none'
        window.scrollTo({ top: 0, behavior: 'instant' })
        root.style.scrollSnapType = ''
        // Svifa's own, as the place it aims at: moved there at once, the browser would snap a wrong place to its own
        g.scrollTo(at)
        const svifa = g.isGliding ? g.target : window.scrollY
        g.stop()
        g.start()
        seen.push({ at, svifa, browser })
      }
      return seen
    })
    expect(results.filter(({ svifa, browser }) => Math.abs(svifa - browser) >= 0.5)).toEqual([])
  })

  // Every place the browser itself rests the page at, read pixel by pixel; then single notches from the top, each after a pause, must
  // visit exactly those places in order, and the browser must leave each rest where it is.
  async function visitsEveryPlace(page: Page) {
    const places = await page.evaluate(() => {
      const root = document.documentElement
      const found: number[] = []
      for (let at = 0; at <= root.scrollHeight - root.clientHeight; at++) {
        window.scrollTo({ top: at, behavior: 'instant' })
        if (!found.includes(window.scrollY)) found.push(window.scrollY)
      }
      window.scrollTo({ top: 0, behavior: 'instant' })
      return found.sort((a, b) => a - b)
    })
    expect(places.length).toBeGreaterThan(3)
    await page.evaluate(() => {
      const w = window as any
      w.g = new w.Svifa({ autoRaf: false, snap: true })
      w.frame(w.g)
    })
    const visited = [await page.evaluate(() => window.scrollY)]
    while (visited.length <= places.length) {
      await page.waitForTimeout(150)
      await turns(page, 100, 1)
      await settle(page)
      const at = await restingY(page)
      if (at === visited.at(-1)) break
      visited.push(at)
    }
    expect(visited).toEqual(places)
  }

  test('one notch at a time visits every snap point in order, and the browser leaves each rest as it is', async ({ page }) => {
    await open(page, MIXED, MIXED_CSS)
    await visitsEveryPlace(page)
  })

  test('reads the snap points inside a component, and leaves out a child no slot shows', async ({ page }) => {
    await open(
      page,
      `<section style="height: 800px; scroll-snap-align: start"></section>
      <x-panels><div style="height: 50px; scroll-snap-align: start">not shown</div></x-panels>
      <section style="height: 800px; scroll-snap-align: start"></section>
      <div style="height: 2000px"></div>`,
      'html { scroll-snap-type: y mandatory; }'
    )
    await page.evaluate(() => {
      customElements.define(
        'x-panels',
        class extends HTMLElement {
          constructor() {
            super()
            this.attachShadow({ mode: 'open' }).innerHTML =
              '<div style="height: 300px; scroll-snap-align: start"></div><div style="height: 300px; scroll-snap-align: start"></div>'
          }
        }
      )
    })
    await visitsEveryPlace(page)
  })

  test('scrollTo and same-page links rest on the nearest snap point; with proximity, only within reach', async ({ page }) => {
    await sections(page, 'y mandatory', '', '{"anchors":true}')
    const mandatory = await page.evaluate(async () => {
      const w = window as any
      const going = w.g.scrollTo(1250)
      const target = w.g.target
      while (w.g.isGliding) w.frame(w.g)
      return { target, arrived: await going, y: window.scrollY }
    })
    expect(mandatory).toEqual({ target: 1600, arrived: true, y: 1600 })

    await sections(page, 'y proximity')
    const proximity = await page.evaluate(() => {
      const w = window as any
      w.g.scrollTo(1250, { immediate: true })
      const far = window.scrollY
      w.g.scrollTo(1500, { immediate: true })
      return { far, near: window.scrollY }
    })
    expect(proximity).toEqual({ far: 1250, near: 1600 })
  })

  test('a horizontal carousel moves one item a notch, and hands the wheel to the page at its last item', async ({ page }) => {
    await open(
      page,
      `<div id="track" style="display: flex; overflow-x: auto; width: 600px; scroll-snap-type: x mandatory">${'<div style="flex: none; width: 600px; height: 300px; scroll-snap-align: start; box-sizing: border-box; border-right: 1px solid"></div>'.repeat(4)}</div><div class="tall"></div>`
    )
    const result = await page.evaluate(() => {
      const w = window as any
      const track = document.getElementById('track') as HTMLElement
      w.g = new w.Svifa({ scroller: track, axis: 'horizontal', autoRaf: false, snap: true })
      w.frame(w.g)
      w.wheel(track, 100)
      return w.g.target
    })
    expect(result).toBe(600)
    expect((await settle(page)).at(-1)).toBe(600)
    const last = await page.evaluate(() => {
      const w = window as any
      w.g.scrollTo('end', { immediate: true })
      return { at: w.g.scroll, prevented: w.wheel(document.getElementById('track'), 100) }
    })
    expect(last).toEqual({ at: 1800, prevented: false })
  })

  test('a right-to-left carousel snaps from its own start', async ({ page }) => {
    await open(
      page,
      `<div id="track" dir="rtl" style="display: flex; overflow-x: auto; width: 600px; scroll-snap-type: x mandatory">${'<div style="flex: none; width: 600px; height: 300px; scroll-snap-align: start"></div>'.repeat(4)}</div>`
    )
    const result = await page.evaluate(() => {
      const w = window as any
      const track = document.getElementById('track') as HTMLElement
      w.g = new w.Svifa({ scroller: track, axis: 'horizontal', autoRaf: false, snap: true })
      w.frame(w.g)
      w.wheel(track, 100)
      return w.g.target
    })
    expect(result).toBe(600)
    await settle(page)
    expect(await page.evaluate(() => document.getElementById('track')!.scrollLeft)).toBe(-600)
  })

  test('both ways, each axis snaps on its own', async ({ page }) => {
    await open(
      page,
      `<div id="board" style="overflow: auto; width: 500px; height: 400px; scroll-snap-type: both mandatory">
        <div style="display: grid; grid-template-columns: repeat(4, 500px); grid-auto-rows: 400px">${'<div style="scroll-snap-align: start"></div>'.repeat(16)}</div>
      </div>`
    )
    const result = await page.evaluate(() => {
      const w = window as any
      const board = document.getElementById('board') as HTMLElement
      w.g = new w.Svifa({ scroller: board, axis: 'both', autoRaf: false, snap: true })
      w.frame(w.g)
      w.wheel(board, 60, { deltaX: 40 })
      return { x: w.g.x.target, y: w.g.y.target }
    })
    expect(result).toEqual({ x: 500, y: 400 })
    await settle(page)
    expect(
      await page.evaluate(() => [document.getElementById('board')!.scrollLeft, document.getElementById('board')!.scrollTop])
    ).toEqual([500, 400])
  })

  test('a key taking over mid-glide gives the scroller back to the browser, which snaps it', async ({ page }) => {
    await sections(page)
    const result = await page.evaluate(() => {
      const w = window as any
      w.wheel(window, 100)
      w.frame(w.g, 60, 4)
      document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }))
      return { gliding: w.g.isGliding, style: document.documentElement.style.scrollSnapType }
    })
    expect(result).toEqual({ gliding: false, style: '' })
    expect([0, 800]).toContain(await restingY(page))
  })

  test('off by default, and switched on and off with configure', async ({ page }) => {
    await open(page, SECTIONS, `html { scroll-snap-type: y mandatory; } ${SECTION_CSS}`)
    const result = await page.evaluate(() => {
      const w = window as any
      w.g = new w.Svifa({ autoRaf: false })
      w.frame(w.g)
      const off = w.wheel(window, 100)
      w.g.configure({ snap: true })
      const on = w.wheel(window, 100)
      const option = w.g.options.snap
      while (w.g.isGliding) w.frame(w.g)
      w.g.configure({ snap: false })
      return { off, on, option, y: window.scrollY, again: w.wheel(window, 100), after: w.g.options.snap }
    })
    expect(result).toEqual({ off: false, on: true, option: true, y: 800, again: false, after: false })
  })

  test('a scroller in a vertical writing mode is left to the browser', async ({ page }) => {
    await open(page, SECTIONS, `html { scroll-snap-type: y mandatory; writing-mode: vertical-lr; } ${SECTION_CSS}`)
    const prevented = await page.evaluate(() => {
      const w = window as any
      w.g = new w.Svifa({ autoRaf: false, snap: true })
      return w.wheel(window, 100)
    })
    expect(prevented).toBe(false)
  })
})
