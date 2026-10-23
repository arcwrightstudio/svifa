// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Arcwright Studio

// Scrolling boxes inside the scroller (the nested option): each glides the wheel itself while it can move that way.
import type { Page } from '@playwright/test'
import { expect, test } from './fixtures'
import { open as openPage } from './setup'

const BOXES = `
  <div class="tall">
    <div id="box" style="height: 200px; overflow: auto"><p id="first" style="margin: 0">text</p><div style="height: 1000px"></div></div>
    <div id="marked" data-svifa-native style="height: 200px; overflow: auto"><div style="height: 1000px"></div></div>
    <div id="picked" style="height: 200px; overflow: auto"><div style="height: 1000px"></div></div>
    <textarea id="text" style="height: 60px">${'line\n'.repeat(40)}</textarea>
    <div id="edit" contenteditable style="height: 60px; overflow: auto">${'<p>line</p>'.repeat(40)}</div>
    <div id="wide" style="width: 300px; overflow: auto"><div style="width: 3000px; height: 50px"></div></div>
  </div>`

// Opens the test page with restInBox(g, box, delta): turns the wheel over the box, from its top, and returns the frames, at 60 Hz,
// until it rests where the turn sends it, with nothing of its content drawn between pixels any more.
async function open(page: Page, body = '') {
  await openPage(page, body)
  await page.evaluate(() => {
    const w = window as any
    w.restInBox = (g: unknown, box: HTMLElement, delta: number) => {
      box.scrollTop = 0
      w.frame(g, 60, 2)
      w.wheel(box, delta)
      const drawn = () => [...box.children].some((child) => (child as HTMLElement).style.translate !== '')
      let frames = 0
      while ((box.scrollTop !== delta || drawn()) && frames < 1000) {
        w.frame(g)
        frames++
      }
      return frames
    }
  })
}

test.describe('a scrolling box inside', () => {
  test('glides the wheel itself, smoothly, while the page stays where it is, then hands the wheel on at its end', async ({
    page,
  }) => {
    await open(page, BOXES)
    const result = await page.evaluate(() => {
      const w = window as any
      const g = new w.Svifa({ autoRaf: false })
      const box = document.getElementById('box')!
      const first = document.getElementById('first')!
      // where the box's content is drawn: where the box is scrolled to, and the part of a pixel drawn on its content
      const drawn = () => box.scrollTop - (first.style.translate ? Number.parseFloat(first.style.translate.split(' ')[1]) : 0)
      w.frame(g)
      const prevented = w.wheel(box, 120)
      const path: number[] = []
      for (let i = 0; i < 400 && (box.scrollTop < 120 || first.style.translate !== ''); i++) {
        w.frame(g)
        path.push(drawn())
      }
      // each frame moves less than the one before, as the curve does (on whole pixels, to within the pixel each is drawn on)
      const layered = first.style.willChange.includes('translate')
      const steps = path.map((at, i) => at - (i ? path[i - 1] : 0))
      const slowing = steps.slice(1, -1).every((step, i) => step >= 0 && step <= steps[i] + (layered ? 1e-6 : 1))
      box.scrollTop = box.scrollHeight
      w.frame(g, 60, 2)
      const atEnd = w.wheel(box, 100)
      return {
        prevented,
        frames: path.length,
        rest: box.scrollTop === box.scrollHeight - box.clientHeight,
        slowing,
        page: window.scrollY,
        atEnd,
        target: g.target,
      }
    })
    expect(result.prevented).toBe(true)
    expect(result.frames).toBeGreaterThan(10)
    expect(result.slowing).toBe(true)
    expect(result.page).toBe(0)
    // at its end the box lets the wheel go on: the page glides
    expect(result.atEnd).toBe(true)
    expect(result.target).toBe(100)
  })

  test('nested: "native" leaves boxes to the browser, and nested: false glides the page over them', async ({ page }) => {
    await open(page, BOXES)
    const result = await page.evaluate(() => {
      const w = window as any
      const box = document.getElementById('box')!
      const g = new w.Svifa({ autoRaf: false, nested: 'native' })
      const native = w.wheel(box, 100)
      g.destroy()
      const h = new w.Svifa({ autoRaf: false, nested: false })
      const before = box.scrollTop
      const over = w.wheel(box, 100)
      w.frame(h, 60, 10)
      return { native, over, page: h.target, box: box.scrollTop - before }
    })
    // the browser's own scrolling of the box, where a scripted wheel event has one (WebKit), is the browser's: the box is not moved
    // once the page glides over it
    expect(result).toEqual({ native: false, over: true, page: 100, box: 0 })
  })

  test('leaves to the browser a box marked data-svifa-native, one the native option picks, form controls and editable text', async ({
    page,
  }) => {
    await open(page, BOXES)
    const result = await page.evaluate(() => {
      const w = window as any
      w.g = new w.Svifa({ autoRaf: false, native: (element: Element) => element.id === 'picked' })
      return ['marked', 'picked', 'text', 'edit'].map((id) => w.wheel(document.getElementById(id), 50))
    })
    expect(result).toEqual([false, false, false, false])
  })

  test('the nested option decides for each box: the page, the browser, or a feel of its own', async ({ page }) => {
    await open(page, BOXES)
    const result = await page.evaluate(() => {
      const w = window as any
      const rest = w.restInBox
      const box = document.getElementById('box')!
      const decide = { now: true as unknown }
      const g = new w.Svifa({ autoRaf: false, nested: () => decide.now })
      w.frame(g)
      const plain = rest(g, box, 100)
      g.destroy()
      const h = new w.Svifa({ autoRaf: false, nested: () => ({ lerp: 0.5 }) })
      w.frame(h)
      const quick = rest(h, box, 100)
      h.destroy()
      decide.now = 'native'
      const k = new w.Svifa({ autoRaf: false, nested: () => decide.now })
      const native = w.wheel(box, 100)
      k.destroy()
      decide.now = false
      const m = new w.Svifa({ autoRaf: false, nested: () => decide.now })
      const toPage = w.wheel(box, 100)
      return { plain, quick, native, toPage, pageTarget: m.target }
    })
    expect(result.quick).toBeLessThan(result.plain)
    expect(result).toMatchObject({ native: false, toPage: true, pageTarget: 100 })
  })

  test('configure changes how the boxes glide too', async ({ page }) => {
    await open(page, BOXES)
    const result = await page.evaluate(() => {
      const w = window as any
      const rest = w.restInBox
      const box = document.getElementById('box')!
      const g = new w.Svifa({ autoRaf: false })
      w.frame(g)
      const before = rest(g, box, 100)
      g.configure({ lerp: 0.5 })
      const after = rest(g, box, 100)
      return { before, after }
    })
    expect(result.after).toBeLessThan(result.before)
  })

  test('a box with a Svifa of its own decides; a Svifa made on purpose takes over from one Svifa made; destroy takes them off', async ({
    page,
  }) => {
    await open(page, BOXES)
    const result = await page.evaluate(() => {
      const w = window as any
      const box = document.getElementById('box')!
      const g = new w.Svifa({ autoRaf: false })
      w.wheel(box, 50)
      // one made for the box by the page's Svifa gives way, and the box's own decides from then on
      let threw = false
      let own: any = null
      try {
        own = new w.Svifa({ autoRaf: false, scroller: box, wheel: false })
      } catch {
        threw = true
      }
      const left = w.wheel(box, 50)
      own?.destroy()
      g.destroy()
      const gone = w.wheel(box, 50)
      return { threw, left, gone, classes: box.className }
    })
    expect(result).toEqual({ threw: false, left: false, gone: false, classes: '' })
  })

  test('a box that scrolls sideways glides a sideways turn, and lets an up and down turn go to the page', async ({ page }) => {
    await open(page, BOXES)
    const result = await page.evaluate(() => {
      const w = window as any
      const wide = document.getElementById('wide')!
      const g = new w.Svifa({ autoRaf: false })
      w.frame(g)
      const sideways = w.wheel(wide, 0, { deltaX: 200 })
      w.frame(g, 60, 200)
      const down = w.wheel(wide, 100)
      return { sideways, left: wide.scrollLeft, down, page: g.target }
    })
    expect(result).toEqual({ sideways: true, left: 200, down: true, page: 100 })
  })
})

// Firefox draws whole pixels whatever it is asked, so Svifa draws nothing between them there
test.describe('a scrolling box drawn between pixels', { tag: '@not-firefox' }, () => {
  // The browser draws a scrolling box that has a layer of its own where it rests, moving its content by whatever the page around it
  // is moved by rounded to a whole device pixel. While the page glides, the box's content carries the rest.
  for (const scale of [1, 2]) {
    test.describe(`at a device scale of ${scale}`, () => {
      test.use({ deviceScaleFactor: scale })
      test('moves the content of every box with the page while the page glides, one the wheel leaves to the browser too, and leaves nothing at rest', async ({
        page,
      }) => {
        await open(
          page,
          `<main id="main"><section style="height: 300px"></section><section id="s">
             <div id="box" style="height: 200px; overflow: auto; background: #fff"><p id="first" style="margin: 0">text</p><div style="height: 1000px"></div></div>
             <div id="native" data-svifa-native style="height: 200px; overflow: auto"><p id="kept" style="margin: 0">text</p><div style="height: 1000px"></div></div>
           </section><section style="height: 6000px"></section></main>`
        )
        await page.evaluate(() => {
          const w = window as any
          window.scrollTo({ top: 200, behavior: 'instant' })
          w.g = new w.Svifa({ autoRaf: false })
        })
        await page.waitForFunction(() => document.getElementById('kept')!.style.willChange === 'translate', null, { timeout: 3000 })
        const result = await page.evaluate(() => {
          const w = window as any
          const y = (element: HTMLElement) =>
            element.style.translate ? Number.parseFloat(element.style.translate.split(' ')[1]) : 0
          const main = document.getElementById('main')!
          const ids = ['first', 'kept'].map((id) => document.getElementById(id)!)
          w.frame(w.g)
          w.wheel(window, 77.7)
          let worst = 0
          let frames = 0
          while (w.g.isGliding && frames < 2000) {
            w.frame(w.g, 240)
            frames++
            // what the page is drawn by, and what the browser leaves of it on the box: the part over the nearest whole device pixel
            const moved = y(main) * devicePixelRatio
            const left = (moved - Math.sign(moved) * Math.round(Math.abs(moved))) / devicePixelRatio
            for (const element of ids) worst = Math.max(worst, Math.abs(y(element) - left))
          }
          return { frames, worst, rest: ids.map((element) => element.style.translate) }
        })
        expect(result.frames).toBeGreaterThan(10)
        // (to within the six decimals a translate is written to)
        expect(result.worst).toBeLessThan(1e-6)
        expect(result.rest).toEqual(['', ''])
      })
    })
  }

  test('never shows a scroll bar a box does not have while its content moves with the page', async ({ page }) => {
    await open(
      page,
      `<main id="main"><section style="height: 300px"></section><section>
         <div id="code" style="overflow-x: auto; background: #fff"><pre id="pre" style="margin: 0; width: 3000px">${'line<br>'.repeat(8)}</pre></div>
       </section><section style="height: 6000px"></section></main>`
    )
    await page.evaluate(() => {
      const w = window as any
      window.scrollTo({ top: 200, behavior: 'instant' })
      w.g = new w.Svifa({ autoRaf: false })
    })
    await page.waitForFunction(() => document.getElementById('pre')!.style.willChange === 'translate', null, { timeout: 3000 })
    const result = await page.evaluate(() => {
      const w = window as any
      const code = document.getElementById('code')!
      // the box's own overflow, as it is written on it
      const own = () => [code.style.overflowX, code.style.overflowY].join(' / ')
      const style = own()
      // the box shows a vertical scroll bar whenever what it holds is taller than it and its overflow lets it scroll that way (the
      // test browser hides scroll bars, so they are not measured by their width)
      const bar = () => code.scrollHeight > code.clientHeight && /auto|scroll|overlay/.test(getComputedStyle(code).overflowY)
      const before = bar()
      w.frame(w.g)
      w.wheel(window, 77.7)
      let shown = 0
      let moved = 0
      while (w.g.isGliding) {
        w.frame(w.g, 240)
        if (bar()) shown++
        if (document.getElementById('pre')!.style.translate) moved++
      }
      return { before, shown, moved, same: own() === style, after: bar() }
    })
    expect(result.moved).toBeGreaterThan(10)
    expect(result).toMatchObject({ before: false, shown: 0, same: true, after: false })
  })

  test('is ready before the wheel first turns over it, draws its content between pixels while it glides, and leaves nothing at rest', async ({
    page,
  }) => {
    await open(page, BOXES)
    await page.evaluate(() => {
      const w = window as any
      w.g = new w.Svifa({ autoRaf: false })
    })
    // the page is chosen once it is idle, and the boxes found inside it with it
    await page.waitForFunction(() => document.getElementById('first')!.style.willChange === 'translate', null, { timeout: 3000 })
    const result = await page.evaluate(() => {
      const w = window as any
      const box = document.getElementById('box')!
      const first = document.getElementById('first')!
      w.frame(w.g)
      w.wheel(box, 77.7)
      let drawn = false
      let worst = 0
      while (box.scrollTop < 77 || first.style.translate !== '') {
        w.frame(w.g, 240)
        if (first.style.translate !== '') drawn = true
        const y = first.style.translate ? Number.parseFloat(first.style.translate.split(' ')[1]) : 0
        worst = Math.max(worst, y)
        if (w.clock > 20000) break
      }
      const rest = { top: box.scrollTop, translate: first.style.translate }
      w.g.destroy()
      return { drawn, worst, rest, after: first.getAttribute('style') }
    })
    expect(result.drawn).toBe(true)
    // only ever moved toward the start
    expect(result.worst).toBeLessThanOrEqual(0)
    expect(result.rest).toEqual({ top: 78, translate: '' })
    expect(result.after).toBe('margin: 0px;')
  })
})
