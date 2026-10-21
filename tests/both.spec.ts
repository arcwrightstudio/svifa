// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Arcwright Studio

// A scroller that moves both ways (axis: 'both'): the page, or an element, wider and taller than its visible area.
import { expect, test } from './fixtures'
import { open } from './setup'

const FIELD = `<div style="width: 6000px; height: 8000px; background: linear-gradient(135deg, #eee, #ccc)"></div>
  <section id="spot" style="position: absolute; left: 3000px; top: 4000px; width: 100px; height: 100px">spot</section>`

test.describe('both ways', () => {
  test('one wheel turn moves each axis by its own part, and both arrive and report together', async ({ page }) => {
    await open(page, FIELD)
    const result = await page.evaluate(() => {
      const w = window as any
      const g = new w.Svifa({ axis: 'both', autoRaf: false })
      let reports = 0
      g.on('scroll', () => reports++)
      w.frame(g)
      const prevented = w.wheel(window, 300, { deltaX: 200 })
      const heading = { x: g.x.target, y: g.y.target, main: g.target }
      let frames = 0
      while (g.isGliding) {
        w.frame(g)
        frames++
      }
      return {
        prevented,
        heading,
        rest: { x: window.scrollX, y: window.scrollY, gx: g.x.scroll, gy: g.y.scroll, main: g.scroll },
        once: reports === frames,
      }
    })
    expect(result).toEqual({
      prevented: true,
      heading: { x: 200, y: 300, main: 300 },
      rest: { x: 200, y: 300, gx: 200, gy: 300, main: 300 },
      once: true,
    })
  })

  test('a sideways turn moves it sideways, and so does the wheel with Shift held', async ({ page }) => {
    await open(page, FIELD)
    const result = await page.evaluate(() => {
      const w = window as any
      const g = new w.Svifa({ axis: 'both', autoRaf: false })
      const settle = () => {
        while (g.isGliding) w.frame(g)
        return [window.scrollX, window.scrollY]
      }
      w.frame(g)
      w.wheel(window, 0, { deltaX: 150 })
      const sideways = settle()
      w.wheel(window, 120, { shiftKey: true })
      const shifted = settle()
      return { sideways, shifted }
    })
    expect(result).toEqual({ sideways: [150, 0], shifted: [270, 0] })
  })

  test('each axis stops at its own end; the wheel goes on past the scroller only when every way it turned is at its end', async ({
    page,
  }) => {
    await open(page, FIELD)
    const result = await page.evaluate(() => {
      const w = window as any
      const g = new w.Svifa({ axis: 'both', autoRaf: false })
      const settle = () => {
        while (g.isGliding) w.frame(g)
      }
      const limit = { x: g.x.limit, y: g.y.limit }
      g.scrollTo({ x: limit.x }, { immediate: true })
      w.frame(g)
      // sideways is at its end, down is not: taken, and only down moves
      const mixed = w.wheel(window, 100, { deltaX: 100 })
      settle()
      const afterMixed = [window.scrollX, window.scrollY]
      g.scrollTo({ x: limit.x, y: limit.y }, { immediate: true })
      // both at their ends: left to the browser
      const atEnds = w.wheel(window, 100, { deltaX: 100 })
      return { limit, mixed, afterMixed, atEnds, gliding: g.isGliding }
    })
    expect(result.mixed).toBe(true)
    expect(result.afterMixed).toEqual([result.limit.x, 100])
    expect(result.atEnds).toBe(false)
    expect(result.gliding).toBe(false)
  })

  test('scrollTo takes { x, y }, one axis of it, an element, a keyword or a number (the vertical axis)', async ({ page }) => {
    await open(page, FIELD)
    const places = await page.evaluate(async () => {
      const w = window as any
      const g = new w.Svifa({ axis: 'both', autoRaf: false })
      const go = (target: unknown, options: object = {}) => {
        g.scrollTo(target, { immediate: true, ...options })
        return [window.scrollX, window.scrollY]
      }
      return {
        point: go({ x: 400, y: 900 }),
        onlyX: go({ x: 100 }),
        number: go(50),
        element: go(document.getElementById('spot')),
        offset: go({ x: 1000, y: 1000 }, { offset: { x: -10, y: 20 } }),
        numberOffset: go({ x: 300, y: 300 }, { offset: 5 }),
        bottom: go('bottom'),
        top: go('top'),
        limits: [g.x.limit, g.y.limit],
      }
    })
    expect(places).toEqual({
      point: [400, 900],
      onlyX: [100, 900],
      number: [100, 50],
      element: [3000, 4000],
      offset: [990, 1020],
      numberOffset: [300, 305],
      bottom: places.limits,
      top: [0, 0],
      limits: places.limits,
    })
  })

  test('a glide to { x, y } resolves true once both axes arrive, and false when something else moves either', async ({ page }) => {
    await open(page, FIELD)
    const result = await page.evaluate(async () => {
      const w = window as any
      const g = new w.Svifa({ axis: 'both', autoRaf: false })
      w.frame(g)
      const arrived = g.scrollTo({ x: 800, y: 2000 })
      while (g.isGliding) w.frame(g)
      const first = { arrived: await arrived, at: [window.scrollX, window.scrollY] }
      const takenOver = g.scrollTo({ x: 0, y: 0 })
      w.frame(g, 60, 3)
      // the browser's own sideways scroll, as a key or the scroll bar would make it
      window.scrollBy({ left: 37, behavior: 'instant' })
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
      return { first, second: await takenOver, gliding: g.isGliding, settled: [g.x.target, g.y.target] }
    })
    expect(result.first).toEqual({ arrived: true, at: [800, 2000] })
    expect(result.second).toBe(false)
    expect(result.gliding).toBe(false)
    expect(result.settled).toEqual(await page.evaluate(() => [window.scrollX, window.scrollY]))
  })

  test('each axis reports its own place, speed and direction; a scroller that moves one way has only that axis', async ({
    page,
  }) => {
    await open(page, FIELD)
    const result = await page.evaluate(() => {
      const w = window as any
      const g = new w.Svifa({ axis: 'both', autoRaf: false })
      w.frame(g)
      w.wheel(window, -50, { deltaX: 400 })
      g.scrollTo({ y: 600 }, { immediate: true })
      w.wheel(window, -100, { deltaX: 400 })
      w.frame(g)
      const moving = {
        x: { velocity: g.x.velocity > 0, direction: g.x.direction },
        y: { velocity: g.y.velocity < 0, direction: g.y.direction, main: g.velocity === g.y.velocity },
      }
      while (g.isGliding) w.frame(g)
      const views = { progress: g.x.progress === g.x.scroll / g.x.limit, limit: g.x.limit === g.x.limit && g.x.limit > 0 }
      g.destroy()
      const vertical = new w.Svifa({ autoRaf: false })
      const one = { x: vertical.x, y: vertical.y !== null }
      vertical.destroy()
      const horizontal = new w.Svifa({ axis: 'horizontal', autoRaf: false })
      const other = { x: horizontal.x !== null, y: horizontal.y }
      horizontal.destroy()
      return { moving, views, one, other }
    })
    expect(result).toEqual({
      moving: { x: { velocity: true, direction: 1 }, y: { velocity: true, direction: -1, main: true } },
      views: { progress: true, limit: true },
      one: { x: null, y: true },
      other: { x: true, y: null },
    })
  })

  test('on an element that scrolls both ways, draws between pixels on both axes and puts everything back at rest', async ({
    page,
  }) => {
    await open(
      page,
      `<div id="box" style="width: 600px; height: 400px; overflow: auto">
         <div class="move" style="width: 3000px; height: 3000px; background: linear-gradient(135deg, #eee, #ccc)"></div>
       </div>`
    )
    const result = await page.evaluate(() => {
      const w = window as any
      const box = document.getElementById('box')!
      const content = box.querySelector('.move') as HTMLElement
      const g = new w.Svifa({ scroller: box, axis: 'both', subpixel: '.move', autoRaf: false })
      w.frame(g)
      w.wheel(box, 333.3, { deltaX: 211.7 })
      w.frame(g)
      const drawn = content.style.translate.split(' ')
      let worst = 0
      while (g.isGliding) {
        w.frame(g)
        worst = Math.max(worst, Math.abs(box.scrollLeft - g.x.scroll), Math.abs(box.scrollTop - g.y.scroll))
      }
      return { both: drawn.length === 2 && drawn.every((part) => part !== '0px'), worst, rest: content.style.translate }
    })
    expect(result.both).toBe(true)
    expect(result.worst).toBeLessThanOrEqual(0.5 + 1e-6)
    expect(result.rest).toBe('')
  })
})
