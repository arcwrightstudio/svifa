// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Arcwright Studio

// The Angular entry, in a real Angular app (compiled in the browser by Angular's own compiler, without zone.js).
import type { Page } from '@playwright/test'
import { glide, mountApp, otherVersion } from './app'
import { expect, test } from './fixtures'

const app = (zone: boolean) => `${zone ? "import 'zone.js'" : ''}
import '@angular/compiler'
import * as core from '@angular/core'
import { Component, ElementRef, ViewChild, effect, provideZoneChangeDetection } from '@angular/core'
import { bootstrapApplication } from '@angular/platform-browser'
import { createSvifa, injectSvifa, provideSmoothScroll } from '../src/angular'

const w = window as any
w.reports = 0

@Component({ selector: 'app-root', template: '<p>page</p>' })
class PageRoot {
  svifa = injectSvifa(() => w.reports++)
  constructor() {
    effect(() => (w.probe = this.svifa()))
  }
}

@Component({
  selector: 'app-root',
  template: '<div id="box" #box style="height: 300px; overflow: auto"><div style="height: 3000px"></div></div>',
})
class BoxRoot {
  // the query in its decorator form: the compiler in the browser reads decorators, and the signal form (viewChild) is read by
  // Angular's build-time compiler, which the example app built with the Angular CLI uses
  @ViewChild('box', { static: true }) box!: ElementRef<HTMLElement>
  svifa = createSvifa(() => ({ scroller: this.box.nativeElement, autoRaf: false }))
  constructor() {
    effect(() => (w.probe = this.svifa()))
  }
}

// without zone.js; its provider had another name before Angular 20
const zoneless = (core as any).provideZonelessChangeDetection ?? (core as any).provideExperimentalZonelessChangeDetection
const page = w.which !== 'box'
bootstrapApplication(page ? PageRoot : BoxRoot, {
  providers: [${zone ? 'provideZoneChangeDetection()' : 'zoneless()'}, ...(page ? [provideSmoothScroll({ autoRaf: false, lerp: 0.12 })] : [])],
}).then((app) => (w.app = app))
`

const mount = (page: Page, which: 'page' | 'box', zone = false) =>
  mountApp(page, zone ? 'angular-zone' : 'angular', app(zone), {
    body: '<app-root></app-root><div class="tall"></div>',
    globals: { which },
    esbuild: {
      plugins: otherVersion('angular', [
        '@angular/core',
        '@angular/common',
        '@angular/compiler',
        '@angular/platform-browser',
        'rxjs',
        'zone.js',
      ]),
      tsconfigRaw: { compilerOptions: { experimentalDecorators: true } },
    },
  })

test('provideSmoothScroll makes one Svifa that injectSvifa reaches, and takes it off with the app', async ({ page }) => {
  const errors = await mount(page, 'page')
  const first = await page.evaluate(() => {
    const w = window as any
    const prevented = w.wheel(window, 200)
    return {
      classes: [...document.documentElement.classList].filter((name) => name !== 'svifa-subpixel').join(' '),
      prevented,
      lerp: w.probe.options.lerp,
    }
  })
  expect(first).toEqual({ classes: 'svifa svifa-gliding', prevented: true, lerp: 0.12 })
  await glide(page)
  expect(await page.evaluate(() => [window.scrollY, (window as any).reports > 0])).toEqual([200, true])

  await page.evaluate(() => (window as any).app.destroy())
  await page.waitForFunction(() => document.documentElement.className === '')
  expect(errors).toEqual([])
})

test('createSvifa makes a Svifa for an element from a view query, and takes it off with its component', async ({ page }) => {
  const errors = await mount(page, 'box')
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
  await page.evaluate(() => (window as any).app.destroy())
  await page.waitForFunction(() => !document.getElementById('box')?.classList.contains('svifa'))
  expect(errors).toEqual([])
})

test('provideSmoothScroll works the same with zone.js, outside its zone', async ({ page }) => {
  const errors = await mount(page, 'page', true)
  const result = await page.evaluate(() => {
    const w = window as any
    const prevented = w.wheel(window, 200)
    return { zone: typeof w.Zone, prevented, gliding: w.probe.isGliding }
  })
  expect(result).toEqual({ zone: 'function', prevented: true, gliding: true })
  await glide(page)
  expect(await page.evaluate(() => [window.scrollY, (window as any).reports > 0])).toEqual([200, true])
  expect(errors).toEqual([])
})
