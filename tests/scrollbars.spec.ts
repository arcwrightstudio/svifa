// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Arcwright Studio

// Real scroll bars, as on Windows, which Chromium shows headless once its default of hiding them is dropped.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { expect, test } from './fixtures'
import { open } from './setup'

const SVIFA_CSS = readFileSync(fileURLToPath(new URL('../svifa.css', import.meta.url)), 'utf8')

test.use({ launchOptions: { ignoreDefaultArgs: ['--hide-scrollbars'] } })

test('stop() with svifa.css keeps the scrollbar room, so nothing moves sideways', async ({ page }) => {
  await open(page, '<p id="p" style="margin: 0 auto; width: 400px">centred</p><div class="tall"></div>', SVIFA_CSS)
  const result = await page.evaluate(() => {
    const w = window as any
    const g = new w.Svifa({ autoRaf: false })
    const left = () => document.getElementById('p')!.getBoundingClientRect().left
    const room = innerWidth - document.documentElement.clientWidth
    const before = left()
    g.stop()
    const stopped = left()
    g.start()
    return { room, before, stopped, after: left(), gutter: document.documentElement.style.scrollbarGutter }
  })
  expect(result.room).toBeGreaterThan(0)
  expect(result.stopped).toBe(result.before)
  expect(result.after).toBe(result.before)
  expect(result.gutter).toBe('')
})

test('dragging the scroll bar takes over from a glide', async ({ page }) => {
  await open(page, '', SVIFA_CSS)
  await page.evaluate(() => {
    const w = window as any
    w.g = new w.Svifa()
    w.result = null
    w.g.scrollTo(9000, { duration: 4 }).then((arrived: boolean) => (w.result = arrived))
  })
  await page.waitForTimeout(300)
  const { x, y } = await page.evaluate(() => {
    const width = innerWidth - document.documentElement.clientWidth
    const thumb = (scrollY / document.documentElement.scrollHeight) * innerHeight
    return { x: innerWidth - width / 2, y: thumb + 10 }
  })
  await page.mouse.move(x, y)
  await page.mouse.down()
  await page.mouse.move(x, y + 60, { steps: 4 })
  await page.mouse.up()
  await page.waitForTimeout(300)
  const state = await page.evaluate(() => ({ gliding: (window as any).g.isGliding, result: (window as any).result }))
  expect(state).toEqual({ gliding: false, result: false })
})
