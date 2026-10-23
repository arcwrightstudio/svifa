// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Arcwright Studio

// The elements Svifa draws between pixels when it chooses them itself (the subpixel option left on).
import type { Page } from '@playwright/test'
import { expect, test } from './fixtures'
import { open as openPage } from './setup'

// Opens the test page with two helpers: layered(), the ids of the elements that have a layer of Svifa's (will-change: translate
// inline), and glide(g), which starts a glide (choosing the elements if the page has not been idle yet) and steps it a few frames.
async function open(page: Page, body = '', css = '') {
  await openPage(page, body, css)
  await page.evaluate(() => {
    const w = window as any
    w.layered = () =>
      [...document.querySelectorAll<HTMLElement>('[id]')]
        .filter((element) => element.style.willChange.includes('translate'))
        .map((element) => element.id)
    w.glide = (g: any, delta = 100) => {
      w.frame(g)
      w.wheel(window, delta)
      w.frame(g, 240, 3)
    }
  })
}

// Firefox draws whole pixels whatever it is asked, so Svifa chooses none there (the test after these)
test.describe('left on, Svifa chooses what to draw between pixels', { tag: '@not-firefox' }, () => {
  test('gives each block that scrolls with the page a layer, keeps what its own styles ask for, and puts all back on destroy', async ({
    page,
  }) => {
    await open(
      page,
      `<header id="head" style="position: sticky; top: 0; z-index: 2; height: 60px">head</header>
       <main id="main"><section id="one" style="height: 3000px"></section><section id="two" style="height: 3000px"></section></main>
       <footer id="foot" style="height: 300px"></footer>
       <div id="chat" style="position: fixed; bottom: 0; right: 0; z-index: 5">chat</div>`,
      '#main { will-change: opacity; }'
    )
    const result = await page.evaluate(() => {
      const w = window as any
      const g = new w.Svifa({ autoRaf: false })
      w.glide(g)
      const main = document.getElementById('main')!
      const chosen = { ids: w.layered(), main: main.style.willChange }
      const cls = document.documentElement.classList.contains('svifa-subpixel')
      const drawn = main.style.translate
      g.destroy()
      return { ...chosen, cls, drawn, after: w.layered(), mainAfter: main.getAttribute('style') }
    })
    // the blocks and the sticky header, never the fixed element; inside a chosen block nothing more is needed
    expect(result.ids).toEqual(['head', 'main', 'foot'])
    expect(result.main).toBe('opacity, translate')
    expect(result.cls).toBe(true)
    expect(result.drawn).not.toBe('')
    expect(result.after).toEqual([])
    expect(result.mainAfter).toBe('')
  })

  test('chooses the blocks once the page is idle, before the wheel first turns', async ({ page }) => {
    await open(page, '<main id="main" style="height: 6000px"></main>')
    await page.evaluate(() => {
      const w = window as any
      w.g = new w.Svifa()
    })
    await page.waitForFunction(() => document.getElementById('main')!.style.willChange === 'translate', null, { timeout: 3000 })
    expect(await page.evaluate(() => document.documentElement.classList.contains('svifa-subpixel'))).toBe(true)
  })

  test('never gives a layer to an element holding a fixed one: it splits around it', async ({ page }) => {
    await open(
      page,
      `<div id="wrap"><nav id="nav" style="position: fixed; top: 0; z-index: 3">nav</nav>
         <section id="a" style="height: 3000px"></section><section id="b" style="height: 3000px"></section></div>`
    )
    const ids = await page.evaluate(() => {
      const w = window as any
      const g = new w.Svifa({ autoRaf: false })
      w.glide(g)
      return w.layered()
    })
    expect(ids).toEqual(['a', 'b'])
  })

  test('chooses the same with a scrolling box inside drawn by its own Svifa', async ({ page }) => {
    await open(
      page,
      `<main id="main"><section id="a" style="height: 3000px"><div id="bar" style="position: fixed; bottom: 0; z-index: 3">bar</div></section>
         <section id="b" style="height: 3000px"><div id="box" style="height: 200px; overflow: auto">
           <p id="line" style="margin: 0; height: 40px">line</p><div id="rest" style="height: 1000px"></div></div></section></main>`
    )
    await page.evaluate(() => {
      const w = window as any
      w.g = new w.Svifa({ autoRaf: false })
    })
    // the page, and the box with it, are chosen once the page is idle
    await page.waitForFunction(() => document.getElementById('line')!.style.willChange === 'translate', null, { timeout: 3000 })
    const result = await page.evaluate(async () => {
      const w = window as any
      const first = w.layered()
      // the page changes, and is chosen again with the box's own layers in place
      document.body.append(Object.assign(document.createElement('section'), { id: 'late' }))
      await new Promise((resolve) => setTimeout(resolve, 600))
      return { first, again: w.layered() }
    })
    expect(result.first).toEqual(['b', 'line', 'rest'])
    expect(result.again).toEqual(['b', 'line', 'rest', 'late'])
  })

  test('splits a block a layer would change: a z-index inside it that reaches past it (shown or hidden), or one below 0', async ({
    page,
  }) => {
    await open(
      page,
      `<header id="head" style="height: 60px"><nav id="nav" style="position: relative">
         <ul id="menu" style="position: absolute; top: 60px; z-index: 10; height: 200px; margin: 0">menu</ul></nav></header>
       <div id="quiet" style="height: 60px"><div id="hidden" style="position: absolute; z-index: 10; display: none">menu</div></div>
       <section id="deep" style="height: 400px"><div id="back" style="position: absolute; z-index: -1">behind</div></section>
       <section id="calm" style="height: 400px; position: relative"><div id="kept" style="position: absolute; z-index: 1">badge</div></section>
       <main id="main" style="height: 6000px"></main>`
    )
    const ids = await page.evaluate(() => {
      const w = window as any
      const g = new w.Svifa({ autoRaf: false })
      w.glide(g)
      return w.layered()
    })
    // the menu reaches past its header and the nav, a hidden menu may appear anywhere, and a z-index below 0 would come up over its
    // block's own background: each is split around; a badge with a z-index that stays inside its block changes nothing there
    expect(ids).toEqual(['menu', 'hidden', 'back', 'calm', 'main'])
  })

  test('draws on whole pixels where a layer would draw content over a fixed or sticky element with no z-index, and says why once', async ({
    page,
  }) => {
    await open(
      page,
      '<header id="head" style="position: sticky; top: 0; height: 60px">head</header><main id="main" style="height: 6000px"></main>'
    )
    const said: string[] = []
    page.on('console', (message) => said.push(message.text()))
    const result = await page.evaluate(() => {
      const w = window as any
      const g = new w.Svifa({ autoRaf: false })
      w.glide(g)
      while (g.isGliding) w.frame(g, 240)
      w.glide(g)
      while (g.isGliding) w.frame(g, 240)
      return {
        ids: w.layered(),
        cls: document.documentElement.classList.contains('svifa-subpixel'),
        rest: g.scroll,
      }
    })
    expect(result).toEqual({ ids: [], cls: false, rest: 200 })
    const words = said.filter((text) => text.includes('whole pixels'))
    expect(words).toHaveLength(1)
    expect(words[0]).toContain('position: sticky and no z-index')
  })

  test('leaves an element marked data-svifa-subpixel="off" on whole pixels, and everything when the page is marked', async ({
    page,
  }) => {
    await open(
      page,
      `<main id="main"><section id="a" data-svifa-subpixel="off" style="height: 3000px"><p id="inside">text</p></section>
         <section id="b" style="height: 3000px"></section></main>`
    )
    const result = await page.evaluate(() => {
      const w = window as any
      const g = new w.Svifa({ autoRaf: false })
      w.glide(g)
      const some = w.layered()
      g.destroy()
      document.documentElement.setAttribute('data-svifa-subpixel', 'off')
      const h = new w.Svifa({ autoRaf: false })
      w.glide(h)
      return { some, none: w.layered() }
    })
    expect(result).toEqual({ some: ['b'], none: [] })
  })

  test('takes the layer from a block an element inside becomes fixed in, before the browser draws the page', async ({ page }) => {
    await open(
      page,
      `<main id="main"><section id="a" style="height: 3000px"><div id="pop">pop</div></section>
         <section id="b" style="height: 3000px"></section></main>`,
      '.pinned { position: fixed; top: 0; z-index: 4; }'
    )
    const result = await page.evaluate(async () => {
      const w = window as any
      const g = new w.Svifa({ autoRaf: false })
      w.glide(g)
      const before = w.layered()
      document.getElementById('pop')!.classList.add('pinned')
      // what the page changed is reported in the same task, before any frame is drawn
      await Promise.resolve()
      return { before, after: w.layered() }
    })
    expect(result).toEqual({ before: ['main'], after: ['b'] })
  })

  test('moves a block added during a glide outside every chosen one with the rest, from the next frame', async ({ page }) => {
    await open(page, '<main id="main" style="height: 6000px"></main>')
    const result = await page.evaluate(async () => {
      const w = window as any
      const g = new w.Svifa({ autoRaf: false })
      w.frame(g)
      w.wheel(window, 300)
      w.frame(g, 240, 3)
      const late = document.createElement('section')
      late.id = 'late'
      late.style.height = '100px'
      document.body.append(late)
      await Promise.resolve()
      let same = 0
      let frames = 0
      for (let i = 0; i < 20 && g.isGliding; i++) {
        w.frame(g, 240)
        frames++
        if (late.style.translate !== '' && late.style.translate === document.getElementById('main')!.style.translate) same++
      }
      return { same, frames }
    })
    expect(result.frames).toBeGreaterThan(5)
    expect(result.same).toBe(result.frames)
  })

  test('holds a sticky element inside a chosen block still while it is stuck', async ({ page }) => {
    await open(
      page,
      `<main id="main"><section id="a" style="height: 3000px">
         <div id="pin" style="position: sticky; top: 40px; height: 100px">pinned</div></section>
         <section id="b" style="height: 8000px"></section></main>`
    )
    const result = await page.evaluate(() => {
      const w = window as any
      window.scrollTo({ top: 600, behavior: 'instant' })
      const g = new w.Svifa({ autoRaf: false })
      const pin = document.getElementById('pin')!
      w.frame(g)
      w.wheel(window, 177.7)
      let worst = 0
      while (g.isGliding) {
        w.frame(g, 240)
        worst = Math.max(worst, Math.abs(pin.getBoundingClientRect().top - 40))
      }
      return { worst, layered: pin.style.willChange }
    })
    expect(result.layered).toBe('translate')
    expect(result.worst).toBeLessThan(0.01)
  })

  test('never makes the page longer under a glide: the content is only ever moved toward the start', async ({ page }) => {
    await open(page, '<main id="main" style="height: 6000.4px"></main>')
    const result = await page.evaluate(() => {
      const w = window as any
      const g = new w.Svifa({ autoRaf: false })
      const height = document.documentElement.scrollHeight
      w.frame(g)
      void g.scrollTo('bottom')
      let longest = height
      let positive = false
      while (g.isGliding) {
        w.frame(g, 240)
        longest = Math.max(longest, document.documentElement.scrollHeight)
        const y = document.getElementById('main')!.style.translate.split(' ')[1]
        if (y && Number.parseFloat(y) > 0) positive = true
      }
      window.scrollTo({ top: 1e9, behavior: 'instant' })
      return { height, longest, positive, rest: g.scroll, end: window.scrollY }
    })
    expect(result.longest).toBe(result.height)
    expect(result.positive).toBe(false)
    expect(result.rest).toBe(result.end)
  })

  test('gives no layer while the reader asks for reduced motion, and follows a change', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await open(page, '<main id="main" style="height: 6000px"></main>')
    await page.evaluate(() => {
      const w = window as any
      w.g = new w.Svifa()
    })
    await page.waitForTimeout(400)
    expect(await page.evaluate(() => document.getElementById('main')!.style.willChange)).toBe('')
    await page.emulateMedia({ reducedMotion: 'no-preference' })
    await page.waitForFunction(() => document.getElementById('main')!.style.willChange === 'translate', null, { timeout: 3000 })
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.waitForFunction(() => document.getElementById('main')!.style.willChange === '', null, { timeout: 3000 })
  })

  test('gives the elements a list names their layers too, and subpixel: false gives none', async ({ page }) => {
    await open(
      page,
      '<main id="main"><section id="a" class="move" style="height: 3000px"></section><section id="b" style="height: 3000px"></section></main>'
    )
    const result = await page.evaluate(() => {
      const w = window as any
      const g = new w.Svifa({ autoRaf: false, subpixel: '.move' })
      w.glide(g)
      const listed = w.layered()
      g.destroy()
      const h = new w.Svifa({ autoRaf: false, subpixel: false })
      w.glide(h)
      return { listed, off: w.layered(), cls: document.documentElement.classList.contains('svifa-subpixel') }
    })
    expect(result).toEqual({ listed: ['a'], off: [], cls: false })
  })
})

test('chooses none in Firefox, which draws whole pixels whatever it is asked', { tag: '@firefox-only' }, async ({ page }) => {
  await open(page, '<main id="main" style="height: 6000px"></main>')
  const result = await page.evaluate(() => {
    const w = window as any
    const g = new w.Svifa({ autoRaf: false })
    w.glide(g)
    return { ids: w.layered(), cls: document.documentElement.classList.contains('svifa-subpixel') }
  })
  expect(result).toEqual({ ids: [], cls: false })
})

// touch screen emulation is Chromium's
test.describe('on a device with only a touch screen', { tag: '@chromium-only' }, () => {
  test.use({ isMobile: true, hasTouch: true })
  test('chooses none, since nothing glides under a finger', async ({ page }) => {
    await open(page, '<main id="main" style="height: 6000px"></main>')
    const result = await page.evaluate(() => {
      const w = window as any
      const g = new w.Svifa({ autoRaf: false })
      w.glide(g)
      return { fine: matchMedia('(any-pointer: fine)').matches, ids: w.layered() }
    })
    expect(result).toEqual({ fine: false, ids: [] })
  })
})
