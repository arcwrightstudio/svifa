// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Arcwright Studio

// The Svelte entry, in a real Svelte app (5, or 4 with SVIFA_SVELTE_DIR), its components compiled here by that Svelte's own compiler.
// They are written as both Svelte 4 and 5 read them.
import { createRequire } from 'node:module'
import { join } from 'node:path'
import type { Page } from '@playwright/test'
import type { Plugin } from 'esbuild'
import { glide, mountApp, otherDir, otherVersion } from './app'
import { expect, test } from './fixtures'

const other = otherDir('svelte')
const require = createRequire(other ? join(other, 'here.js') : import.meta.url)
const { compile, VERSION } = require('svelte/compiler') as typeof import('svelte/compiler')
const svelte5 = Number(VERSION.split('.')[0]) >= 5

const COMPONENTS: Record<string, string> = {
  'Probe.svelte': `<script>
    import { useSvifa } from '../src/svelte'
    const svifa = useSvifa(() => window.reports++)
    $: window.probe = $svifa
  </script>`,
  'Alone.svelte': `<script>
    import { useSvifa } from '../src/svelte'
    // with no smoothScroll around it
    const svifa = useSvifa(() => {})
    window.alone = svifa
    window.probe = 'mounted'
  </script>`,
  'Page.svelte': `<script>
    import { smoothScroll } from '../src/svelte'
    import Probe from './Probe.svelte'
    const svifa = smoothScroll({ autoRaf: false, lerp: 0.12 })
    window.pageStore = svifa
  </script>
  <Probe />`,
  'Box.svelte': `<script>
    import { smoothScroll } from '../src/svelte'
    import Probe from './Probe.svelte'
    let box
    smoothScroll({ scroller: () => box, autoRaf: false })
  </script>
  <div id="box" bind:this={box} style="height: 300px; overflow: auto"><div style="height: 3000px"></div></div>
  <Probe />`,
}

// compiles the components above as the Svelte plugin of a build tool would
const svelte: Plugin = {
  name: 'svelte',
  setup(build) {
    build.onResolve({ filter: /\.svelte$/ }, (args) => ({ path: args.path.replace('./', ''), namespace: 'svelte' }))
    build.onLoad({ filter: /.*/, namespace: 'svelte' }, (args) => ({
      contents: compile(COMPONENTS[args.path], {
        filename: args.path,
        generate: (svelte5 ? 'client' : 'dom') as 'client',
        dev: true,
      }).js.code,
      resolveDir: new URL('.', import.meta.url).pathname.replace(/^\/(\w:)/, '$1'),
      loader: 'js',
    }))
  },
}

const APP = `
import * as svelte from 'svelte'
import Page from './Page.svelte'
import Box from './Box.svelte'
import Alone from './Alone.svelte'

const w = window as any
w.reports = 0
const Root: any = { page: Page, box: Box, alone: Alone }[w.which as 'page' | 'box' | 'alone']
const target = document.getElementById('root')!
// Svelte 5 mounts a component with mount(); Svelte 4 makes it with new
const app = 'mount' in svelte ? (svelte as any).mount(Root, { target }) : new Root({ target })
w.leave = () => ('unmount' in svelte ? (svelte as any).unmount(app) : app.$destroy())
`

const mountSvelte = (page: Page, which: 'page' | 'box' | 'alone') =>
  mountApp(page, 'svelte', APP, {
    globals: { which },
    esbuild: { plugins: [...otherVersion('svelte', ['svelte']), svelte], conditions: ['browser', 'development'] },
  })

test('smoothScroll makes one Svifa that components inside reach, and takes it off when its component leaves', async ({ page }) => {
  const errors = await mountSvelte(page, 'page')
  const first = await page.evaluate(() => {
    const w = window as any
    let shared = null
    w.pageStore.subscribe((svifa: unknown) => (shared = svifa))()
    const prevented = w.wheel(window, 200)
    return {
      same: shared === w.probe,
      classes: [...document.documentElement.classList].filter((name) => name !== 'svifa-subpixel').join(' '),
      prevented,
      lerp: w.probe.options.lerp,
    }
  })
  expect(first).toEqual({ same: true, classes: 'svifa svifa-gliding', prevented: true, lerp: 0.12 })
  await glide(page)
  expect(await page.evaluate(() => [window.scrollY, (window as any).reports > 0])).toEqual([200, true])

  await page.evaluate(() => (window as any).leave())
  await page.waitForFunction(() => document.documentElement.className === '')
  expect(errors).toEqual([])
})

test('smoothScroll takes a function that returns an element bound with bind:this as its scroller', async ({ page }) => {
  const errors = await mountSvelte(page, 'box')
  const result = await page.evaluate(() => {
    const w = window as any
    return { element: w.probe.element.id, prevented: w.wheel(document.getElementById('box'), 150) }
  })
  expect(result).toEqual({ element: 'box', prevented: true })
  await glide(page)
  expect(await page.evaluate(() => [document.getElementById('box')!.scrollTop, document.documentElement.className])).toEqual([
    150,
    '',
  ])
  expect(errors).toEqual([])
})

test('useSvifa with no smoothScroll around it is a store of null', async ({ page }) => {
  const errors = await mountSvelte(page, 'alone')
  const value = await page.evaluate(() => {
    let seen: unknown = 'unset'
    ;(window as any).alone.subscribe((svifa: unknown) => (seen = svifa))()
    return seen
  })
  expect(value).toBeNull()
  expect(errors).toEqual([])
})
