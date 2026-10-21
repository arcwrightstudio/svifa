// configure(): how Svifa feels, changed while the page is open.
import { expect, test } from '@playwright/test'
import { open } from './setup'

// Frames (at 60 Hz) a 300 px wheel turn takes to rest, from the page's top.
const framesToRest = `(w, g) => {
  g.scrollTo(0, { immediate: true })
  w.frame(g)
  w.wheel(window, 300)
  let frames = 0
  while (g.isGliding && frames < 2000) { w.frame(g); frames++ }
  return { frames, y: window.scrollY }
}`

test('a lower lerp glides longer and softer, a duration sets the time, and both can be changed back', async ({ page }) => {
  await open(page)
  const result = await page.evaluate((source) => {
    const w = window as any
    const rest = new Function(`return ${source}`)() as (w: unknown, g: unknown) => { frames: number; y: number }
    const g = new w.Svifa({ autoRaf: false })
    const normal = rest(w, g)
    g.configure({ lerp: 0.04 })
    const slow = rest(w, g)
    g.configure({ duration: 0.5 })
    const timed = rest(w, g)
    g.configure({ duration: undefined, lerp: 0.1 })
    const back = rest(w, g)
    g.configure({ lerp: Number.NaN, wheelSpeed: Number.POSITIVE_INFINITY })
    return { normal, slow, timed, back, lerp: g.options.lerp, speed: g.options.wheelSpeed, duration: g.options.duration }
  }, framesToRest)
  expect(result.slow.frames).toBeGreaterThan(result.normal.frames * 2)
  expect(result.timed.frames).toBe(30)
  expect(result.back.frames).toBe(result.normal.frames)
  for (const run of [result.normal, result.slow, result.timed, result.back]) expect(run.y).toBe(300)
  expect(result).toMatchObject({ lerp: 0.1, speed: 1, duration: undefined })
})

test('wheelSpeed, wheel and anchors change while the page is open; after destroy, configure does nothing', async ({ page }) => {
  await open(
    page,
    '<a id="go" href="#far">far</a><div style="height: 3000px"></div><section id="far">Far</section><div class="tall"></div>'
  )
  const result = await page.evaluate(() => {
    const w = window as any
    const g = new w.Svifa({ autoRaf: false })
    w.frame(g)
    g.configure({ wheelSpeed: 2 })
    w.wheel(window, 100)
    const target = g.target
    while (g.isGliding) w.frame(g)
    g.configure({ wheel: false })
    const leftToBrowser = !w.wheel(window, 100)
    // after Svifa has seen a click (it listens on the document), note whether it took it, then keep the page where it is
    let taken = false
    window.addEventListener('click', (event) => {
      taken = event.defaultPrevented
      event.preventDefault()
    })
    const click = () => {
      document
        .getElementById('go')!
        .dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0, detail: 1 }))
      return taken
    }
    const before = click()
    g.configure({ anchors: true })
    const on = click()
    g.configure({ anchors: false })
    const off = click()
    g.destroy()
    g.configure({ anchors: true })
    const afterDestroy = click()
    return { target, leftToBrowser, before, on, off, afterDestroy }
  })
  expect(result).toEqual({ target: 200, leftToBrowser: true, before: false, on: true, off: false, afterDestroy: false })
})

test('configure takes an easing for timed glides', async ({ page }) => {
  await open(page)
  const half = await page.evaluate(() => {
    const w = window as any
    const g = new w.Svifa({ autoRaf: false })
    w.frame(g)
    g.configure({ duration: 1, easing: (t: number) => t })
    w.wheel(window, 600)
    w.frame(g, 60, 30)
    return g.scroll
  })
  expect(Math.abs(half - 300)).toBeLessThan(1)
})
