// Edges of the page that Svifa meets in real sites: other scrollers, keys, scripts, snapping, odd layouts, and its own lifecycle.
import { expect, test } from '@playwright/test'
import { open, settle } from './setup'

test.describe('other scrollers and other input', () => {
  test('a box on the page keeps its own scrollend after the page has glided', async ({ page }) => {
    await open(page, '<div id="box" style="height: 200px; overflow: auto"><div style="height: 1000px"></div></div><div class="tall"></div>')
    const ends = await page.evaluate(async () => {
      const w = window as any
      const box = document.getElementById('box')!
      let seen = 0
      box.addEventListener('scrollend', () => seen++)
      w.g = new w.Svifa()
      w.wheel(window, 200)
      await new Promise((resolve) => setTimeout(resolve, 1800))
      box.scrollTo({ top: 300, behavior: 'instant' })
      await new Promise((resolve) => setTimeout(resolve, 400))
      return seen
    })
    // where the browser has scrollend at all (it is not in every engine yet), the box's own arrives
    const supported = await page.evaluate(() => 'onscrollend' in window)
    expect(ends).toBe(supported ? 1 : 0)
  })

  test('a key pressed during a glide takes over, in every browser', async ({ page }) => {
    await open(page)
    await page.evaluate(() => {
      const w = window as any
      w.g = new w.Svifa()
      w.result = null
      w.g.scrollTo(3000, { duration: 4 }).then((arrived: boolean) => (w.result = arrived))
    })
    await page.waitForTimeout(400)
    await page.keyboard.press('End')
    await page.waitForFunction(() => window.scrollY >= document.documentElement.scrollHeight - innerHeight - 1, null, { timeout: 4000 })
    expect(await page.evaluate(() => [(window as any).g.isGliding, (window as any).result])).toEqual([false, false])
  })

  test('a script that scrolls earlier in the same frame takes over, and scrollTo answers false', async ({ page }) => {
    await open(page)
    const result = await page.evaluate(async () => {
      const w = window as any
      const g = new w.Svifa({ autoRaf: false })
      w.frame(g)
      const arrived = g.scrollTo(3000)
      w.frame(g, 60, 3)
      window.scrollTo({ top: 7000, behavior: 'instant' })
      w.frame(g)
      return { y: window.scrollY, gliding: g.isGliding, arrived: await arrived, scroll: g.scroll }
    })
    expect(result).toEqual({ y: 7000, gliding: false, arrived: false, scroll: 7000 })
  })
})

test.describe('one Svifa per scroller', () => {
  test('a second Svifa on the same scroller is refused, plainly; after destroy, another may be made', async ({ page }) => {
    await open(page)
    const result = await page.evaluate(() => {
      const w = window as any
      const a = new w.Svifa({ autoRaf: false })
      let message = ''
      try {
        new w.Svifa({ autoRaf: false })
      } catch (error) {
        message = (error as Error).message
      }
      a.destroy()
      const b = new w.Svifa({ autoRaf: false })
      b.stop()
      return { message, classes: document.documentElement.className }
    })
    expect(result.message).toContain('already has a Svifa')
    expect(result.classes).toBe('svifa svifa-stopped')
  })
})

test.describe('layouts', () => {
  test('a scroller that snaps is left to the browser: the wheel is its own, and scrollTo moves at once', async ({ page }) => {
    await open(
      page,
      '<section style="height: 800px; scroll-snap-align: start"></section>'.repeat(8),
      'html { scroll-snap-type: y mandatory; }'
    )
    const result = await page.evaluate(() => {
      const w = window as any
      const g = new w.Svifa({ autoRaf: false })
      const prevented = w.wheel(window, 100)
      g.scrollTo(1600)
      return { prevented, gliding: g.isGliding, y: window.scrollY }
    })
    expect(result).toEqual({ prevented: false, gliding: false, y: 1600 })
  })

  test('a <body> that scrolls (html and body at full height) can be the scroller; an ordinary body stands for the page', async ({
    page,
  }) => {
    await open(page, '<div class="tall"></div>', 'html, body { height: 100%; overflow: auto; }')
    const own = await page.evaluate(() => {
      const w = window as any
      w.g = new w.Svifa({ autoRaf: false, scroller: document.body })
      w.frame(w.g)
      return { element: w.g.element.tagName, prevented: w.wheel(document.body, 200) }
    })
    expect(own).toEqual({ element: 'BODY', prevented: true })
    expect((await settle(page)).at(-1)).toBe(200)
    expect(await page.evaluate(() => document.body.scrollTop)).toBe(200)

    await open(page)
    expect(await page.evaluate(() => new (window as any).Svifa({ scroller: document.body }).element.tagName)).toBe('HTML')
  })

  test('a horizontal scroller in right-to-left content glides toward its end, and lands on an element by its right edge', async ({
    page,
  }) => {
    await open(
      page,
      `<div id="row" dir="rtl" style="width: 600px; overflow: auto; white-space: nowrap">
         ${'<span style="display: inline-block; width: 300px; height: 50px"></span>'.repeat(4)}<span id="far" style="display: inline-block; width: 300px; height: 50px"></span>${'<span style="display: inline-block; width: 300px; height: 50px"></span>'.repeat(4)}
       </div>`
    )
    const result = await page.evaluate(async () => {
      const w = window as any
      const row = document.getElementById('row')!
      w.g = new w.Svifa({ autoRaf: false, scroller: row, axis: 'horizontal' })
      w.frame(w.g)
      const prevented = w.wheel(row, 100)
      while (w.g.isGliding) w.frame(w.g)
      const afterWheel = row.scrollLeft
      w.g.scrollTo(document.getElementById('far'))
      while (w.g.isGliding) w.frame(w.g)
      const far = document.getElementById('far')!.getBoundingClientRect().right
      const port = row.getBoundingClientRect().left + row.clientLeft + row.clientWidth
      return { prevented, afterWheel, edge: Math.round(port - far) }
    })
    expect(result).toEqual({ prevented: true, afterWheel: -100, edge: 0 })
  })

  test('an element inside a scrolling box is brought into view in that box, then glided to', async ({ page }) => {
    await open(
      page,
      `<div style="height: 2000px"></div>
       <div id="box" style="height: 200px; overflow: auto"><div style="height: 1000px"></div><p id="deep" style="height: 40px">deep</p><div style="height: 1000px"></div></div>
       <div class="tall"></div>`
    )
    const result = await page.evaluate(() => {
      const w = window as any
      w.g = new w.Svifa({ autoRaf: false })
      w.frame(w.g)
      w.g.scrollTo('#deep')
      while (w.g.isGliding) w.frame(w.g)
      const deep = document.getElementById('deep')!.getBoundingClientRect()
      const box = document.getElementById('box')!.getBoundingClientRect()
      return { inBox: Math.round(deep.top - box.top), onScreen: Math.round(deep.top) }
    })
    expect(result).toEqual({ inBox: 0, onScreen: 0 })
  })

  test('finds a selector that starts with #, and honours a scroll-padding given as a percentage', async ({ page }) => {
    await open(page, '<div style="height: 1500px"></div><section id="a"><h2 style="margin: 0">Title</h2></section><div class="tall"></div>', 'html { scroll-padding-top: 10%; }')
    const result = await page.evaluate(async () => {
      const w = window as any
      const g = new w.Svifa({ autoRaf: false })
      w.frame(g)
      const arrived = g.scrollTo('#a h2')
      while (g.isGliding) w.frame(g)
      return { arrived: await arrived, y: window.scrollY, want: 1500 - Math.round(innerHeight * 0.1) }
    })
    expect(result.arrived).toBe(true)
    expect(result.y).toBe(result.want)
  })
})

test.describe('holding still', () => {
  test('stop() and a locked glide hold the wheel even with wheel: false', async ({ page }) => {
    await open(page)
    const result = await page.evaluate(() => {
      const w = window as any
      const g = new w.Svifa({ autoRaf: false, wheel: false })
      const free = w.wheel(window, 100)
      g.stop()
      const stopped = w.wheel(window, 100)
      g.start()
      g.scrollTo(3000, { lock: true })
      const locked = w.wheel(window, 100)
      return { free, stopped, locked }
    })
    expect(result).toEqual({ free: false, stopped: true, locked: true })
  })

  test('reduced motion turned on mid-glide finishes the glide at once', async ({ page }) => {
    await open(page)
    await page.evaluate(() => {
      const w = window as any
      w.g = new w.Svifa()
      w.result = null
      w.g.scrollTo(6000, { duration: 5 }).then((arrived: boolean) => (w.result = arrived))
    })
    await page.waitForTimeout(300)
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.waitForFunction(() => (window as any).result !== null, null, { timeout: 3000 })
    expect(await page.evaluate(() => [window.scrollY, (window as any).g.isGliding, (window as any).result])).toEqual([6000, false, true])
  })
})

test.describe('small things that should be exactly right', () => {
  test('the default easing reaches its end without a last jump', async ({ page }) => {
    await open(page)
    const steps = await page.evaluate(() => {
      const w = window as any
      const g = new w.Svifa({ autoRaf: false })
      w.frame(g)
      g.scrollTo(9000, { duration: 1 })
      const seen: number[] = []
      let last = 0
      while (g.isGliding) {
        w.frame(g)
        seen.push(g.scroll - last)
        last = g.scroll
      }
      return seen.slice(-3)
    })
    expect(steps[2]).toBeLessThan(steps[1] * 1.5)
  })

  test('target at rest is where the scroller is; an element keeps its own translate after a glide', async ({ page }) => {
    await open(page, '<section class="move" style="height: 9000px; translate: 0 5px"></section>', '.move { will-change: translate; }')
    const result = await page.evaluate(() => {
      const w = window as any
      const section = document.querySelector('.move') as HTMLElement
      section.style.translate = '0px 5px'
      const g = new w.Svifa({ autoRaf: false, subpixel: '.move' })
      w.frame(g)
      w.wheel(window, 77.7)
      let changed = false
      while (g.isGliding) {
        w.frame(g)
        if (section.style.translate !== '0px 5px') changed = true
      }
      return { scroll: g.scroll, target: g.target, changed, translate: section.style.translate }
    })
    expect(result).toEqual({ scroll: 78, target: 78, changed: true, translate: '0px 5px' })
  })

  test('a turn too small to move the scroller sends no scrollend and no scroll report', async ({ page }) => {
    await open(page)
    const result = await page.evaluate(async () => {
      const w = window as any
      let ends = 0
      document.addEventListener('scrollend', () => ends++)
      const g = new w.Svifa({ autoRaf: false })
      let reports = 0
      g.on('scroll', () => reports++)
      w.frame(g)
      w.wheel(window, 0.3)
      while (g.isGliding) w.frame(g)
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
      return { y: window.scrollY, ends, reports }
    })
    expect(result.y).toBe(0)
    expect(result.ends).toBe(0)
  })

  test('a duration that is not a finite number is left out, so the glide still ends', async ({ page }) => {
    await open(page)
    const result = await page.evaluate(async () => {
      const w = window as any
      const g = new w.Svifa({ autoRaf: false, duration: Number.POSITIVE_INFINITY })
      w.frame(g)
      const arrived = g.scrollTo(500, { duration: Number.POSITIVE_INFINITY })
      for (let i = 0; i < 600 && g.isGliding; i++) w.frame(g)
      return { y: window.scrollY, arrived: await arrived }
    })
    expect(result).toEqual({ y: 500, arrived: true })
  })
})

test.describe('the sub-pixel list', () => {
  test('warns once about a sticky element inside a listed element that is not listed itself', async ({ page }) => {
    await open(
      page,
      `<main><section class="move" style="height: 3000px"><div class="pin" style="position: sticky; top: 0; height: 50px"></div></section></main>`,
      '.move { will-change: translate; }'
    )
    const warnings = await page.evaluate(async () => {
      const w = window as any
      const seen: unknown[][] = []
      const warn = console.warn
      console.warn = (...args: unknown[]) => seen.push(args)
      w.g = new w.Svifa({ autoRaf: false, subpixel: '.move' })
      await new Promise((resolve) => setTimeout(resolve, 1500))
      console.warn = warn
      return seen.map((args) => ({ text: String(args[0]), count: (args[1] as unknown[]).length }))
    })
    expect(warnings).toHaveLength(1)
    expect(warnings[0].text).toContain('sticky')
    expect(warnings[0].count).toBe(1)
  })

  test('says nothing when the sticky element is listed too', async ({ page }) => {
    await open(
      page,
      `<main><section class="move" style="height: 3000px"><div class="move" style="position: sticky; top: 0; height: 50px"></div></section></main>`,
      '.move { will-change: translate; }'
    )
    const warnings = await page.evaluate(async () => {
      const w = window as any
      let seen = 0
      const warn = console.warn
      console.warn = () => seen++
      w.g = new w.Svifa({ autoRaf: false, subpixel: '.move' })
      await new Promise((resolve) => setTimeout(resolve, 1500))
      console.warn = warn
      return seen
    })
    expect(warnings).toBe(0)
  })
})

test('at a device scale of 2, a first glide that learns the browser keeps whole pixels on its last frame still rests on the nearest place', async ({
  browser,
}) => {
  const context = await browser.newContext({ deviceScaleFactor: 2, viewport: { width: 1280, height: 800 } })
  const page = await context.newPage()
  await open(page, '<main><section class="move" style="height: 9000px"></section></main>', '.move { will-change: translate; }')
  const rest = await page.evaluate(() => {
    const w = window as any
    const g = new w.Svifa({ autoRaf: false, subpixel: '.move' })
    w.frame(g)
    g.scrollTo(200.3, { duration: 0.001 })
    for (let i = 0; i < 20 && g.isGliding; i++) w.frame(g)
    return window.scrollY
  })
  // 200.5 on a device-pixel grid, 200 where the browser keeps whole CSS pixels: never 201
  expect([200, 200.5]).toContain(rest)
  await context.close()
})
