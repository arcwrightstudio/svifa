// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Arcwright Studio

import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test } from './fixtures'
import { open } from './setup'

const PAGE = `
  <main>
    <section class="move" id="one" style="height: 3000px">
      <div class="stick" id="pin" style="position: sticky; top: 40px; height: 100px">pinned</div>
    </section>
    <section class="move" id="two" style="height: 8000px"></section>
  </main>`
// no CSS of its own: Svifa gives each element its layer
const STYLE = ''

// the vertical translate an element carries, in CSS pixels (0 when it has none)
const SHIFT = `(element) => { const t = element.style.translate; return t ? Number.parseFloat(t.split(' ')[1]) : 0 }`

test.describe('drawing between pixels (subpixel)', () => {
  test('draws the travelling elements exactly where the glide is, every frame at 240 and 1000 Hz, and leaves nothing behind at rest', async ({
    page,
  }) => {
    await open(page, PAGE, STYLE)
    const runs = await page.evaluate((shiftSource) => {
      const w = window as any
      const shift = new Function(`return ${shiftSource}`)() as (element: HTMLElement) => number
      const one = document.getElementById('one')!
      return [240, 1000].map((hz) => {
        window.scrollTo({ top: 0, behavior: 'instant' })
        const g = new w.Svifa({ autoRaf: false, subpixel: '.move' })
        w.frame(g)
        w.wheel(window, 137)
        const seen: { value: number; drawn: number; shift: number }[] = []
        while (g.isGliding && seen.length < 3000) {
          w.frame(g, hz)
          // where the element is drawn: the browser's whole-pixel scroll, moved by the translate
          seen.push({ value: g.scroll, drawn: window.scrollY - shift(one), shift: shift(one) })
        }
        const rest = { y: window.scrollY, shift: one.style.translate, anchor: document.documentElement.style.overflowAnchor }
        g.destroy()
        return { seen, rest }
      })
    }, SHIFT)
    for (const frames of runs) {
      for (const frame of frames.seen) {
        expect(Math.abs(frame.drawn - frame.value)).toBeLessThan(1e-6)
        expect(Math.abs(frame.shift)).toBeLessThan(1)
      }
      expect(frames.seen.some((frame) => frame.shift !== 0)).toBe(true)
      expect(frames.rest).toEqual({ y: 137, shift: '', anchor: '' })
    }
  })

  test('holds a sticky element still while it is held, and moves it with the rest while it travels', async ({ page }) => {
    await open(page, PAGE, STYLE)
    const result = await page.evaluate((shiftSource) => {
      const w = window as any
      const shift = new Function(`return ${shiftSource}`)() as (element: HTMLElement) => number
      w.g = new w.Svifa({ autoRaf: false, subpixel: '.move, .stick' })
      const pin = document.getElementById('pin')!
      const one = document.getElementById('one')!
      // held: the pin sits at its sticky offset (40px) while section one scrolls under it
      w.g.scrollTo(500, { immediate: true })
      w.frame(w.g)
      w.wheel(window, 63)
      let heldWorst = 0
      while (w.g.isGliding) {
        w.frame(w.g, 240)
        heldWorst = Math.max(heldWorst, Math.abs(pin.getBoundingClientRect().top - 40))
      }
      // travelling: below its section's end the pin goes with the page
      w.g.scrollTo(3200, { immediate: true })
      w.frame(w.g)
      w.wheel(window, 51)
      let travelWorst = 0
      while (w.g.isGliding) {
        w.frame(w.g, 240)
        const drawn = pin.getBoundingClientRect().top + w.g.scroll
        travelWorst = Math.max(travelWorst, Math.abs(drawn - (one.offsetTop + one.offsetHeight - 100)))
      }
      return { heldWorst, travelWorst, pinShift: shift(pin) }
    }, SHIFT)
    expect(result.heldWorst).toBeLessThan(0.06)
    expect(result.travelWorst).toBeLessThan(0.06)
    expect(result.pinShift).toBe(0)
  })

  test('comes to rest on the browser’s own grid, at 144 and 1000 Hz', async ({ page }) => {
    await open(page, PAGE, STYLE)
    const rest = await page.evaluate(() => {
      const w = window as any
      w.g = new w.Svifa({ autoRaf: false, subpixel: '.move' })
      w.frame(w.g)
      const ends: number[] = []
      for (const hz of [144, 1000]) {
        for (const delta of [37.3, 91.7, 133.9]) {
          w.wheel(window, delta)
          while (w.g.isGliding) w.frame(w.g, hz)
          ends.push(w.g.scroll - window.scrollY)
        }
      }
      return ends
    })
    for (const gap of rest) expect(Math.abs(gap)).toBeLessThan(1e-9)
  })

  test('takes a list of elements or a function as well as a selector, and follows elements added mid-session', async ({ page }) => {
    await open(page, PAGE, STYLE)
    const result = await page.evaluate(async () => {
      const w = window as any
      const two = document.getElementById('two')!
      const g = new w.Svifa({ autoRaf: false, subpixel: () => document.querySelectorAll('.move') })
      w.frame(g)
      w.wheel(window, 50)
      w.frame(g, 240, 3)
      const before = two.style.translate !== ''
      const late = document.createElement('section')
      late.className = 'move'
      late.style.height = '10px'
      document.querySelector('main')!.append(late)
      await new Promise((resolve) => setTimeout(resolve)) // the browser reports the addition after this task, as between frames
      w.wheel(window, 50)
      w.frame(g, 240, 3)
      const after = late.style.translate !== ''
      g.destroy()
      const h = new w.Svifa({ autoRaf: false, subpixel: [two] })
      w.frame(h)
      w.wheel(window, 50)
      w.frame(h, 240, 3)
      return { before, after, list: two.style.translate !== '' }
    })
    expect(result).toEqual({ before: true, after: true, list: true })
  })
})

test.describe('when drawing between pixels is not wanted or not possible', () => {
  test('draws nothing between pixels, and holds no class for it, while the reader asks for reduced motion; follows a change', async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await open(page, PAGE, STYLE)
    const reduced = await page.evaluate(() => {
      const w = window as any
      w.g = new w.Svifa({ autoRaf: false, subpixel: '.move' })
      return document.documentElement.classList.contains('svifa-subpixel')
    })
    expect(reduced).toBe(false)
    await page.emulateMedia({ reducedMotion: 'no-preference' })
    await page.waitForFunction(() => document.documentElement.classList.contains('svifa-subpixel'), null, { timeout: 2000 })
  })

  test('leaves drawing to the browser where it has no translate property, and still glides to the end', async ({ page }) => {
    await open(page, PAGE, STYLE)
    const result = await page.evaluate(() => {
      const w = window as any
      const supports = CSS.supports.bind(CSS)
      CSS.supports = ((...args: [string, string?]) =>
        args[0] === 'translate' ? false : supports(...(args as [string]))) as typeof CSS.supports
      const g = new w.Svifa({ autoRaf: false, subpixel: '.move' })
      w.frame(g)
      w.wheel(window, 77.7)
      let moved = false
      while (g.isGliding) {
        w.frame(g, 240)
        if ((document.getElementById('one') as HTMLElement).style.translate) moved = true
      }
      return { cls: document.documentElement.classList.contains('svifa-subpixel'), moved, y: window.scrollY, rest: g.scroll }
    })
    expect(result.cls).toBe(false)
    expect(result.moved).toBe(false)
    expect(result.rest).toBe(result.y)
  })

  test('moves an element added while the content glides, from the next frame, without waiting for another turn of the wheel', async ({
    page,
  }) => {
    await open(page, PAGE, STYLE)
    const result = await page.evaluate(async () => {
      const w = window as any
      const g = new w.Svifa({ autoRaf: false, subpixel: '.move' })
      w.frame(g)
      w.wheel(window, 300)
      w.frame(g, 240, 3)
      const late = document.createElement('section')
      late.className = 'move'
      late.style.height = '10px'
      document.querySelector('main')!.append(late)
      await new Promise((resolve) => setTimeout(resolve)) // the browser reports the addition after this task
      let lateMoved = 0
      let frames = 0
      for (let i = 0; i < 20 && g.isGliding; i++) {
        w.frame(g, 240)
        frames++
        const two = document.getElementById('two') as HTMLElement
        if (late.style.translate === two.style.translate) lateMoved++
      }
      return { lateMoved, frames }
    })
    expect(result.frames).toBeGreaterThan(5)
    expect(result.lateMoved).toBe(result.frames)
  })
})

test('draws a sticky element exactly in every frame as it reaches its offset, even a fraction of a layout step away', async ({
  page,
}) => {
  // the pin's natural place is 100.03125 px down (two layout steps past a whole pixel), so in one frame of a slow glide the browser has
  // it 1/32 px short of sticking while the exact position has it travelling
  await open(
    page,
    `<main><section class="move" style="height: 3000px">
       <div style="height: 100.03125px"></div><div id="ghost"></div>
       <div class="stick" id="pin" style="position: sticky; top: 40px; height: 100px">pinned</div>
     </section><section class="move" style="height: 8000px"></section></main>`,
    STYLE
  )
  const worst = await page.evaluate(() => {
    const w = window as any
    const g = new w.Svifa({ autoRaf: false, subpixel: '.move, .stick' })
    const ghost = document.getElementById('ghost')!
    const pin = document.getElementById('pin')!
    let worst = 0
    for (const [from, to] of [
      [55, 65],
      [65, 55],
    ]) {
      g.scrollTo(from, { immediate: true })
      w.frame(g)
      g.scrollTo(to, { duration: 2, easing: (t: number) => t })
      while (g.isGliding) {
        w.frame(g, 240)
        // where the pin belongs: its natural place at the glide's position, or held at 40
        const wanted = Math.max(ghost.getBoundingClientRect().top, 40)
        worst = Math.max(worst, Math.abs(pin.getBoundingClientRect().top - wanted))
      }
    }
    return worst
  })
  expect(worst).toBeLessThan(0.005)
})

test.describe('the browser’s own grid', () => {
  test('never puts the scroller past where the content is drawn, and leaves less than a pixel to draw', async ({ page }) => {
    await open(page, PAGE, STYLE)
    const result = await page.evaluate(() => {
      const w = window as any
      const g = new w.Svifa({ autoRaf: false, subpixel: '.move' })
      w.frame(g)
      w.wheel(window, 263.9)
      let ahead = 0
      let behind = 0
      while (g.isGliding) {
        w.frame(g, 144)
        ahead = Math.max(ahead, window.scrollY - g.scroll)
        behind = Math.max(behind, g.scroll - window.scrollY)
      }
      return { ahead, behind }
    })
    // the content is only ever moved toward the start (moved toward its end it would make the page longer)
    expect(result.ahead).toBeLessThanOrEqual(1e-6)
    expect(result.behind).toBeLessThan(1)
  })

  test('without drawing between pixels, rests on the nearest pixel to where it was sent', async ({ page }) => {
    await open(page)
    const rest = await page.evaluate(() => {
      const w = window as any
      const g = new w.Svifa({ autoRaf: false })
      w.frame(g)
      const ends: number[] = []
      for (const delta of [77.7, 50.6]) {
        w.wheel(window, delta)
        while (g.isGliding) w.frame(g)
        ends.push(window.scrollY, g.scroll)
      }
      return ends
    })
    expect(rest).toEqual([78, 78, 128, 128])
  })

  test.describe('at a device scale of 2', () => {
    test.use({ deviceScaleFactor: 2 })
    test('ends a page’s first glide where it was drawn, also in a browser that keeps whole CSS pixels', async ({ page }) => {
      await open(page, PAGE, STYLE)
      const result = await page.evaluate(() => {
        const w = window as any
        const one = document.getElementById('one') as HTMLElement
        const shift = () => (one.style.translate ? Number.parseFloat(one.style.translate.split(' ')[1]) : 0)
        const g = new w.Svifa({ autoRaf: false, subpixel: '.move' })
        w.frame(g)
        g.scrollTo(200.3)
        let last = 0
        // at 1000 Hz a frame's share of the least pace (60 px a second) is 0.06 px, so a jump onto the grid at the end would show
        while (g.isGliding) {
          last = window.scrollY - shift()
          w.frame(g, 1000)
        }
        return { last, rest: window.scrollY, value: g.scroll, left: one.style.translate }
      })
      expect(Math.abs(result.last - result.rest)).toBeLessThan(0.07)
      expect(result.value).toBe(result.rest)
      expect(result.left).toBe('')
    })

    // a browser that keeps whole CSS pixels moves the first half pixel written onto a whole one, down (cut) or up (rounded); near the
    // end, cut down looks just like the page ending short of it
    test('a first glide within a pixel of the page’s end reaches it, and moves as smoothly and as truly drawn away from it', async ({
      page,
    }) => {
      await open(page)
      const runs = await page.evaluate(() => {
        const w = window as any
        const limit = document.documentElement.scrollHeight - innerHeight
        return [
          [limit - 1, 1],
          [limit, -1],
          [limit - 1, -1],
        ].map(([start, delta]) => {
          window.scrollTo({ top: start, behavior: 'instant' })
          // drawn on whole pixels: where the scroller is, is where the content is drawn
          const g = new w.Svifa({ autoRaf: false, subpixel: false })
          w.frame(g)
          w.wheel(window, delta)
          let step = 0
          let drawn = 0
          // at 240 Hz a frame's share of the least pace is a quarter of a pixel, well under the step a jump would make
          while (g.isGliding) {
            const before = g.scroll
            w.frame(g, 240)
            step = Math.max(step, Math.abs(g.scroll - before))
            drawn = Math.max(drawn, Math.abs(window.scrollY - g.scroll))
          }
          // arriving on a whole pixel settles the last half of one at once, with the frame's own share of the curve or of the least
          // pace (a quarter of a pixel at 240 Hz), whichever is more
          const run = { aimed: start + delta, rest: g.scroll, y: window.scrollY, smooth: step <= 0.75 + 1e-9, drawn: drawn <= 0.5 }
          g.destroy()
          return run
        })
      })
      for (const run of runs) expect(run).toEqual({ aimed: run.aimed, rest: run.aimed, y: run.aimed, smooth: true, drawn: true })
    })

    test('a first glide from the top is drawn within half a pixel of where it is, from its first frame', async ({ page }) => {
      await open(page)
      const worst = await page.evaluate(() => {
        const w = window as any
        // drawn on whole pixels: where the scroller is, is where the content is drawn
        const g = new w.Svifa({ autoRaf: false, subpixel: false })
        w.frame(g)
        w.wheel(window, 7)
        let worst = 0
        while (g.isGliding) {
          w.frame(g)
          worst = Math.max(worst, Math.abs(window.scrollY - g.scroll))
        }
        return worst
      })
      expect(worst).toBeLessThanOrEqual(0.5)
    })

    // a right-to-left scroller counts down from 0, so a whole-pixel browser may cut its first half pixel toward the start
    test('a right-to-left scroller is drawn within half a pixel of a first glide from its start, and reaches its end', async ({
      page,
    }) => {
      await open(
        page,
        '<div id="box" dir="rtl" style="width: 300px; overflow: auto"><div style="width: 3000px; height: 10px"></div></div>'
      )
      const runs = await page.evaluate(() => {
        const w = window as any
        const box = document.getElementById('box')!
        const limit = box.scrollWidth - box.clientWidth
        return [
          [0, 7],
          [limit - 1, 1],
        ].map(([start, delta]) => {
          box.scrollTo({ left: -start, behavior: 'instant' })
          const g = new w.Svifa({ autoRaf: false, scroller: box, axis: 'horizontal' })
          w.frame(g)
          w.wheel(box, delta)
          let drawn = 0
          while (g.isGliding) {
            w.frame(g)
            drawn = Math.max(drawn, Math.abs(-box.scrollLeft - g.scroll))
          }
          const run = { aimed: start + delta, rest: g.scroll, at: -box.scrollLeft + 0, drawn: drawn <= 0.5 }
          g.destroy()
          return run
        })
      })
      for (const run of runs) expect(run).toEqual({ aimed: run.aimed, rest: run.aimed, at: run.aimed, drawn: true })
    })

    test('a glide stops on the frame the browser draws it at its end, also on the move that shows its grid', async ({ page }) => {
      await open(page)
      const late = await page.evaluate(() => {
        const w = window as any
        const late: number[][] = []
        // the first three write their first half pixel past the middle of it (300.53, 299.47, 301.55): on a whole-pixel grid that
        // move is drawn at the end
        for (const [lerp, ms, delta] of [
          [0.9, 14, 1],
          [0.9, 14, -1],
          [0.5, 25, 2],
          [0.1, 16, 1],
          [0.1, 16, 5],
        ]) {
          window.scrollTo({ top: 300, behavior: 'instant' })
          const g = new w.Svifa({ autoRaf: false, lerp, subpixel: false })
          let clock = 1000
          g.raf(clock)
          w.wheel(window, delta)
          const goal = g.target
          while (g.isGliding) {
            clock += ms
            g.raf(clock)
            if (g.isGliding && window.scrollY === goal) late.push([lerp, ms, delta, g.scroll])
          }
          g.destroy()
        }
        return late
      })
      expect(late).toEqual([])
    })
  })
})

// Zoomed to a part of a pixel, a browser keeps the scroller on a grid of whole CSS pixels (a device scale, as Playwright sets it) or of
// device pixels (Chrome at the browser's own zoom, Ctrl and minus), and draws each place on a whole device pixel, up to half of one
// off it (Chrome works it out in single precision and rounds half up). Drawn between pixels, the content is drawn from where the
// browser draws the scroller: the place it is drawn at moves on with the glide and never back, stays within half a device pixel of
// the glide's place (which is what Svifa reports), and ends where the browser draws the scroller at rest, with nothing left to draw.
// Whole turns, so on whole CSS pixels each glide rests where it was sent; on device pixels, on the one nearest.
function zoomedGlides({ shiftSource, device }: { shiftSource: string; device: boolean }) {
  const w = window as any
  const shift = new Function(`return ${shiftSource}`)() as (element: HTMLElement) => number
  const one = document.getElementById('one')!
  const limit = document.documentElement.scrollHeight - innerHeight
  const ratio = devicePixelRatio
  const drawnAt = (place: number) => Math.round(Math.fround(place * ratio)) / ratio
  const runs: Record<string, unknown>[] = []
  for (const [start, delta, hz] of [
    [0, 137, 240],
    [301, 23, 1000],
    [302, 61, 240],
    [903, -61, 1000],
    [limit - 3, 9, 240],
  ]) {
    window.scrollTo({ top: start, behavior: 'instant' })
    const g = new w.Svifa({ autoRaf: false, subpixel: '.move' })
    w.frame(g)
    w.wheel(window, delta)
    const goal = g.target
    const rest = device ? Math.min(Math.round(goal * ratio), Math.floor(limit * ratio)) / ratio : goal
    const way = Math.sign(goal - window.scrollY)
    let drawn = drawnAt(window.scrollY)
    let back = 0
    let off = 0
    let toward = 0
    let reported = 0
    let step = 0
    while (g.isGliding) {
      const before = g.scroll
      w.frame(g, hz)
      if (!g.isGliding) break
      const now = drawnAt(window.scrollY) - shift(one)
      back = Math.max(back, (drawn - now) * way)
      off = Math.max(off, Math.abs(now - g.scroll))
      toward = Math.max(toward, shift(one))
      if (!(g.scroll >= 0 && g.scroll <= limit) || (g.scroll - before) * way < -1e-9) reported++
      step = Math.abs(now - drawn)
      drawn = now
    }
    runs.push({
      start,
      delta,
      back: back <= 1e-6,
      off: off <= 0.5 / ratio + 1e-6,
      toward: toward <= 1e-6,
      reported,
      // read back in single precision by some browsers, and the device pixel ratio is single precision too
      rest: g.scroll === window.scrollY && Math.abs(window.scrollY - rest) < 1e-3,
      // the last move, onto where the browser draws it at rest, is no bigger than the glide's own last step (in Firefox the least
      // pace, a quarter of a pixel at 240 Hz) or a tiny fraction; Firefox keeps a translate to a sixtieth of a CSS pixel
      landed: Math.abs(drawnAt(window.scrollY) - drawn) <= Math.max(step, 0.07) + 1 / 60,
      left: one.style.translate,
    })
    g.destroy()
  }
  return runs
}

const ZOOMED = { back: true, off: true, toward: true, reported: 0, rest: true, landed: true, left: '' }

for (const scale of [0.8, 0.9, 1.25, 1.5]) {
  test.describe(`zoomed to ${scale * 100}%`, () => {
    test.use({ deviceScaleFactor: scale })
    test('the content is drawn moving on with the glide from where the browser draws the scroller, and lands where it rests', async ({
      page,
    }) => {
      await open(page, PAGE, STYLE)
      const runs = await page.evaluate(zoomedGlides, { shiftSource: SHIFT, device: false })
      for (const run of runs) expect(run).toEqual({ start: run.start, delta: run.delta, ...ZOOMED })
    })
  })
}

// The browser's own zoom is not a device scale: Chrome keeps the scroller on device pixels at every zoom (at 80% every 1.25 CSS
// pixels). Chromium's full build takes a zoom level from its profile, as a person's Chrome keeps one.
test.describe('zoomed by the browser', () => {
  for (const zoom of [0.8, 1.25]) {
    test(
      `at ${zoom * 100}% the content is drawn moving on with the glide, from device pixels, and lands where it rests`,
      { tag: '@chromium-only' },
      async ({ playwright }, testInfo) => {
        const profile = testInfo.outputPath('profile')
        mkdirSync(join(profile, 'Default'), { recursive: true })
        const level = Math.log(zoom) / Math.log(1.2)
        writeFileSync(join(profile, 'Default', 'Preferences'), JSON.stringify({ partition: { default_zoom_level: { x: level } } }))
        const context = await playwright.chromium.launchPersistentContext(profile, {
          channel: 'chromium',
          viewport: { width: 1280, height: 800 },
        })
        try {
          const page = context.pages()[0] ?? (await context.newPage())
          await open(page, PAGE, STYLE)
          expect(await page.evaluate(() => devicePixelRatio)).toBeCloseTo(zoom, 5)
          const runs = await page.evaluate(zoomedGlides, { shiftSource: SHIFT, device: true })
          for (const run of runs) expect(run).toEqual({ start: run.start, delta: run.delta, ...ZOOMED })
        } finally {
          await context.close()
        }
      }
    )
  }
})

test('holds an element stuck to the bottom still while the content glides past it', async ({ page }) => {
  await open(
    page,
    `<main><section class="move" style="height: 3000px"></section>
       <div class="stick" id="foot" style="position: sticky; bottom: 0; height: 60px">footer bar</div>
     <section class="move" style="height: 3000px"></section></main>`,
    STYLE
  )
  const worst = await page.evaluate(() => {
    const w = window as any
    const g = new w.Svifa({ autoRaf: false, subpixel: '.move, .stick' })
    const foot = document.getElementById('foot')!
    g.scrollTo(500, { immediate: true })
    w.frame(g)
    w.wheel(window, 37.3)
    let worst = 0
    while (g.isGliding) {
      w.frame(g, 240)
      worst = Math.max(worst, Math.abs(foot.getBoundingClientRect().bottom - document.documentElement.clientHeight))
    }
    return worst
  })
  expect(worst).toBeLessThan(0.005)
})

test('moves only elements inside its scroller, and warns once about a selector the browser cannot read', async ({ page }) => {
  await open(
    page,
    `<section class="move" id="outside" style="height: 50px"></section>
     <div id="scroller" style="height: 400px; overflow: auto"><section class="move" id="inside" style="height: 3000px"></section></div>
     <div class="tall"></div>`,
    STYLE
  )
  const result = await page.evaluate(() => {
    const w = window as any
    const el = document.getElementById('scroller')!
    let inside = 0
    let outside = 0
    // a selector, and a function that returns elements from the whole page
    for (const subpixel of ['.move', () => document.querySelectorAll('.move')]) {
      const g = new w.Svifa({ autoRaf: false, scroller: el, subpixel })
      w.frame(g)
      w.wheel(el, 133.3)
      while (g.isGliding) {
        w.frame(g, 240)
        if (document.getElementById('inside')!.style.translate) inside++
        if (document.getElementById('outside')!.style.translate) outside++
      }
      g.destroy()
    }
    const warnings: unknown[] = []
    const warn = console.warn
    console.warn = (...args: unknown[]) => warnings.push(args)
    const h = new w.Svifa({ autoRaf: false, subpixel: '[[not a selector' })
    w.frame(h)
    w.wheel(window, 60)
    w.wheel(window, 60)
    while (h.isGliding) w.frame(h)
    console.warn = warn
    return { inside: inside > 0, outside, warnings: warnings.length, y: window.scrollY }
  })
  expect(result).toEqual({ inside: true, outside: 0, warnings: 1, y: 120 })
})

test.describe('the end of the page', () => {
  for (const [what, height, shrink] of [
    ['a page whose height is not a whole pixel', '9000.6px', 0],
    ['a page that grows shorter under a glide', '9000px', 0.7],
  ] as const) {
    test(`is never drawn more than half a pixel past, and rested on exactly, on ${what}`, async ({ page }) => {
      await open(
        page,
        `<main><section class="move" id="body" style="height: ${height}"></section></main>`,
        '.move { will-change: translate; }'
      )
      const result = await page.evaluate((shrink) => {
        const w = window as any
        const body = document.getElementById('body') as HTMLElement
        const g = new w.Svifa({ autoRaf: false, subpixel: '.move' })
        w.frame(g)
        g.scrollTo('bottom')
        const drawn: number[] = []
        let frames = 0
        while (g.isGliding && frames < 2000) {
          w.frame(g, 240)
          frames++
          if (frames === 40 && shrink) body.style.height = `${9000 - shrink}px`
          const m = /^(-?[0-9.e-]+)px (-?[0-9.e-]+)px$/.exec(body.style.translate || '')
          drawn.push(window.scrollY - (m ? Number(m[2]) : 0))
        }
        const rest = { scroll: g.scroll, y: window.scrollY }
        // the furthest the browser lets the page go, asked of the browser itself
        window.scrollTo({ top: 1e9, behavior: 'instant' })
        return { worst: Math.max(...drawn) - window.scrollY, rest: rest.scroll, y: rest.y, end: window.scrollY }
      }, shrink)
      // never more than half a pixel past where the browser stops (a page ending on a fraction of a pixel has content there), and at
      // rest exactly where it stops
      expect(result.worst).toBeLessThanOrEqual(0.5 + 1e-6)
      expect(result.rest).toBe(result.y)
      expect(result.y).toBe(result.end)
    })
  }
})

test('is left off for a horizontal scroller in right-to-left content', async ({ page }) => {
  await open(
    page,
    '<div id="row" dir="rtl" style="width: 600px; overflow: auto"><div class="move" style="width: 3000px; height: 20px"></div></div>',
    STYLE
  )
  const cls = await page.evaluate(() => {
    const w = window as any
    const row = document.getElementById('row')!
    new w.Svifa({ autoRaf: false, scroller: row, axis: 'horizontal', subpixel: '.move' })
    return row.className
  })
  expect(cls).toBe('svifa')
})

test('drawn between pixels a glide slows to a stop along its curve; in Firefox, which draws whole pixels, it keeps the least pace', async ({
  page,
  browserName,
}) => {
  await open(page, PAGE, STYLE)
  const slowest = await page.evaluate(() => {
    const w = window as any
    const g = new w.Svifa({ autoRaf: false, subpixel: '.move' })
    w.frame(g)
    w.wheel(window, 100)
    // the least a frame moved while the glide was under way, at 60 Hz
    let least = Number.POSITIVE_INFINITY
    while (g.isGliding) {
      const before = g.scroll
      w.frame(g, 60)
      if (g.isGliding) least = Math.min(least, Math.abs(g.scroll - before))
    }
    g.destroy()
    return least
  })
  // the least pace is a pixel a frame at 60 Hz; along the curve, the last frames move a small part of one
  if (browserName === 'firefox') expect(slowest).toBeGreaterThanOrEqual(1 - 1e-9)
  else expect(slowest).toBeLessThan(0.1)
})
