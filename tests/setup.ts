// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Arcwright Studio

// What every test page shares: the built script loaded as window.Svifa, a page with plenty to scroll on an http origin of its own,
// and helpers that step Svifa frame by frame on a clock of the test's own (autoRaf: false), so every run sees exactly the same frames.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import type { Page } from '@playwright/test'

const script = readFileSync(fileURLToPath(new URL('../dist/svifa.global.js', import.meta.url)), 'utf8')
export const ORIGIN = 'http://svifa.test'
// the script build is served from an address of its own, which is how a coverage run tells it apart from everything else on the page
export const SCRIPT_URL = `${ORIGIN}/svifa.global.js`

// the page's styles are a stylesheet of their own and the script build is loaded by the page's markup, so a page under a strict
// Content Security Policy holds nothing inline and assigns no script address from script
const STYLE_URL = `${ORIGIN}/page.css`

/** Opens the test page: `body` in place of the tall default, `css` added to its styles, `headers` sent with it. */
export async function open(page: Page, body = '', css = '', headers: Record<string, string> = {}) {
  const style = `html, body { margin: 0; }
    .tall { height: 10000px; background: linear-gradient(#eee, #ccc); }
    ${css}`
  const html = `<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="${STYLE_URL}"></head><body>${
    body || '<div class="tall"></div>'
  }<script src="${SCRIPT_URL}"></script></body></html>`
  await page.route(`${ORIGIN}/**`, (route) => {
    const url = route.request().url()
    if (url === SCRIPT_URL) return route.fulfill({ contentType: 'text/javascript', body: script })
    if (url === STYLE_URL) return route.fulfill({ contentType: 'text/css', body: style })
    return route.fulfill({ contentType: 'text/html', headers, body: html })
  })
  await page.goto(`${ORIGIN}/page`)
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
