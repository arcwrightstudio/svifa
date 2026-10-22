// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Arcwright Studio

// Each framework entry renders on a server, where there is no window: the component renders what it holds, and makes nothing. Each
// app is bundled for Node from its source, as the framework's own server build would, and run here.
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { build, type BuildOptions, type Plugin } from 'esbuild'
import { compile } from 'svelte/compiler'
import { expect, test } from './fixtures'

const ROOT = new URL('..', import.meta.url)
const TESTS = new URL('.', import.meta.url).pathname.replace(/^\/(\w:)/, '$1')
const HERE = mkdtempSync(join(tmpdir(), 'svifa-server-'))
test.afterAll(() => rmSync(HERE, { recursive: true, force: true }))

// Bundles `source` for Node, runs it, and returns what its default export resolves to.
async function render(name: string, source: string, options: BuildOptions = {}): Promise<string> {
  const outfile = join(HERE, `${name}.mjs`)
  await build({
    stdin: { contents: source, resolveDir: TESTS, loader: 'ts' },
    absWorkingDir: ROOT.pathname.replace(/^\/(\w:)/, '$1'),
    bundle: true,
    platform: 'node',
    format: 'esm',
    outfile,
    logLevel: 'silent',
    define: { 'process.env.NODE_ENV': '"production"', __VERSION__: '"test"' },
    // a framework's own CommonJS files reach Node's require through this
    banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" },
    ...options,
  })
  const module = await import(pathToFileURL(outfile).href)
  return module.default
}

test('React: SmoothScroll renders what it holds', async () => {
  const html = await render(
    'react',
    `import { createElement as h } from 'react'
    import { renderToString } from 'react-dom/server'
    import { SmoothScroll } from '../src/react'
    export default renderToString(h(SmoothScroll, { lerp: 0.08 }, h('p', null, 'held')))`
  )
  expect(html).toBe('<p>held</p>')
})

test('Vue: SmoothScroll renders what it holds', async () => {
  const html = await render(
    'vue',
    `import { createSSRApp, h } from 'vue'
    import { renderToString } from 'vue/server-renderer'
    import { SmoothScroll, useSvifa } from '../src/vue'
    const Probe = { setup: () => { const svifa = useSvifa(() => {}); return () => h('p', null, svifa.value === null ? 'held' : 'made') } }
    export default renderToString(createSSRApp({ render: () => h(SmoothScroll, { lerp: 0.08 }, () => h(Probe)) }))`,
    {
      define: {
        'process.env.NODE_ENV': '"production"',
        __VERSION__: '"test"',
        __VUE_OPTIONS_API__: 'true',
        __VUE_PROD_DEVTOOLS__: 'false',
      },
    }
  )
  expect(html).toContain('<p>held</p>')
})

test('Svelte: smoothScroll and useSvifa render on the server', async () => {
  const component = compile(
    `<script>
      import { smoothScroll, useSvifa } from '../src/svelte'
      const svifa = smoothScroll({ lerp: 0.08 })
      const seen = useSvifa(() => {})
    </script>
    <p>{$svifa === null && $seen === null ? 'held' : 'made'}</p>`,
    { filename: 'Root.svelte', generate: 'server' }
  ).js.code
  // the component compiled for the server, as the Svelte plugin of a build tool hands it on
  const svelte: Plugin = {
    name: 'svelte',
    setup(build) {
      build.onResolve({ filter: /^\.\/Root\.svelte$/ }, () => ({ path: 'Root.svelte', namespace: 'svelte' }))
      build.onLoad({ filter: /.*/, namespace: 'svelte' }, () => ({ contents: component, resolveDir: TESTS, loader: 'js' }))
    },
  }
  const html = await render(
    'svelte',
    `import { render } from 'svelte/server'
    import Root from './Root.svelte'
    export default render(Root).body`,
    { plugins: [svelte] }
  )
  expect(html).toContain('<p>held</p>')
})

test('Solid: SmoothScroll renders what it holds', async () => {
  const html = await render(
    'solid',
    `import { createComponent } from 'solid-js'
    import { renderToString } from 'solid-js/web'
    import { SmoothScroll } from '../src/solid'
    export default renderToString(() => createComponent(SmoothScroll, { lerp: 0.08, get children() { return 'held' } }))`
  )
  expect(html).toBe('held')
})

test('Angular: provideSmoothScroll, injectSvifa and createSvifa render on the server', async () => {
  const html = await render(
    'angular',
    `import '@angular/compiler'
    import { Component, enableProdMode, provideZonelessChangeDetection } from '@angular/core'
    import { bootstrapApplication } from '@angular/platform-browser'
    import { provideServerRendering, renderApplication } from '@angular/platform-server'
    import { createSvifa, injectSvifa, provideSmoothScroll } from '../src/angular'

    enableProdMode()

    @Component({ selector: 'app-root', template: '<p>{{ page() === null && own() === null ? "held" : "made" }}</p>' })
    class Root {
      page = injectSvifa(() => {})
      own = createSvifa({ lerp: 0.08 })
    }
    const config = { providers: [provideZonelessChangeDetection(), provideServerRendering(), provideSmoothScroll({ lerp: 0.08 })] }
    export default renderApplication((context) => bootstrapApplication(Root, config, context), {
      document: '<html><head></head><body><app-root></app-root></body></html>',
    })`,
    { tsconfigRaw: { compilerOptions: { experimentalDecorators: true } } }
  )
  expect(html).toContain('<p>held</p>')
})
