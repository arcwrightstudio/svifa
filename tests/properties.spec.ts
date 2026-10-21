// Properties of the motion, each checked on many generated cases (fast-check): wheel turns, lerps, durations and curves of every
// size, frames at any rate and unevenly spaced, and options of kinds the types do not allow (a script build takes whatever it is
// given). Every case runs in the page on the test's own clock. A failing case is shrunk to the smallest one that still fails, and the
// report gives the seed and path that replay it (fc.assert's `seed` and `path` options).
import fc from 'fast-check'
import type { Page } from '@playwright/test'
import { expect, test } from './fixtures'
import { open } from './setup'

// frames from 1000 Hz down to 20 Hz, unevenly spaced, used in turn
const frames = fc.array(fc.integer({ min: 1, max: 50 }), { minLength: 1, maxLength: 12 })
// where a case starts, as a share of the page's length
const from = fc.double({ min: 0, max: 1, noNaN: true })
const lerp = fc.double({ min: 0.02, max: 1, noNaN: true })
const turn = fc.integer({ min: -4000, max: 4000 }).filter((delta) => delta !== 0)

// a hundred or more cases a test, each bounded, take a few seconds alone and longer on a busy machine
test.describe.configure({ timeout: 120_000 })

async function check<T>(page: Page, arbitrary: fc.Arbitrary<T>, run: (value: T) => Promise<void>, numRuns = 100) {
  await open(page)
  await fc.assert(fc.asyncProperty(arbitrary, run), { numRuns })
}

// The motion's own properties, run at the project's device scale and again at 2, where some browsers keep whole CSS pixels.
function motion() {
  test('a glide by lerp follows one curve in time, whatever the frames, and rests on the frame the curve reaches its pixel', async ({
    page,
  }) => {
    await check(page, fc.record({ lerp, from, delta: turn, frames }), async (c) => {
      const run = await page.evaluate(({ lerp, from, delta, frames }) => {
        const w = window as any
        const limit = document.documentElement.scrollHeight - innerHeight
        // the browser's grid: device pixels, or whole CSS pixels in one that keeps those
        window.scrollTo({ top: 100.5, behavior: 'instant' })
        const per = Number.isInteger(window.scrollY) ? 1 : devicePixelRatio
        const start = Math.round(from * limit)
        window.scrollTo({ top: start, behavior: 'instant' })
        const g = new w.Svifa({ autoRaf: false, lerp })
        let clock = 1000
        g.raf(clock)
        w.wheel(window, delta)
        const goal = g.target
        const rate = lerp * 60
        let elapsed = 0
        let off = 0
        let wrongFrame = -1
        let count = 0
        for (; g.isGliding && count < 100000; count++) {
          const ms = frames[count % frames.length]
          clock += ms
          elapsed += ms / 1000
          g.raf(clock)
          const curve = goal + (start - goal) * Math.exp(-rate * elapsed)
          // the curve rests once the browser would draw it on the pixel of its end (a frame that lands on the half pixel between,
          // to within rounding, may go either way)
          const away = Math.abs(curve - goal) * per
          if (g.isGliding === away < 0.5 && Math.abs(away - 0.5) > 1e-9 && wrongFrame < 0) wrongFrame = count
          if (g.isGliding) off = Math.max(off, Math.abs(g.scroll - curve))
        }
        const rest = { scroll: g.scroll, y: window.scrollY, gliding: g.isGliding }
        g.destroy()
        return { start, limit, goal, off, wrongFrame, rest }
      }, c)
      expect(run.goal).toBe(Math.min(Math.max(run.start + c.delta, 0), run.limit))
      expect(run.off).toBeLessThan(1e-6)
      expect(run.wrongFrame).toBe(-1)
      expect(run.rest).toEqual({ scroll: run.goal, y: run.goal, gliding: false })
    })
  })

  test('wheel turns at any timing stay inside the page, head for the latest goal, and rest on the sum the page allows', async ({
    page,
  }) => {
    const step = fc.oneof(
      turn.map((wheel) => ({ wheel })),
      frames.map((frames) => ({ frames }))
    )
    const cases = fc.record({ lerp, from, steps: fc.array(step, { minLength: 1, maxLength: 16 }), tail: frames })
    await check(page, cases, async (c) => {
      const problems = await page.evaluate(({ lerp, from, steps, tail }) => {
        const w = window as any
        const limit = document.documentElement.scrollHeight - innerHeight
        let goal = Math.round(from * limit)
        window.scrollTo({ top: goal, behavior: 'instant' })
        const g = new w.Svifa({ autoRaf: false, lerp })
        let clock = 1000
        g.raf(clock)
        const found: string[] = []
        const frame = (ms: number) => {
          const before = g.scroll
          clock += ms
          g.raf(clock)
          const now = g.scroll
          if (!(now >= 0 && now <= limit)) found.push(`at ${now}, outside 0 to ${limit}`)
          // every frame moves toward the goal, and never past it
          if (now < Math.min(before, goal) - 1e-9 || now > Math.max(before, goal) + 1e-9) {
            found.push(`moved from ${before} to ${now}, heading for ${goal}`)
          }
        }
        for (const step of steps) {
          if ('wheel' in step) {
            goal = Math.min(Math.max(goal + step.wheel, 0), limit)
            w.wheel(window, step.wheel)
            if (g.target !== goal) found.push(`heading for ${g.target} after a turn of ${step.wheel}, not ${goal}`)
          } else {
            for (const ms of step.frames) frame(ms)
          }
        }
        for (let i = 0; g.isGliding && i < 100000; i++) frame(tail[i % tail.length])
        if (g.isGliding) found.push('still gliding')
        if (g.scroll !== goal || window.scrollY !== goal) found.push(`rests at ${g.scroll} (${window.scrollY}), not ${goal}`)
        g.destroy()
        return found
      }, c)
      expect(problems).toEqual([])
    })
  })

  test('a timed glide follows its curve over its time, arrives on the frame its time runs out, and resolves true', async ({
    page,
  }) => {
    const cases = fc.record({
      duration: fc.double({ min: 0.05, max: 3, noNaN: true }),
      curve: fc.integer({ min: 0, max: 3 }),
      from,
      to: fc.integer({ min: -2000, max: 12000 }),
      frames,
    })
    await check(page, cases, async (c) => {
      const run = await page.evaluate(async ({ duration, curve, from, to, frames }) => {
        const w = window as any
        const curves = [
          (t: number) => t,
          (t: number) => 1 - (1 - t) ** 3,
          (t: number) => (t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2),
          (t: number) => (t === 1 ? 1 : 1 - 2 ** (-10 * t)),
        ]
        const easing = curves[curve]
        const limit = document.documentElement.scrollHeight - innerHeight
        const start = Math.round(from * limit)
        const goal = Math.min(Math.max(to, 0), limit)
        window.scrollTo({ top: start, behavior: 'instant' })
        const g = new w.Svifa({ autoRaf: false })
        let clock = 1000
        g.raf(clock)
        const arrived = g.scrollTo(to, { duration, easing })
        let elapsed = 0
        let off = 0
        let count = 0
        let due = -1 // the frame on which the time runs out
        for (; g.isGliding && count < 100000; count++) {
          const ms = frames[count % frames.length]
          clock += ms
          elapsed += ms / 1000
          if (due < 0 && elapsed / duration >= 1) due = count
          g.raf(clock)
          if (g.isGliding) off = Math.max(off, Math.abs(g.scroll - (start + (goal - start) * easing(elapsed / duration))))
        }
        const result = { goal, start, off, last: count - 1, due, resolved: await arrived, scroll: g.scroll, y: window.scrollY }
        g.destroy()
        return result
      }, c)
      expect(run.off).toBeLessThan(1e-9)
      expect(run.resolved).toBe(true)
      expect([run.scroll, run.y]).toEqual([run.goal, run.goal])
      // no glide at all when it is already there
      expect(run.last).toBe(run.goal === run.start ? -1 : run.due)
    })
  })
}

test.describe('properties', () => {
  motion()

  test.describe('at a device scale of 2', () => {
    test.use({ deviceScaleFactor: 2 })
    motion()
  })

  test('options of any kind leave every setting usable, and the scroller always inside the page', async ({ page }) => {
    const anything = fc.oneof(
      fc.double(),
      fc.integer(),
      fc.constantFrom(undefined, null, '', '1', '0.5', true, false, [], {}, 'linear')
    )
    const options = fc.record({ lerp: anything, duration: anything, easing: anything, wheelSpeed: anything }, { requiredKeys: [] })
    const cases = fc.record({
      made: options,
      changes: options,
      to: fc.record({ lerp: anything, duration: anything, easing: anything, offset: anything }, { requiredKeys: [] }),
      target: fc.integer({ min: -1000, max: 11000 }),
      turns: fc.array(turn, { maxLength: 4 }),
    })
    await check(
      page,
      cases,
      async (c) => {
        const run = await page.evaluate(
          async ({ made, changes, to, target, turns }) => {
            const w = window as any
            const limit = document.documentElement.scrollHeight - innerHeight
            window.scrollTo({ top: 0, behavior: 'instant' })
            const found: string[] = []
            let g: any
            try {
              g = new w.Svifa({ ...made, autoRaf: false })
              g.configure(changes)
              let clock = 1000
              const frames = (count: number) => {
                for (let i = 0; i < count && g.isGliding; i++) {
                  clock += 16
                  g.raf(clock)
                  const at = g.scroll
                  if (!(at >= 0 && at <= limit)) found.push(`at ${at}`)
                }
              }
              g.raf(clock)
              void g.scrollTo(target, to)
              frames(200)
              for (const delta of turns) {
                w.wheel(window, delta)
                if (!(g.target >= 0 && g.target <= limit)) found.push(`heading for ${g.target}`)
                frames(50)
              }
              const s = g.options
              if (!(s.lerp > 0 && s.lerp <= 1)) found.push(`lerp ${s.lerp}`)
              if (s.duration !== undefined && !(Number.isFinite(s.duration) && s.duration > 0)) found.push(`duration ${s.duration}`)
              if (typeof s.easing !== 'function' || !Number.isFinite(s.easing(0.5))) found.push(`easing ${String(s.easing)}`)
              if (!Number.isFinite(s.wheelSpeed)) found.push(`wheelSpeed ${s.wheelSpeed}`)
            } catch (error) {
              found.push(String(error))
            } finally {
              g?.destroy()
            }
            return found
          },
          { made: c.made, changes: c.changes, to: c.to, target: c.target, turns: c.turns }
        )
        expect(run).toEqual([])
      },
      200
    )
  })
})
