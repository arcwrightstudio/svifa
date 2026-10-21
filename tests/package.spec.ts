// The package as a project receives it: importable on a server without a page, usable from CommonJS, and typed for both.
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { expect, test } from '@playwright/test'

const root = fileURLToPath(new URL('..', import.meta.url))
// a script run by Node from inside the project (so bare names such as 'react' resolve), in the ignored test-results folder
const node = (code: string, type: 'module' | 'commonjs') => {
  mkdirSync(join(root, 'test-results'), { recursive: true })
  const dir = mkdtempSync(join(root, 'test-results', 'node-'))
  const file = join(dir, type === 'module' ? 'check.mjs' : 'check.cjs')
  writeFileSync(file, code)
  return execFileSync(process.execPath, [file], { cwd: root, encoding: 'utf8' }).trim()
}

test.describe('the package', () => {
  test('imports on a server (no window), and says plainly what to do if constructed there', () => {
    const out = node(
      `import Svifa, { Svifa as Named, easeOut, version } from ${JSON.stringify(pathToFileURL(join(root, 'dist/svifa.js')).href)}
       let message = ''
       try { new Svifa() } catch (error) { message = error.message }
       console.log(JSON.stringify({ same: Svifa === Named, easeOut: typeof easeOut, version, message }))`,
      'module'
    )
    const result = JSON.parse(out)
    expect(result.same).toBe(true)
    expect(result.easeOut).toBe('function')
    expect(result.version).toMatch(/^\d+\.\d+\.\d+/)
    expect(result.message).toContain('in the browser')
  })

  test('requires from CommonJS', () => {
    const out = node(
      `const svifa = require(${JSON.stringify(join(root, 'dist/svifa.cjs'))})
       console.log(JSON.stringify({ named: typeof svifa.Svifa, fallback: typeof svifa.default, same: svifa.Svifa === svifa.default }))`,
      'commonjs'
    )
    expect(JSON.parse(out)).toEqual({ named: 'function', fallback: 'function', same: true })
  })

  test('renders the React entry on the server: the children render, and useSvifa() is null there', () => {
    const out = node(
      `import { createElement as h } from 'react'
       import { renderToString } from 'react-dom/server'
       import { SmoothScroll, useSvifa } from ${JSON.stringify(pathToFileURL(join(root, 'dist/react.js')).href)}
       let seen = 'not rendered'
       function Probe() { seen = useSvifa(); return h('p', null, 'child') }
       const html = renderToString(h(SmoothScroll, { lerp: 0.08 }, h(Probe)))
       console.log(JSON.stringify({ html, seen }))`,
      'module'
    )
    expect(JSON.parse(out)).toEqual({ html: '<p>child</p>', seen: null })
  })

  test('is typed: a consumer project compiles against the published types', () => {
    const dir = mkdtempSync(join(tmpdir(), 'svifa-types-'))
    writeFileSync(
      join(dir, 'use.ts'),
      `import Svifa, { type SvifaOptions, type ScrollToOptions } from ${JSON.stringify(join(root, 'dist/svifa.js').replace(/\\/g, '/'))}
       const options: SvifaOptions = { lerp: 0.08, subpixel: 'main > section', anchors: { offset: -80 } }
       const svifa = new Svifa(options)
       const go: ScrollToOptions = { offset: -80, lock: true }
       const arrived: Promise<boolean> = svifa.scrollTo('#contact', go)
       const stop: () => void = svifa.on('scroll', ({ scroll, progress, velocity }) => void [scroll, progress, velocity])
       void [arrived, stop]
       // @ts-expect-error an unknown option is refused
       new Svifa({ smooth: true })`
    )
    writeFileSync(
      join(dir, 'tsconfig.json'),
      JSON.stringify({
        compilerOptions: {
          strict: true,
          noEmit: true,
          module: 'ESNext',
          moduleResolution: 'Bundler',
          target: 'ES2020',
          lib: ['ES2020', 'DOM'],
          skipLibCheck: false,
        },
        files: ['use.ts'],
      })
    )
    execFileSync(process.execPath, [join(root, 'node_modules/typescript/bin/tsc'), '-p', join(dir, 'tsconfig.json')], {
      encoding: 'utf8',
    })
  })
})
