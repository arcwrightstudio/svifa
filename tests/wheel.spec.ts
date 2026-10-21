// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Arcwright Studio

import { expect, test } from './fixtures'
import { open, settle } from './setup'

test.describe('the wheel', () => {
  test('glides one notch to exactly where it was sent, slowing all the way, and reports each frame', async ({ page }) => {
    await open(page)
    const result = await page.evaluate(() => {
      const w = window as any
      w.g = new w.Svifa({ autoRaf: false })
      w.reported = 0
      w.g.on('scroll', () => w.reported++)
      w.frame(w.g)
      const prevented = w.wheel(window, 100)
      return {
        prevented,
        gliding: w.g.isGliding,
        target: w.g.target,
        gliding_class: document.documentElement.classList.contains('svifa-gliding'),
      }
    })
    expect(result).toEqual({ prevented: true, gliding: true, target: 100, gliding_class: true })

    const path = await settle(page)
    const steps = path.map((at, i) => at - (i ? path[i - 1] : 0))
    for (let i = 1; i < steps.length - 1; i++) expect(steps[i]).toBeLessThanOrEqual(steps[i - 1] + 1e-9)
    expect(path.at(-1)).toBe(100)
    const after = await page.evaluate(() => {
      const w = window as any
      return [window.scrollY, w.g.isGliding, w.reported, document.documentElement.classList.contains('svifa-gliding')]
    })
    expect(after).toEqual([100, false, path.length, false])
  })

  test('takes as long, in time, at any refresh rate', async ({ page }) => {
    await open(page)
    const at = await page.evaluate(() => {
      const w = window as any
      const timeTo = (hz: number) => {
        window.scrollTo({ top: 0, behavior: 'instant' })
        const g = new w.Svifa({ autoRaf: false })
        w.frame(g, hz)
        w.wheel(window, 100)
        const samples: Record<number, number> = {}
        let t = 0
        while (g.isGliding && t < 5000) {
          w.frame(g, hz)
          t += 1000 / hz
          for (const mark of [50, 150, 400]) if (samples[mark] === undefined && t >= mark) samples[mark] = g.scroll
        }
        g.destroy()
        return { samples, rest: t }
      }
      return [60, 120, 240, 360, 500, 1000].map(timeTo)
    })
    for (const run of at.slice(1)) {
      for (const mark of [50, 150, 400]) expect(Math.abs(run.samples[mark] - at[0].samples[mark])).toBeLessThan(3)
      expect(Math.abs(run.rest - at[0].rest)).toBeLessThan(40)
    }
  })

  test('adds up notches that come while a glide is under way', async ({ page }) => {
    await open(page)
    const target = await page.evaluate(() => {
      const w = window as any
      w.g = new w.Svifa({ autoRaf: false })
      w.frame(w.g)
      w.wheel(window, 100)
      w.frame(w.g, 60, 5)
      w.wheel(window, 100)
      return w.g.target
    })
    expect(target).toBe(200)
    expect((await settle(page)).at(-1)).toBe(200)
  })

  test('measures a notch the same whatever unit the browser reports it in', async ({ page }) => {
    await open(page)
    const targets = await page.evaluate(() => {
      const w = window as any
      const g = new w.Svifa({ autoRaf: false })
      w.frame(g)
      w.wheel(window, 3, { deltaMode: 1 })
      const lines = g.target
      g.destroy()
      window.scrollTo({ top: 0, behavior: 'instant' })
      const h = new w.Svifa({ autoRaf: false })
      w.frame(h)
      w.wheel(window, 1, { deltaMode: 2 })
      return { lines, page: h.target, height: document.documentElement.clientHeight }
    })
    expect(targets.lines).toBeCloseTo(100, 6)
    expect(targets.page).toBe(targets.height)
  })

  test('leaves zooming and sideways swipes on a vertical page to the browser', async ({ page }) => {
    await open(page)
    const prevented = await page.evaluate(() => {
      const w = window as any
      w.g = new w.Svifa({ autoRaf: false })
      return {
        zoom: w.wheel(window, 100, { ctrlKey: true }),
        sideways: w.wheel(window, 5, { deltaX: 80 }),
        gliding: w.g.isGliding,
      }
    })
    expect(prevented).toEqual({ zoom: false, sideways: false, gliding: false })
  })

  test('leaves the wheel to the browser on a page that cannot scroll, and at the ends', async ({ page }) => {
    await open(page, '<p>Short</p>')
    expect(
      await page.evaluate(() => {
        const w = window as any
        w.g = new w.Svifa({ autoRaf: false })
        return w.wheel(window, 100)
      })
    ).toBe(false)

    await open(page)
    const atTop = await page.evaluate(() => {
      const w = window as any
      w.g = new w.Svifa({ autoRaf: false })
      return w.wheel(window, -100)
    })
    expect(atTop).toBe(false)
  })

  test('leaves the wheel alone when scrolling has been switched off on the page', async ({ page }) => {
    await open(page, '', 'html { overflow: hidden; }')
    const prevented = await page.evaluate(() => {
      const w = window as any
      w.g = new w.Svifa({ autoRaf: false })
      return [w.wheel(window, 100), w.g.isGliding]
    })
    expect(prevented).toEqual([false, false])
  })

  test('scales every turn by wheelSpeed', async ({ page }) => {
    await open(page)
    const target = await page.evaluate(() => {
      const w = window as any
      w.g = new w.Svifa({ autoRaf: false, wheelSpeed: 1.5 })
      w.wheel(window, 100)
      return w.g.target
    })
    expect(target).toBe(150)
  })

  test('can be left entirely to the browser (wheel: false)', async ({ page }) => {
    await open(page)
    const prevented = await page.evaluate(() => {
      const w = window as any
      w.g = new w.Svifa({ autoRaf: false, wheel: false })
      return w.wheel(window, 100)
    })
    expect(prevented).toBe(false)
  })

  test('glides over a set time when given a duration', async ({ page }) => {
    await open(page)
    const frames = await page.evaluate(() => {
      const w = window as any
      w.g = new w.Svifa({ autoRaf: false, duration: 0.5 })
      w.frame(w.g)
      w.wheel(window, 300)
      let count = 0
      while (w.g.isGliding && count < 1000) {
        w.frame(w.g, 60)
        count++
      }
      return { count, at: window.scrollY }
    })
    expect(frames.at).toBe(300)
    expect(frames.count).toBeGreaterThanOrEqual(29)
    expect(frames.count).toBeLessThanOrEqual(31)
  })
})

test('small trackpad movements from rest add up, even when each is less than a pixel', async ({ page }) => {
  await open(page)
  const y = await page.evaluate(() => {
    const w = window as any
    const g = new w.Svifa({ autoRaf: false })
    w.frame(g)
    for (let i = 0; i < 10; i++) {
      w.wheel(window, 0.4)
      for (let f = 0; f < 120 && g.isGliding; f++) w.frame(g, 120)
    }
    return window.scrollY
  })
  expect(y).toBe(4)
})
