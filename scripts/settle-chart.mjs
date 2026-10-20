// Measures the end of one wheel glide, frame by frame at 240 Hz on the test clock, as it is drawn on the screen: once on whole
// pixels (what a browser shows for a smooth scroll it cannot place between pixels) and once with Svifa drawing between them. Then
// draws the README's chart of it, for GitHub's light and dark themes. Run after the build. usage: node scripts/settle-chart.mjs
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { chromium } from '@playwright/test'

const root = fileURLToPath(new URL('..', import.meta.url))
const HZ = 240
const TURN = 100 // pixels, one wheel turn
const SHOWN = 6 // the last pixels of it, where the difference is

async function measure() {
  const script = readFileSync(`${root}dist/svifa.global.js`, 'utf8')
  const browser = await chromium.launch()
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 })
  await page.route('http://measure.test/**', (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: '<!doctype html><style>html,body{margin:0}main{height:20000px;will-change:translate}</style><main></main>',
    })
  )
  const run = async (subpixel) => {
    await page.goto('http://measure.test/')
    await page.addScriptTag({ content: script })
    return page.evaluate(
      ({ subpixel, hz, turn }) => {
        const Svifa = window.Svifa
        const svifa = new Svifa({ autoRaf: false, ...(subpixel ? { subpixel: 'main' } : {}) })
        const main = document.querySelector('main')
        let clock = 0
        svifa.raf(clock)
        window.dispatchEvent(new WheelEvent('wheel', { deltaY: turn, bubbles: true, cancelable: true }))
        const frames = []
        while (frames.length < 4 * hz) {
          clock += 1000 / hz
          svifa.raf(clock)
          // where the content is drawn: the scroll position, less anything drawn on top of it
          frames.push({ t: clock, drawn: -main.getBoundingClientRect().top })
          if (!svifa.isGliding) break
        }
        svifa.destroy()
        return frames
      },
      { subpixel, hz: HZ, turn: TURN }
    )
  }
  const whole = await run(false)
  const between = await run(true)
  await browser.close()
  return { whole, between }
}

// The longest stretch the whole-pixel run holds still, and the pixel it holds on.
// The frames from the moment a run reaches the lowest pixel shown, the first of them placed exactly on it.
function fromLowest(frames) {
  const lowest = TURN - SHOWN
  const i = frames.findIndex((p) => p.drawn >= lowest)
  if (i < 1) return frames.slice(Math.max(i, 0))
  const a = frames[i - 1]
  const b = frames[i]
  return [{ t: a.t + ((b.t - a.t) * (lowest - a.drawn)) / (b.drawn - a.drawn), drawn: lowest }, ...frames.slice(i)]
}

function longestHold(frames) {
  let best = { from: 0, to: 0, at: 0 }
  let start = 0
  for (let i = 1; i <= frames.length; i++) {
    if (i === frames.length || frames[i].drawn !== frames[start].drawn) {
      if (i - start > best.to - best.from) best = { from: start, to: i, at: frames[start].drawn }
      start = i
    }
  }
  return { frames: best.to - best.from, ms: ((best.to - best.from) * 1000) / HZ, at: best.at, t0: frames[best.from].t, t1: frames[best.to - 1].t }
}

// The ink, the hairlines and the two lines' colours, for GitHub's light theme and for its dark one.
const THEMES = {
  light: { ink: '#14142B', soft: '#5B5C74', line: '#E2E2ED', whole: '#F7486B', svifa: '#4A22F8' },
  dark: { ink: '#F4F4FA', soft: '#A3A4BA', line: '#2C2C47', whole: '#F0566E', svifa: '#8A78FF' },
}
const FONT = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif"

function chart({ whole, between }, theme) {
  const c = THEMES[theme]
  const W = 680
  // the plot is 47 wide to 33 high, the proportions of Svifa's mark, which draws the same line
  const plot = { left: 64, right: W - 24, top: 84 }
  plot.bottom = plot.top + ((plot.right - plot.left) * 33) / 47
  const H = plot.bottom + 44
  const start = Math.min(...[whole, between].map((f) => f.find((x) => TURN - x.drawn <= SHOWN).t))
  const end = start + 520
  const x = (t) => plot.left + ((t - start) / (end - start)) * (plot.right - plot.left)
  const y = (p) => plot.bottom - ((p - (TURN - SHOWN)) / SHOWN) * (plot.bottom - plot.top)
  const shown = (f) => f.filter((p) => p.t >= start - 1000 / HZ && p.t <= end)
  // the whole-pixel run as steps (each frame's place holds until the next frame), the other as the line it draws
  const steps = []
  const w = shown(whole)
  w.forEach((p, i) => {
    steps.push(`${x(p.t).toFixed(1)},${y(p.drawn).toFixed(1)}`)
    const next = w[i + 1]
    steps.push(`${x(next ? next.t : end).toFixed(1)},${y(p.drawn).toFixed(1)}`)
  })
  const line = fromLowest(shown(between)).map((p) => `${x(p.t).toFixed(1)},${y(p.drawn).toFixed(1)}`)
  const hold = longestHold(whole)
  const grid = []
  for (let p = TURN - SHOWN; p <= TURN; p++) {
    grid.push(`<line x1="${plot.left}" x2="${plot.right}" y1="${y(p)}" y2="${y(p)}" stroke="${c.line}" stroke-width="1"/>`)
    grid.push(`<text x="${plot.left - 12}" y="${y(p) + 4}" text-anchor="end" fill="${c.soft}" font-size="12">${p} px</text>`)
  }
  for (let ms = 0; ms <= end - start; ms += 100) {
    grid.push(`<text x="${x(start + ms)}" y="${plot.bottom + 24}" text-anchor="middle" fill="${c.soft}" font-size="12">${ms} ms</text>`)
  }
  // the note sits in the empty space under the lines, pointing up at the middle of the longest hold
  const mid = x((hold.t0 + hold.t1) / 2)
  const noteY = y(TURN - SHOWN + 2.6)
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" font-family="${FONT}" aria-label="The last ${SHOWN} pixels of one wheel scroll at ${HZ} Hz. On whole pixels the page waits, then hops a pixel; before the last hop it holds ${hold.frames} frames (${Math.round(hold.ms)} ms). Drawn by Svifa, it moves a little every frame.">
<defs><clipPath id="plot"><rect x="${plot.left}" y="${plot.top - 4}" width="${plot.right - plot.left}" height="${plot.bottom - plot.top + 8}"/></clipPath></defs>
<text x="0" y="22" fill="${c.ink}" font-size="17" font-weight="600">The last ${SHOWN} px of a scroll, frame by frame at ${HZ} Hz</text>
<g font-size="13" fill="${c.ink}">
  <line x1="0" x2="22" y1="50" y2="50" stroke="${c.whole}" stroke-width="2.5" stroke-linecap="round"/>
  <text x="30" y="54">On whole pixels</text>
  <line x1="154" x2="176" y1="50" y2="50" stroke="${c.svifa}" stroke-width="2.5" stroke-linecap="round"/>
  <text x="184" y="54">Drawn by Svifa</text>
</g>
${grid.join('\n')}
<g clip-path="url(#plot)">
<polyline points="${steps.join(' ')}" fill="none" stroke="${c.whole}" stroke-width="2" stroke-linejoin="round"/>
<polyline points="${line.join(' ')}" fill="none" stroke="${c.svifa}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
</g>
<line x1="${mid}" x2="${mid}" y1="${noteY - 18}" y2="${y(hold.at) + 4}" stroke="${c.soft}" stroke-width="1"/>
<text x="${mid}" y="${noteY}" text-anchor="middle" fill="${c.ink}" font-size="12.5">held ${hold.frames} frames (${Math.round(hold.ms)} ms),</text>
<text x="${mid}" y="${noteY + 17}" text-anchor="middle" fill="${c.ink}" font-size="12.5">then a 1 px hop</text>
</svg>
`
}

const data = await measure()
for (const theme of Object.keys(THEMES)) {
  writeFileSync(`${root}.github/assets/settle-${theme}.svg`, chart(data, theme))
}
const hold = longestHold(data.whole)
console.log(`on whole pixels the longest hold is ${hold.frames} frames (${hold.ms.toFixed(0)} ms) at ${hold.at} px; charts written`)
