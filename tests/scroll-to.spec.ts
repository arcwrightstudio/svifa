import { expect, test } from '@playwright/test'
import { open, settle } from './setup'

const PAGE = `
  <div style="height: 1200px"></div>
  <section id="a" style="height: 400px; scroll-margin-top: 30px">A</section>
  <div style="height: 1200px"></div>
  <section id="fn-†" style="height: 400px">B</section>
  <div class="tall"></div>`

test.describe('scrollTo', () => {
  test('goes to a number, an element, a selector, an #id, the top and the bottom', async ({ page }) => {
    await open(page, PAGE)
    const places = await page.evaluate(async () => {
      const w = window as any
      const g = new w.Svifa({ autoRaf: false })
      const go = async (target: unknown, options?: unknown) => {
        g.scrollTo(target, { immediate: true, ...(options as object) })
        return window.scrollY
      }
      return {
        number: await go(500),
        element: await go(document.querySelector('#a')),
        selector: await go('section:last-of-type'),
        id: await go('#fn-†'),
        offset: await go('#a', { offset: -100 }),
        top: await go('top'),
        bottom: await go('bottom'),
        start: await go('start'),
        end: await go('end'),
        hashTop: await go('#top'),
        limit: g.limit,
      }
    })
    expect(places.number).toBe(500)
    expect(places.element).toBe(1200 - 30) // less its scroll-margin
    expect(places.selector).toBe(1200 + 400 + 1200)
    expect(places.id).toBe(1200 + 400 + 1200)
    expect(places.offset).toBe(1200 - 30 - 100)
    expect(places.top).toBe(0)
    expect(places.bottom).toBe(places.limit)
    expect(places.start).toBe(0)
    expect(places.end).toBe(places.limit)
    expect(places.hashTop).toBe(0)
  })

  test("honours the scroller's scroll-padding", async ({ page }) => {
    await open(page, PAGE, 'html { scroll-padding-top: 64px; }')
    const at = await page.evaluate(() => {
      const w = window as any
      const g = new w.Svifa({ autoRaf: false })
      g.scrollTo('#a', { immediate: true })
      return window.scrollY
    })
    expect(at).toBe(1200 - 30 - 64)
  })

  test('resolves true when it arrives', async ({ page }) => {
    await open(page, PAGE)
    await page.evaluate(() => {
      const w = window as any
      w.g = new w.Svifa({ autoRaf: false })
      w.frame(w.g)
      w.done = undefined
      w.g.scrollTo('#a').then((arrived: boolean) => (w.done = arrived))
    })
    await settle(page)
    expect(await page.evaluate(() => [(window as any).done, window.scrollY])).toEqual([true, 1170])
  })

  test('resolves false when the wheel takes over, and the wheel carries on from where the glide had got to', async ({ page }) => {
    await open(page, PAGE)
    const state = await page.evaluate(async () => {
      const w = window as any
      w.g = new w.Svifa({ autoRaf: false })
      w.frame(w.g)
      let arrived: boolean | undefined
      const done = w.g.scrollTo(3000).then((a: boolean) => (arrived = a))
      w.frame(w.g, 60, 10)
      const at = w.g.scroll
      w.wheel(window, 100)
      await done
      return { arrived, at, target: w.g.target }
    })
    expect(state.arrived).toBe(false)
    expect(state.target).toBeCloseTo(state.at + 100, 6)
  })

  test('resolves false, with a warning, for a target that is not on the page, and never throws on a bad selector', async ({
    page,
  }) => {
    await open(page, PAGE)
    const warnings: string[] = []
    page.on('console', (message) => message.type() === 'warning' && warnings.push(message.text()))
    const results = await page.evaluate(async () => {
      const w = window as any
      const g = new w.Svifa({ autoRaf: false })
      return [await g.scrollTo('#missing'), await g.scrollTo('[[[not a selector'), await g.scrollTo(Number.NaN)]
    })
    expect(results).toEqual([false, false, false])
    expect(warnings.length).toBe(3)
  })

  test('keeps the wheel out while a locked glide is under way', async ({ page }) => {
    await open(page, PAGE)
    const state = await page.evaluate(() => {
      const w = window as any
      w.g = new w.Svifa({ autoRaf: false })
      w.frame(w.g)
      w.g.scrollTo(2000, { lock: true })
      w.frame(w.g, 60, 3)
      const prevented = w.wheel(window, 500)
      return { prevented, target: w.g.target }
    })
    expect(state).toEqual({ prevented: true, target: 2000 })
    expect((await settle(page)).at(-1)).toBe(2000)
  })

  test('takes a duration and an easing of its own', async ({ page }) => {
    await open(page, PAGE)
    const result = await page.evaluate(() => {
      const w = window as any
      w.g = new w.Svifa({ autoRaf: false })
      w.frame(w.g)
      w.g.scrollTo(1000, { duration: 1, easing: (t: number) => t })
      w.frame(w.g, 60, 30)
      const half = w.g.scroll
      w.frame(w.g, 60, 31)
      return { half, end: w.g.scroll, gliding: w.g.isGliding }
    })
    expect(result.half).toBeCloseTo(500, 0)
    expect(result.end).toBe(1000)
    expect(result.gliding).toBe(false)
  })

  test('jumps at once with immediate, and when the reader asks for less motion', async ({ page }) => {
    await open(page, PAGE)
    expect(
      await page.evaluate(() => {
        const w = window as any
        const g = new w.Svifa({ autoRaf: false })
        g.scrollTo(800, { immediate: true })
        return [window.scrollY, g.isGliding]
      })
    ).toEqual([800, false])

    await page.emulateMedia({ reducedMotion: 'reduce' })
    await open(page, PAGE)
    expect(
      await page.evaluate(async () => {
        const w = window as any
        const g = new w.Svifa({ autoRaf: false })
        const arrived = await g.scrollTo(900)
        return [window.scrollY, g.isGliding, arrived, w.wheel(window, 100)]
      })
    ).toEqual([900, false, true, false])
  })

  test('glides even while stopped when forced', async ({ page }) => {
    await open(page, PAGE)
    const result = await page.evaluate(async () => {
      const w = window as any
      const g = new w.Svifa({ autoRaf: false })
      g.stop()
      const refused = await g.scrollTo(400, { immediate: true })
      const at = window.scrollY
      await g.scrollTo(600, { immediate: true, force: true })
      return { refused, at, forced: window.scrollY }
    })
    expect(result).toEqual({ refused: false, at: 0, forced: 600 })
  })
})

test('takes an option that is not a number as its default, so nothing becomes NaN', async ({ page }) => {
  await open(page)
  const result = await page.evaluate(async () => {
    const w = window as any
    w.g = new w.Svifa({ autoRaf: false, lerp: Number.NaN, wheelSpeed: Number.NaN })
    w.frame(w.g)
    w.wheel(window, 100)
    while (w.g.isGliding) w.frame(w.g)
    const afterWheel = window.scrollY
    const arrived = w.g.scrollTo(500, { offset: Number.NaN, lerp: Number.NaN })
    while (w.g.isGliding) w.frame(w.g)
    return { afterWheel, y: window.scrollY, arrived: await arrived, lerp: w.g.options.lerp, speed: w.g.options.wheelSpeed }
  })
  expect(result).toEqual({ afterWheel: 100, y: 500, arrived: true, lerp: 0.1, speed: 1 })
})

test('a glide with its own lerp keeps it; a later scrollTo answers the earlier one false', async ({ page }) => {
  await open(page)
  const result = await page.evaluate(async () => {
    const w = window as any
    const g = new w.Svifa({ autoRaf: false })
    w.frame(g)
    const frames = (lerp?: number) => {
      g.scrollTo(0, { immediate: true })
      g.scrollTo(600, lerp === undefined ? {} : { lerp })
      let n = 0
      while (g.isGliding) {
        w.frame(g)
        n++
      }
      return n
    }
    const usual = frames()
    const slow = frames(0.03)
    const first = g.scrollTo(2000)
    w.frame(g, 60, 3)
    const second = g.scrollTo(100)
    while (g.isGliding) w.frame(g)
    return { usual, slow, first: await first, second: await second, y: window.scrollY }
  })
  expect(result.slow).toBeGreaterThan(result.usual * 2)
  expect(result).toMatchObject({ first: false, second: true, y: 100 })
})
