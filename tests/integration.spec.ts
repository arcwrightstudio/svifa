// What the page around Svifa relies on keeps working, and what the browser does on its own takes over from a glide.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { expect, test } from '@playwright/test'
import { open } from './setup'

const SVIFA_CSS = readFileSync(fileURLToPath(new URL('../svifa.css', import.meta.url)), 'utf8')

test.describe('the page around Svifa', () => {
  test('IntersectionObserver sees an element come into view during a glide, and scroll events fire as usual', async ({ page }) => {
    await open(page, '<div style="height: 2000px"></div><section id="far" style="height: 200px">far</section><div class="tall"></div>')
    const result = await page.evaluate(async () => {
      const w = window as any
      let seen = false
      let scrolls = 0
      new IntersectionObserver((entries) => entries.some((entry) => entry.isIntersecting) && (seen = true)).observe(
        document.getElementById('far')!
      )
      window.addEventListener('scroll', () => scrolls++)
      w.g = new w.Svifa()
      w.g.scrollTo('#far')
      await new Promise((resolve) => setTimeout(resolve, 2500))
      return { seen, scrolls, gliding: w.g.isGliding }
    })
    expect(result.seen).toBe(true)
    expect(result.scrolls).toBeGreaterThan(5)
  })

  test('a scroll-driven animation follows a glide', { tag: '@chromium-only' }, async ({ page }) => {
    await open(
      page,
      '<div id="bar" style="position: fixed; top: 0; height: 4px; width: 100px"></div><div class="tall"></div>',
      '@keyframes grow { from { width: 0 } to { width: 1000px } } #bar { animation: grow linear both; animation-timeline: scroll(root); }'
    )
    const widths = await page.evaluate(async () => {
      const w = window as any
      const bar = document.getElementById('bar')!
      const before = bar.getBoundingClientRect().width
      w.g = new w.Svifa()
      await w.g.scrollTo(4600)
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
      return { before, after: bar.getBoundingClientRect().width }
    })
    expect(widths.before).toBe(0)
    expect(widths.after).toBeGreaterThan(400)
  })

  test('find in page takes over from a glide', { tag: '@not-webkit' }, async ({ page }) => {
    await open(page, '<div style="height: 6000px"></div><p>needle in the page</p><div class="tall"></div>')
    const state = await page.evaluate(async () => {
      const w = window as any
      w.g = new w.Svifa()
      w.result = null
      w.g.scrollTo(9000, { duration: 4 }).then((arrived: boolean) => (w.result = arrived))
      await new Promise((resolve) => setTimeout(resolve, 300))
      ;(window as any).find('needle')
      await new Promise((resolve) => setTimeout(resolve, 600))
      return { gliding: w.g.isGliding, result: w.result, y: window.scrollY }
    })
    expect(state.gliding).toBe(false)
    expect(state.result).toBe(false)
    expect(state.y).toBeLessThan(6500)
  })
})

test.describe('what it reports', () => {
  test('a scroll Svifa did not make is reported to on("scroll"); velocity and direction follow a glide; limit is measured now', async ({
    page,
  }) => {
    await open(page, '<div id="grow" style="height: 3000px"></div>')
    const result = await page.evaluate(async () => {
      const w = window as any
      const g = new w.Svifa({ autoRaf: false })
      let reports = 0
      g.on('scroll', () => reports++)
      window.scrollTo({ top: 500, behavior: 'instant' })
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
      const native = { reports, scroll: g.scroll }
      w.frame(g)
      w.wheel(window, 300)
      w.frame(g, 60, 5)
      const down = { velocity: g.velocity, direction: g.direction }
      while (g.isGliding) w.frame(g)
      const rested = g.velocity
      w.wheel(window, -200)
      w.frame(g, 60, 5)
      const up = { velocity: g.velocity, direction: g.direction }
      const limitBefore = g.limit
      document.getElementById('grow')!.style.height = '4000px'
      return { native, down, rested, up, limitBefore, limitAfter: g.limit }
    })
    expect(result.native).toEqual({ reports: 1, scroll: 500 })
    expect(result.down.velocity).toBeGreaterThan(0)
    expect(result.down.direction).toBe(1)
    expect(result.rested).toBe(0)
    expect(result.up.velocity).toBeLessThan(0)
    expect(result.up.direction).toBe(-1)
    expect(result.limitAfter - result.limitBefore).toBe(1000)
  })
})

test.describe('svifa.css', () => {
  test('a frame on the page stops catching the wheel while a glide is under way, and catches it again at rest', async ({ page }) => {
    await open(page, '<iframe id="frame" srcdoc="<p>embedded</p>"></iframe><div class="tall"></div>', SVIFA_CSS)
    const events = await page.evaluate(() => {
      const w = window as any
      const g = new w.Svifa({ autoRaf: false })
      const frame = document.getElementById('frame')!
      const at = () => getComputedStyle(frame).pointerEvents
      const rest = at()
      w.frame(g)
      w.wheel(window, 300)
      w.frame(g)
      const gliding = at()
      while (g.isGliding) w.frame(g)
      return { rest, gliding, after: at() }
    })
    expect(events).toEqual({ rest: 'auto', gliding: 'none', after: 'auto' })
  })

  test('stop() holds the keyboard as well as the wheel; reduced motion does not let the wheel through while stopped', async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await open(page, '', SVIFA_CSS)
    await page.evaluate(() => {
      const w = window as any
      w.g = new w.Svifa()
      w.g.stop()
    })
    await page.keyboard.press('PageDown')
    await page.keyboard.press('End')
    await page.waitForTimeout(500)
    const result = await page.evaluate(() => ({ y: window.scrollY, held: (window as any).wheel(window, 100) }))
    expect(result).toEqual({ y: 0, held: true })
  })
})
