// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Arcwright Studio

// A framework's app around one of Svifa's components: bundled from its source here, served from an address of its own beside the test
// page (as the script build is), and loaded into the page once `globals` are set. Returns every error the page reports.
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Page } from '@playwright/test'
import { build, type BuildOptions, type Plugin } from 'esbuild'
import { ORIGIN, open } from './setup'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const TESTS = fileURLToPath(new URL('.', import.meta.url))

export interface AppOptions {
  /** The page's markup around the app. */
  body?: string
  /** Set on window before the app runs. */
  globals?: Record<string, unknown>
  /** The app is ready once this, run in the page, is true. */
  ready?: string
  /** esbuild options for this framework (its defines, conditions, plugins). */
  esbuild?: BuildOptions
}

export async function mountApp(page: Page, name: string, source: string, options: AppOptions = {}): Promise<string[]> {
  const {
    body = '<div id="root"></div><div class="tall"></div>',
    globals = {},
    ready = 'window.probe != null',
    esbuild = {},
  } = options
  const bundled = await build({
    stdin: { contents: source, resolveDir: TESTS, loader: 'tsx' },
    absWorkingDir: ROOT,
    bundle: true,
    format: 'iife',
    write: false,
    logLevel: 'silent',
    // a coverage run maps what ran back to src/ through it
    sourcemap: 'inline',
    ...esbuild,
    define: { 'process.env.NODE_ENV': '"development"', __VERSION__: '"test"', ...esbuild.define },
  })
  const errors: string[] = []
  page.on('console', (message) => message.type() === 'error' && errors.push(message.text()))
  page.on('pageerror', (error) => errors.push(String(error)))
  await open(page, body)
  await page.evaluate((globals) => Object.assign(window, globals), globals)
  const url = `${ORIGIN}/${name}-app.js`
  // the route registered last is asked first
  const script = bundled.outputFiles?.[0]?.text ?? ''
  await page.route(url, (route) => route.fulfill({ contentType: 'text/javascript', body: script }))
  await page.addScriptTag({ url })
  await page.waitForFunction(ready, null, { timeout: 5000 })
  return errors
}

/** The node_modules folder of another version of a framework, from `SVIFA_<NAME>_DIR`, when one is given. */
export const otherDir = (name: string): string | undefined => process.env[`SVIFA_${name.toUpperCase()}_DIR`]

/**
 * Another version of a framework for the tests to run against: with `SVIFA_<NAME>_DIR=<a node_modules folder>`, each of its packages
 * (and their subpaths, through each package's own exports) is resolved from there (React 18, Vue 3.3, Svelte 4, Solid 1.6 and
 * Angular 19, the oldest versions supported, say). Nothing without it.
 */
export function otherVersion(name: string, packages: string[]): Plugin[] {
  const dir = otherDir(name)
  if (!dir) return []
  const filter = new RegExp(`^(${packages.map((pkg) => pkg.replace(/[/.]/g, (c) => `\\${c}`)).join('|')})(/|$)`)
  return [
    {
      name: `other-${name}`,
      setup(build) {
        build.onResolve({ filter }, (args) =>
          args.pluginData?.other
            ? undefined
            : build.resolve(args.path, { kind: args.kind, resolveDir: join(dir, '..'), pluginData: { other: true } })
        )
      },
    },
  ]
}

/** Steps the Svifa at `window.probe` through a glide on the test's clock until it rests. */
export const glide = (page: Page): Promise<void> =>
  page.evaluate(() => {
    const w = window as any
    for (let t = (w.clock = (w.clock ?? 1000) + 16); w.probe.isGliding; t += 16) w.probe.raf((w.clock = t))
  })
