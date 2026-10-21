// What every test page shares: the built script loaded as window.Svifa, a page with plenty to scroll on an http origin of its own,
// and helpers that step Svifa frame by frame on a clock of the test's own (autoRaf: false), so every run sees exactly the same frames.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import type { Page } from '@playwright/test'

const script = readFileSync(fileURLToPath(new URL('../dist/svifa.global.js', import.meta.url)), 'utf8')
export const ORIGIN = 'http://svifa.test'
// the script build is served from an address of its own, which is how a coverage run tells it apart from everything else on the page
export const SCRIPT_URL = `${ORIGIN}/svifa.global.js`

export async function open(page: Page, body = '', css = '') {
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>
      html, body { margin: 0; }
      .tall { height: 10000px; background: linear-gradient(#eee, #ccc); }
      ${css}
    </style></head><body>${body || '<div class="tall"></div>'}</body></html>`
  await page.route(`${ORIGIN}/**`, (route) =>
    route.request().url() === SCRIPT_URL
      ? route.fulfill({ contentType: 'text/javascript', body: script })
      : route.fulfill({ contentType: 'text/html', body: html })
  )
  await page.goto(`${ORIGIN}/page`)
  await page.addScriptTag({ url: SCRIPT_URL })
  await page.evaluate(() => {
    const w = window as unknown as Record<string, unknown>
    // the clock: frames at a set rate, in milliseconds
    w.clock = 1000
    w.frame = (svifa: { raf: (t: number) => void }, hz = 60, count = 1) => {
      for (let i = 0; i < count; i++) {
        w.clock = (w.clock as number) + 1000 / hz
        svifa.raf(w.clock as number)
      }
    }
    // a wheel turn, as the browser sends it: cancelable, bubbling
    w.wheel = (target: EventTarget, deltaY: number, more: WheelEventInit = {}) => {
      const event = new WheelEvent('wheel', { deltaY, deltaMode: 0, bubbles: true, cancelable: true, composed: true, ...more })
      target.dispatchEvent(event)
      return event.defaultPrevented
    }
  })
}

/** Steps an installed glide (window.g) until it rests, returning each frame's scroll position. */
export async function settle(page: Page, hz = 60, limit = 2000) {
  return page.evaluate(
    ({ hz, limit }) => {
      const w = window as unknown as Record<string, any>
      const seen: number[] = []
      for (let i = 0; i < limit && w.g.isGliding; i++) {
        w.frame(w.g, hz)
        seen.push(w.g.scroll)
      }
      return seen
    },
    { hz, limit }
  )
}
