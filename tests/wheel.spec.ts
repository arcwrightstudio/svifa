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

  test('on whole pixels the page never stands still for more than a sixtieth of a second before it rests, at any refresh rate', async ({
    page,
  }) => {
    await open(page)
    const runs = await page.evaluate(() => {
      const w = window as any
      return [60, 120, 240, 500].map((hz) => {
        window.scrollTo({ top: 0, behavior: 'instant' })
        const g = new w.Svifa({ autoRaf: false, subpixel: false })
        w.frame(g, hz)
        w.wheel(window, 100)
        // the longest run of frames the page is drawn in the same place while the glide is under way
        let still = 0
        let longest = 0
        let drawn = window.scrollY
        while (g.isGliding) {
          w.frame(g, hz)
          if (window.scrollY === drawn) longest = Math.max(longest, ++still)
          else still = 0
          drawn = window.scrollY
        }
        g.destroy()
        return { hz, ms: (longest * 1000) / hz, rest: window.scrollY }
      })
    })
    // a sixtieth of a second, and the frame that shows the move
    for (const run of runs) expect(run).toEqual({ hz: run.hz, ms: expect.any(Number), rest: 100 })
    for (const run of runs) expect(run.ms).toBeLessThanOrEqual(1000 / 60 + 1000 / run.hz + 1e-6)
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

  test('glides over a set time when given a duration, never slower than a pixel a sixtieth of a second', async ({ page }) => {
    await open(page)
    const frames = await page.evaluate(() => {
      const w = window as any
      w.g = new w.Svifa({ autoRaf: false, duration: 0.5, subpixel: false })
      w.frame(w.g)
      w.wheel(window, 300)
      let count = 0
      while (w.g.isGliding && count < 1000) {
        w.frame(w.g, 60)
        count++
      }
      // the easing over half a second, held to a pixel a frame at 60 Hz where it would go slower: the frame it reaches 300 px
      let model = 0
      let expected = 0
      // (short of it by no more than rounding is there)
      for (let t = 1 / 60; model < 300 - 1e-9; t += 1 / 60) {
        const eased = t >= 0.5 ? 300 : (300 * (1 - 2 ** (-20 * t))) / (1 - 2 ** -10)
        model = Math.max(eased, Math.min(300, model + 1))
        expected++
      }
      return { count, expected, at: window.scrollY }
    })
    expect(frames.at).toBe(300)
    // its time is 30 frames; held to the pace at the slow end of the easing, it arrives before that
    expect(frames.count).toBe(frames.expected)
    expect(frames.count).toBeLessThan(30)
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
