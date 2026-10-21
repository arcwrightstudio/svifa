import { expect, test } from '@playwright/test'
import { open, settle } from './setup'

test.describe('living with everything else on the page', () => {
  test('gives way at once to a scroll it did not make (a key, the scrollbar, find in page)', async ({ page }) => {
    await open(page)
    await page.evaluate(() => {
      const w = window as any
      w.g = new w.Svifa({ autoRaf: false })
      w.frame(w.g)
      w.result = null
      w.g.scrollTo(3000).then((arrived: boolean) => (w.result = arrived))
      w.frame(w.g, 60, 5)
      window.scrollTo({ top: 7000, behavior: 'instant' })
    })
    // the browser reports the scroll in its next frame
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))))
    const state = await page.evaluate(() => {
      const w = window as any
      return { gliding: w.g.isGliding, scroll: w.g.scroll, target: w.g.target, result: w.result, y: window.scrollY }
    })
    expect(state).toEqual({ gliding: false, scroll: 7000, target: 7000, result: false, y: 7000 })
  })

  test('stops for a finger on the screen and for a middle-button press', async ({ page }) => {
    await open(page)
    const state = await page.evaluate(() => {
      const w = window as any
      const g = new w.Svifa({ autoRaf: false })
      w.frame(g)
      w.wheel(window, 400)
      w.frame(g, 60, 4)
      document.body.dispatchEvent(new Event('touchstart', { bubbles: true }))
      const afterTouch = g.isGliding
      w.wheel(window, 400)
      w.frame(g, 60, 4)
      document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 1 }))
      return { afterTouch, afterMiddle: g.isGliding, rested: Number.isInteger(window.scrollY) && window.scrollY === g.scroll }
    })
    expect(state).toEqual({ afterTouch: false, afterMiddle: false, rested: true })
  })

  test('stop holds everything still until start', async ({ page }) => {
    await open(page)
    const state = await page.evaluate(() => {
      const w = window as any
      const g = new w.Svifa({ autoRaf: false })
      w.frame(g)
      w.wheel(window, 400)
      w.frame(g, 60, 3)
      g.stop()
      const stopped = {
        gliding: g.isGliding,
        isStopped: g.isStopped,
        cls: document.documentElement.classList.contains('svifa-stopped'),
        prevented: w.wheel(window, 100),
      }
      g.start()
      const started = {
        isStopped: g.isStopped,
        cls: document.documentElement.classList.contains('svifa-stopped'),
        prevented: w.wheel(window, 100),
      }
      return { stopped, started }
    })
    expect(state.stopped).toEqual({ gliding: false, isStopped: true, cls: true, prevented: true })
    expect(state.started).toEqual({ isStopped: false, cls: false, prevented: true })
  })

  test('sends one scrollend for a whole glide, when it arrives', async ({ page }) => {
    await open(page)
    await page.evaluate(() => {
      const w = window as any
      w.ends = 0
      document.addEventListener('scrollend', () => w.ends++)
      w.g = new w.Svifa({ autoRaf: true })
      w.wheel(window, 300)
    })
    await page.waitForFunction(() => !(window as any).g.isGliding, null, { timeout: 5000 })
    await page.waitForTimeout(400)
    expect(await page.evaluate(() => (window as any).ends)).toBe(1)
  })

  test('glides with its own frame loop, only while something moves', async ({ page }) => {
    await open(page)
    await page.evaluate(() => {
      const w = window as any
      w.calls = 0
      const original = window.requestAnimationFrame.bind(window)
      window.requestAnimationFrame = (callback) => {
        w.calls++
        return original(callback)
      }
      w.g = new w.Svifa()
    })
    await page.waitForTimeout(300)
    expect(await page.evaluate(() => (window as any).calls)).toBe(0)
    await page.evaluate(() => (window as any).wheel(window, 200))
    await page.waitForFunction(() => window.scrollY === 200 && !(window as any).g.isGliding, null, { timeout: 5000 })
    await page.waitForTimeout(300)
    const idle = await page.evaluate(() => (window as any).calls)
    await page.waitForTimeout(300)
    expect(await page.evaluate(() => (window as any).calls)).toBe(idle)
  })

  test('destroy leaves no class, listener or style behind', async ({ page }) => {
    await open(page, '', '.travel { will-change: translate; }')
    const state = await page.evaluate(() => {
      const w = window as any
      document.body.firstElementChild!.classList.add('travel')
      const g = new w.Svifa({ autoRaf: false, subpixel: '.travel', anchors: true })
      w.frame(g)
      w.wheel(window, 333.3)
      w.frame(g, 60, 5)
      g.destroy()
      const root = document.documentElement
      return {
        classes: root.className,
        rootStyle: root.getAttribute('style') ?? '',
        translate: (document.querySelector('.travel') as HTMLElement).style.translate,
        prevented: w.wheel(window, 100),
        gliding: g.isGliding,
      }
    })
    expect(state).toEqual({ classes: '', rootStyle: '', translate: '', prevented: false, gliding: false })
  })
})

test.describe('boxes that scroll on their own', () => {
  const BOX = `
    <div class="tall">
      <div id="box" style="height: 200px; overflow: auto"><div style="height: 1000px"></div></div>
      <div id="contained" style="height: 200px; overflow: auto; overscroll-behavior: contain"><div style="height: 1000px"></div></div>
      <div id="plain" data-svifa-native style="height: 200px"><p id="inner">text</p></div>
      <div id="picked" style="height: 200px"></div>
    </div>`

  test('an inner box takes the wheel while it can move that way, then hands it back', async ({ page }) => {
    await open(page, BOX)
    const result = await page.evaluate(() => {
      const w = window as any
      w.g = new w.Svifa({ autoRaf: false })
      const box = document.getElementById('box')!
      const down = w.wheel(box, 100)
      const upAtTop = w.wheel(box, -100)
      box.scrollTop = box.scrollHeight
      const downAtEnd = w.wheel(box, 100)
      return { down, upAtTop, downAtEnd }
    })
    // the box can move down: the browser scrolls it; at its top, up goes to the page (and the page is at its top too: the browser's)
    expect(result.down).toBe(false)
    expect(result.upAtTop).toBe(false)
    // at its end, down glides the page
    expect(result.downAtEnd).toBe(true)
  })

  test('overscroll-behavior: contain keeps the wheel in the box even at its end', async ({ page }) => {
    await open(page, BOX)
    const result = await page.evaluate(() => {
      const w = window as any
      w.g = new w.Svifa({ autoRaf: false })
      const box = document.getElementById('contained')!
      box.scrollTop = box.scrollHeight
      return { contains: CSS.supports('overscroll-behavior', 'contain'), prevented: w.wheel(box, 100) }
    })
    // where the browser has no overscroll-behavior (Safari before 16) its own scrolling passes on to the page, and so does Svifa's
    expect(result.prevented).toBe(!result.contains)
  })

  test('data-svifa-native and the native option leave elements to the browser; nested: false glides over boxes', async ({
    page,
  }) => {
    await open(page, BOX)
    const result = await page.evaluate(() => {
      const w = window as any
      const g = new w.Svifa({ autoRaf: false, native: (element: Element) => element.id === 'picked' })
      const marked = w.wheel(document.getElementById('inner'), 100)
      const picked = w.wheel(document.getElementById('picked'), 100)
      g.destroy()
      new w.Svifa({ autoRaf: false, nested: false })
      const overBox = w.wheel(document.getElementById('box'), 100)
      return { marked, picked, overBox }
    })
    expect(result).toEqual({ marked: false, picked: false, overBox: true })
  })
})

test.describe('a scrolling element', () => {
  const SCROLLER = `
    <div id="outer" class="tall">
      <div id="scroller" style="height: 400px; overflow: auto"><div style="height: 3000px; width: 3000px"></div></div>
    </div>`

  test('glides an element, and passes the wheel on to the page at its ends (chain)', async ({ page }) => {
    await open(page, SCROLLER)
    const result = await page.evaluate(() => {
      const w = window as any
      const el = document.getElementById('scroller')!
      w.g = new w.Svifa({ autoRaf: false, scroller: el })
      w.frame(w.g)
      const inside = w.wheel(el, 200)
      return { inside, page: document.documentElement.classList.contains('svifa'), own: el.classList.contains('svifa') }
    })
    expect(result).toEqual({ inside: true, page: false, own: true })
    expect((await settle(page)).at(-1)).toBe(200)
    const atEnd = await page.evaluate(() => {
      const w = window as any
      const el = document.getElementById('scroller')!
      w.g.scrollTo('end', { immediate: true })
      const passed = !w.wheel(el, 100)
      w.g.destroy()
      const h = new w.Svifa({ autoRaf: false, scroller: el, chain: false })
      const kept = w.wheel(el, 100)
      h.destroy()
      return { passed, kept }
    })
    expect(atEnd).toEqual({ passed: true, kept: true })
  })

  test('a horizontal scroller takes the wheel up and down as left and right', async ({ page }) => {
    await open(page, SCROLLER)
    await page.evaluate(() => {
      const w = window as any
      const el = document.getElementById('scroller')!
      w.g = new w.Svifa({ autoRaf: false, scroller: el, axis: 'horizontal' })
      w.frame(w.g)
      w.wheel(el, 150)
    })
    expect((await settle(page)).at(-1)).toBe(150)
    expect(await page.evaluate(() => document.getElementById('scroller')!.scrollLeft)).toBe(150)
  })

  test('an inner Svifa that takes the wheel keeps the page Svifa from taking it too', async ({ page }) => {
    await open(page, SCROLLER)
    const targets = await page.evaluate(() => {
      const w = window as any
      const el = document.getElementById('scroller')!
      const pageSvifa = new w.Svifa({ autoRaf: false })
      const inner = new w.Svifa({ autoRaf: false, scroller: el })
      w.wheel(el, 120)
      return { page: pageSvifa.target, inner: inner.target }
    })
    expect(targets).toEqual({ page: 0, inner: 120 })
  })
})

test.describe('a long life on a real page', () => {
  test('destroy from inside a frame (a scroll listener, a finished scrollTo) leaves no frame loop running', async ({ page }) => {
    await open(page)
    await page.evaluate(() => {
      const w = window as any
      w.calls = 0
      const original = window.requestAnimationFrame.bind(window)
      window.requestAnimationFrame = (callback) => {
        w.calls++
        return original(callback)
      }
      let n = 0
      const a = new w.Svifa()
      a.on('scroll', () => {
        if (++n === 3) {
          a.destroy()
          w.destroyed = true
        }
      })
      w.wheel(window, 400)
    })
    // however slowly the browser hands out frames, nothing is asked for once destroy has run
    await page.waitForFunction(() => (window as any).destroyed, null, { timeout: 5000 })
    const afterListener = await page.evaluate(() => (window as any).calls)
    await page.waitForTimeout(400)
    expect(await page.evaluate(() => (window as any).calls)).toBe(afterListener)

    await page.evaluate(() => {
      const w = window as any
      const b = new w.Svifa()
      w.done = false
      b.scrollTo(300, { duration: 0.2 }).then(() => {
        b.destroy()
        w.done = true
      })
    })
    await page.waitForFunction(() => (window as any).done, null, { timeout: 5000 })
    await page.waitForTimeout(200)
    const afterScrollTo = await page.evaluate(() => (window as any).calls)
    await page.waitForTimeout(400)
    expect(await page.evaluate(() => (window as any).calls)).toBe(afterScrollTo)
  })

  test('keeps its classes when something else rewrites the class attribute (a theme switch), so a stopped page stays stopped', async ({
    page,
  }) => {
    await open(page)
    const classes = await page.evaluate(async () => {
      const w = window as any
      const g = new w.Svifa({ autoRaf: false })
      g.stop()
      document.documentElement.className = 'dark'
      await new Promise((resolve) => setTimeout(resolve)) // the observer runs after the change
      return document.documentElement.className.split(' ').sort().join(' ')
    })
    expect(classes).toBe('dark svifa svifa-stopped')
  })

  test('creates and scrolls where the page has no matchMedia (a test environment such as jsdom)', async ({ page }) => {
    await open(page)
    const result = await page.evaluate(() => {
      const w = window as any
      Object.defineProperty(window, 'matchMedia', { value: undefined, configurable: true })
      const g = new w.Svifa({ autoRaf: false })
      w.frame(g)
      const prevented = w.wheel(window, 120)
      while (g.isGliding) w.frame(g)
      return { prevented, y: window.scrollY }
    })
    expect(result).toEqual({ prevented: true, y: 120 })
  })
})

test('a glide started in the same moment as a scroll of the browser’s own (a focus, a link’s jump) is not taken over by it', async ({
  page,
}) => {
  await open(page)
  await page.evaluate(() => {
    const w = window as any
    w.g = new w.Svifa({ autoRaf: false })
    w.frame(w.g)
    // an earlier glide, so Svifa has a last move of its own on record
    w.wheel(window, 100)
    while (w.g.isGliding) w.frame(w.g)
    w.result = null
    // the browser jumps (as focusing a field far down would), and in the same task the page asks for a glide
    window.scrollTo({ top: 6000, behavior: 'instant' })
    w.g.scrollTo(2000).then((arrived: boolean) => (w.result = arrived))
  })
  // the jump's scroll event arrives in the next frame, before Svifa has drawn anything
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))))
  expect(await page.evaluate(() => (window as any).g.isGliding)).toBe(true)
  expect((await settle(page)).at(-1)).toBe(2000)
  expect(await page.evaluate(() => (window as any).result)).toBe(true)
})

test.describe('same-page links (anchors)', () => {
  const LINKS = `<a id="go" href="#far">far</a> <a id="away" href="/elsewhere#far">away</a> <a id="none" href="#nothing">none</a>
     <div style="height: 3000px"></div><section id="far">Far</section><div class="tall"></div>`

  // In the page: clicks a link as a reader would and answers whether Svifa took the click. After Svifa has seen it (it listens on
  // the document), the browser is kept from following any link, so the test page stays where it is in every browser.
  const setUp = () => {
    const w = window as any
    let taken = false
    window.addEventListener('click', (event) => {
      taken = event.defaultPrevented
      event.preventDefault()
    })
    w.changes = [] as string[]
    window.addEventListener('hashchange', (event) => w.changes.push(new URL(event.newURL).hash))
    w.click = (id: string, init: MouseEventInit = {}) => {
      document
        .getElementById(id)!
        .dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0, detail: 1, ...init }))
      return taken
    }
  }

  test('glides to the place, puts the link in the address and sends hashchange; leaves other links alone', async ({ page }) => {
    await open(page, LINKS)
    await page.evaluate(setUp)
    const state = await page.evaluate(async () => {
      const w = window as any
      w.g = new w.Svifa({ autoRaf: false, anchors: { offset: -20 } })
      w.frame(w.g)
      const length = history.length
      const result = {
        modified: w.click('go', { ctrlKey: true }),
        otherPage: w.click('away'),
        missing: w.click('none'),
        link: w.click('go'),
        gliding: w.g.isGliding,
        target: w.g.target,
        hash: location.hash,
        entries: history.length - length,
        focused: document.activeElement === document.getElementById('far'),
        targeted: document.querySelector(':target')?.id ?? null,
        changes: [] as string[],
      }
      await new Promise((resolve) => setTimeout(resolve, 50))
      result.changes = w.changes
      return result
    })
    const far = await page.evaluate(() => document.getElementById('far')!.offsetTop - 20)
    expect(state).toEqual({
      modified: false,
      otherPage: false,
      missing: false,
      link: true,
      gliding: true,
      target: far,
      hash: '#far',
      entries: 1,
      focused: false,
      targeted: null,
      changes: ['#far'],
    })
    expect((await settle(page)).at(-1)).toBe(far)
  })

  test('pressed from the keyboard (a skip link), carries keyboard focus to the place without scrolling it', async ({ page }) => {
    await open(page, LINKS)
    await page.evaluate(setUp)
    const state = await page.evaluate(() => {
      const w = window as any
      w.g = new w.Svifa({ autoRaf: false, anchors: true })
      w.frame(w.g)
      w.click('go', { detail: 0 })
      const far = document.getElementById('far')!
      const focused = { active: document.activeElement === far, tabindex: far.getAttribute('tabindex'), y: window.scrollY }
      ;(document.getElementById('go') as HTMLElement).focus()
      return { ...focused, after: far.getAttribute('tabindex') }
    })
    expect(state).toEqual({ active: true, tabindex: '-1', y: 0, after: null })
  })

  test('with reduced motion, jumps to the place at once', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await open(page, LINKS)
    await page.evaluate(setUp)
    const result = await page.evaluate(() => {
      const w = window as any
      w.g = new w.Svifa({ autoRaf: false, anchors: { offset: -20 } })
      w.click('go')
      return { y: window.scrollY, hash: location.hash, far: document.getElementById('far')!.offsetTop - 20 }
    })
    expect(result.y).toBe(result.far)
    expect(result.hash).toBe('#far')
  })

  test('while stopped, a link moves and changes nothing', async ({ page }) => {
    await open(page, LINKS)
    await page.evaluate(setUp)
    const result = await page.evaluate(() => {
      const w = window as any
      w.g = new w.Svifa({ autoRaf: false, anchors: true })
      w.g.stop()
      return { taken: w.click('go'), gliding: w.g.isGliding, y: window.scrollY, hash: location.hash }
    })
    expect(result).toEqual({ taken: true, gliding: false, y: 0, hash: '' })
  })
})

test('a scrollTo asked for in the middle of a wheel glide, in the same moment as a jump of the browser’s own, is not taken over by it', async ({
  page,
}) => {
  await open(page)
  await page.evaluate(() => {
    const w = window as any
    w.g = new w.Svifa({ autoRaf: false })
    w.frame(w.g)
    w.wheel(window, 400)
    w.frame(w.g, 60, 5)
    w.result = null
    window.scrollTo({ top: 6000, behavior: 'instant' })
    w.g.scrollTo(2000).then((arrived: boolean) => (w.result = arrived))
  })
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))))
  expect(await page.evaluate(() => (window as any).g.isGliding)).toBe(true)
  expect((await settle(page)).at(-1)).toBe(2000)
  expect(await page.evaluate(() => (window as any).result)).toBe(true)
})

test('a scroll listener that runs before Svifa own reads the new place of a scroll Svifa did not make', async ({ page }) => {
  await open(page)
  const seen = await page.evaluate(async () => {
    const w = window as any
    const reads: number[] = []
    // registered before Svifa's own listener, as a component's can be
    window.addEventListener('scroll', () => reads.push(w.g.scroll - window.scrollY))
    w.g = new w.Svifa({ autoRaf: false })
    for (const top of [700, 1900, 1300]) {
      window.scrollTo({ top, behavior: 'instant' })
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
    }
    return reads
  })
  expect(seen.length).toBeGreaterThan(0)
  expect(seen.every((gap) => gap === 0)).toBe(true)
})

test('a move asked for right after a scroll Svifa has not heard of yet starts from where the browser has the page', async ({
  page,
}) => {
  await open(page)
  const result = await page.evaluate(() => {
    const w = window as any
    const g = new w.Svifa({ autoRaf: false })
    w.frame(g)
    g.scrollTo(3000, { immediate: true })
    // the browser moves the page (bringing an element into view), and in the same moment the page asks to be back at 3000
    window.scrollTo({ top: 2500, behavior: 'instant' })
    const backAt = g.scrollTo(3000)
    const goingBack = g.isGliding
    while (g.isGliding) w.frame(g)
    const back = window.scrollY
    // and a wheel turn straight after another such scroll goes on from there
    window.scrollTo({ top: 1000, behavior: 'instant' })
    w.wheel(window, 100)
    while (g.isGliding) w.frame(g)
    return { goingBack, back, afterWheel: window.scrollY, backAt }
  })
  expect(result).toMatchObject({ goingBack: true, back: 3000, afterWheel: 1100 })
})

test('the small promises: on() returns its own unsubscribe, progress is 1 where nothing scrolls, options cannot be changed by hand, scrollend carries detail.svifa and reaches window', async ({
  page,
}) => {
  await open(page, '<div style="height: 10px"></div>')
  const short = await page.evaluate(() => {
    const w = window as any
    const g = new w.Svifa({ autoRaf: false })
    const progress = g.progress
    try {
      g.options.lerp = 5
    } catch {
      // a frozen object refuses in strict code
    }
    const lerp = g.options.lerp
    g.destroy()
    return { progress, lerp }
  })
  expect(short).toEqual({ progress: 1, lerp: 0.1 })

  await open(page)
  const result = await page.evaluate(async () => {
    const w = window as any
    const ends: unknown[] = []
    window.addEventListener('scrollend', (event) => ends.push((event as CustomEvent).detail?.svifa ?? null))
    const g = new w.Svifa()
    let calls = 0
    const stop = g.on('scroll', () => calls++)
    await g.scrollTo(400)
    const during = calls
    stop()
    window.scrollTo({ top: 0, behavior: 'instant' })
    await new Promise((resolve) => setTimeout(resolve, 300))
    return { during: during > 0, after: calls === during, ends: ends.filter((x) => x === true).length }
  })
  expect(result).toEqual({ during: true, after: true, ends: 1 })
})
