// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Arcwright Studio

// Svifa under a strict Content Security Policy: script and style only from the page's own origin, nothing inline, nothing else
// fetched (but the favicon Firefox asks for by itself), and, where the browser has Trusted Types, no string reaching a script
// sink. Svifa draws through the CSSOM and the DOM, which no policy restricts, so a page that locks itself down loses nothing.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { expect, test } from './fixtures'
import { ORIGIN, open } from './setup'

const SVIFA_CSS = readFileSync(fileURLToPath(new URL('../svifa.css', import.meta.url)), 'utf8')
const POLICY = [
  "default-src 'none'",
  `script-src ${ORIGIN}`,
  `style-src ${ORIGIN}`,
  `img-src ${ORIGIN}`,
  "base-uri 'none'",
  "form-action 'none'",
  "require-trusted-types-for 'script'",
  "trusted-types 'none'",
].join('; ')

test('works under a strict Content Security Policy, and breaks none of it', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(String(error)))
  await page.addInitScript(() => {
    const w = window as any
    w.violations = []
    document.addEventListener('securitypolicyviolation', (event) =>
      w.violations.push(`${event.violatedDirective} ${event.blockedURI}`)
    )
  })
  await open(
    page,
    '<a id="link" href="#far">far</a><div class="tall move"></div><h2 id="far" class="move">far</h2><div class="tall"></div>',
    SVIFA_CSS,
    { 'Content-Security-Policy': POLICY }
  )

  // the wheel, drawn between pixels; stopping and starting with svifa.css
  const wheel = await page.evaluate(() => {
    const w = window as any
    w.g = new w.Svifa({ autoRaf: false, subpixel: '.move', anchors: true })
    w.frame(w.g)
    w.wheel(window, 263.9)
    w.frame(w.g)
    const drawn = (document.querySelector('.move') as HTMLElement).style.translate !== ''
    for (let i = 0; i < 600 && w.g.isGliding; i++) w.frame(w.g)
    w.g.stop()
    w.g.start()
    return { drawn, at: window.scrollY }
  })
  expect(wheel.drawn).toBe(true)
  expect(Math.abs(wheel.at - 263.9)).toBeLessThan(1)

  // a same-page link pressed from the keyboard: the glide to it, and focus moved there
  await page.focus('#link')
  await page.keyboard.press('Enter')
  const link = await page.evaluate(() => {
    const w = window as any
    for (let i = 0; i < 600 && w.g.isGliding; i++) w.frame(w.g)
    const far = document.getElementById('far')!
    const result = { reached: Math.abs(far.getBoundingClientRect().top) < 1, focused: document.activeElement === far }
    w.g.destroy()
    return result
  })
  expect(link).toEqual({ reached: true, focused: true })

  const violations = await page.evaluate(() => [...(window as any).violations])
  // and the policy is in force: a style written inline is refused (Svifa's own styles go through the CSSOM, which no policy limits)
  const refused = await page.evaluate(() => {
    const probe = document.createElement('div')
    probe.setAttribute('style', 'width: 123px')
    document.body.append(probe)
    return probe.getBoundingClientRect().width !== 123
  })
  expect({ violations, errors, refused }).toEqual({ violations: [], errors: [], refused: true })
})
