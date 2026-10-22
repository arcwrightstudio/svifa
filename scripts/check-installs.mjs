// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Arcwright Studio

// Before a release: packs Svifa as it would be published, installs it with each package manager (npm, pnpm, Yarn 1, Yarn 4 in
// Plug'n'Play mode, Bun, Deno) into a fresh project in a temporary folder, and proves it works there: an ES module import, a CommonJS
// require, a type check and a bundle with the stylesheet; with npm, every framework entry beside its framework too, and every entry
// of the package linked from its folder (npm install <folder>, as while developing beside it). Any warning printed while the
// package runs, is bundled or is type checked fails the check. Bun, Deno and Yarn 4 are fetched through npx and corepack when
// missing.
// usage: npm run check:installs
import { execSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO = fileURLToPath(new URL('..', import.meta.url))
const HERE = mkdtempSync(join(tmpdir(), 'svifa-installs-'))
const TOOLS = join(REPO, 'node_modules')
const { version } = JSON.parse(readFileSync(join(REPO, 'package.json'), 'utf8'))
// the package as it would be published; a warning while packing it stops the check
const packed = execSync(`npm pack --pack-destination "${HERE}" 2>&1`, { cwd: REPO, encoding: 'utf8' })
if (/warn|deprecat/i.test(packed)) throw new Error(`npm pack warned: ${packed}`)
const TGZ = join(HERE, `arcwrightstudio-svifa-${version}.tgz`).split('\\').join('/')
const TSC = `node "${TOOLS}/typescript/bin/tsc"`
// TypeScript 7 has no node10 resolution any more; a project still on it uses TypeScript 5, so that check runs on TypeScript 5
const TSC_5 = 'npx -y -p typescript@5.9.3 tsc'
const ESBUILD = `node "${TOOLS}/esbuild/bin/esbuild"`

const ESM = `import Svifa, { Svifa as Named, easeOut, version } from '@arcwrightstudio/svifa'
let message = ''
try { new Svifa() } catch (error) { message = error.message }
console.log(JSON.stringify({ esm: Svifa === Named && typeof easeOut === 'function' && typeof version === 'string' && message.includes('browser') }))`
const CJS = `const svifa = require('@arcwrightstudio/svifa')
console.log(JSON.stringify({ cjs: typeof svifa.Svifa === 'function' && svifa.Svifa === svifa.default && typeof svifa.version === 'string' }))`
const TS = `import Svifa, { type SvifaOptions } from '@arcwrightstudio/svifa'
const options: SvifaOptions = { lerp: 0.08, subpixel: 'main > section', anchors: { offset: -80 } }
export const make = () => new Svifa(options)
export const go = (g: Svifa): Promise<boolean> => g.scrollTo('#contact', { offset: -80 })
// @ts-expect-error an unknown option is refused
export const wrong = () => new Svifa({ smooth: true })`
// the React entry, beside React (it imports the core from the file beside it, which every manager has to keep in place)
const REACT = `import { SmoothScroll, useSvifa } from '@arcwrightstudio/svifa/react'
console.log(JSON.stringify({ react: typeof SmoothScroll === 'function' && typeof useSvifa === 'function' }))`
const REACT_TS = `import { SmoothScroll, useSvifa, type SmoothScrollProps } from '@arcwrightstudio/svifa/react'
import type { Svifa } from '@arcwrightstudio/svifa'
const props: SmoothScrollProps = { lerp: 0.08, anchors: { offset: -80 } }
export const parts = [SmoothScroll, props] as const
export const read = (): Svifa | null => useSvifa()`
const REACT_CJS = `const { SmoothScroll, useSvifa } = require('@arcwrightstudio/svifa/react')
console.log(JSON.stringify({ react: typeof SmoothScroll === 'function' && typeof useSvifa === 'function' }))`
const REACT_VERSION = '19.3.0'
// the other framework entries, each beside its framework (installed with npm only: each is an entry like the React one)
const FRAMEWORKS = ['vue@3.5.44', 'svelte@5.57.2', 'solid-js@1.9.17', '@angular/core@22.2.3', 'rxjs@7.8.2']
const FRAMEWORK_ENTRIES = `import * as vue from '@arcwrightstudio/svifa/vue'
import * as svelte from '@arcwrightstudio/svifa/svelte'
import * as solid from '@arcwrightstudio/svifa/solid'
import * as angular from '@arcwrightstudio/svifa/angular'
const functions = [vue.useSvifa, svelte.smoothScroll, svelte.useSvifa, solid.SmoothScroll, solid.useSvifa,
  angular.provideSmoothScroll, angular.injectSvifa, angular.createSvifa]
// Vue's component is an object of options around its setup function
const vueComponent = typeof vue.SmoothScroll.setup === 'function'
console.log(JSON.stringify({ frameworks: vueComponent && functions.every((part) => typeof part === 'function') }))`
const FRAMEWORK_TS = `import { SmoothScroll as VueScroll, type SmoothScrollProps as VueProps } from '@arcwrightstudio/svifa/vue'
import { smoothScroll, type SmoothScrollOptions } from '@arcwrightstudio/svifa/svelte'
import { SmoothScroll as SolidScroll, type SmoothScrollProps as SolidProps } from '@arcwrightstudio/svifa/solid'
import { createSvifa, injectSvifa, provideSmoothScroll } from '@arcwrightstudio/svifa/angular'
const vue: VueProps = { lerp: 0.08, snap: true }
const svelte: SmoothScrollOptions = { scroller: () => null, anchors: { offset: -80 } }
const solid: SolidProps = { scroller: () => undefined, axis: 'both' }
export const parts = [VueScroll, vue, smoothScroll, svelte, SolidScroll, solid, createSvifa, injectSvifa, provideSmoothScroll] as const`
const ENTRY = `import Svifa from '@arcwrightstudio/svifa'
import '@arcwrightstudio/svifa/svifa.css'
window.svifa = new Svifa()`

// The environment every step runs in: the caller's, without its colour settings (a tool may set one for its own children, and Node
// warns when it finds both).
const ENV = { ...process.env, CI: '1', COREPACK_ENABLE_DOWNLOAD_PROMPT: '0' }
delete ENV.NO_COLOR
delete ENV.FORCE_COLOR
const run = (cmd, cwd) => execSync(cmd, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env: ENV }).trim()
// runs a step, an install included, with what it writes to stderr read too: any warning there, whoever prints it, is a failure
const use = (cmd, cwd) => {
  const out = run(`${cmd} 2>&1`, cwd)
  const warned = out.split('\n').filter((line) => /warn|deprecat/i.test(line))
  if (warned.length) throw new Error(warned.join(' | '))
  return out
}
const lastJson = (out) =>
  JSON.parse(
    out
      .split('\n')
      .filter((l) => l.startsWith('{'))
      .at(-1)
  )

function project(name) {
  const dir = join(HERE, name)
  if (existsSync(dir)) rmSync(dir, { recursive: true, force: true })
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: `try-${name}`, version: '1.0.0', private: true }, null, 2))
  writeFileSync(join(dir, 'check.mjs'), ESM)
  writeFileSync(join(dir, 'check.cjs'), CJS)
  writeFileSync(join(dir, 'use.ts'), TS)
  writeFileSync(join(dir, 'entry.js'), ENTRY)
  writeFileSync(join(dir, 'react.mjs'), REACT)
  writeFileSync(join(dir, 'react.cjs'), REACT_CJS)
  writeFileSync(join(dir, 'react.ts'), REACT_TS)
  writeFileSync(join(dir, 'frameworks.mjs'), FRAMEWORK_ENTRIES)
  writeFileSync(join(dir, 'frameworks.ts'), FRAMEWORK_TS)
  return dir
}

function typecheck(dir, resolution, extra = []) {
  const config = {
    compilerOptions: {
      strict: true,
      noEmit: true,
      target: 'ES2020',
      lib: ['ES2020', 'DOM'],
      skipLibCheck: false,
      types: [],
      ...{
        bundler: { module: 'ESNext', moduleResolution: 'Bundler' },
        nodenext: { module: 'NodeNext', moduleResolution: 'NodeNext' },
        node10: { module: 'CommonJS', moduleResolution: 'Node10' },
      }[resolution],
    },
    files: ['use.ts', 'react.ts', ...extra],
  }
  writeFileSync(join(dir, `tsconfig.${resolution}.json`), JSON.stringify(config))
  use(`${resolution === 'node10' ? TSC_5 : TSC} -p tsconfig.${resolution}.json`, dir)
  return true
}

function bundle(dir) {
  use(`${ESBUILD} entry.js --bundle --outdir=out --log-level=warning`, dir)
  return existsSync(join(dir, 'out', 'entry.js')) && existsSync(join(dir, 'out', 'entry.css'))
}

const results = {}
const attempt = (name, steps) => {
  const row = (results[name] = {})
  for (const [label, step] of steps) {
    try {
      row[label] = step() ? 'ok' : 'FAILED'
    } catch (error) {
      row[label] =
        'FAILED: ' +
        String(error.stderr || error.message)
          .split('\n')
          .filter(Boolean)
          .slice(-2)
          .join(' | ')
          .slice(0, 220)
    }
  }
}

// npm, pnpm and Yarn 1: a node_modules folder
for (const [name, install] of [
  ['npm', `npm install "${TGZ}" react@${REACT_VERSION} @types/react@${REACT_VERSION} ${FRAMEWORKS.join(' ')} --no-audit --no-fund`],
  ['pnpm', `pnpm add "${TGZ}" react@${REACT_VERSION} @types/react@${REACT_VERSION}`],
  ['yarn1', `yarn add "file:${TGZ}" react@${REACT_VERSION} @types/react@${REACT_VERSION} --no-lockfile`],
]) {
  const dir = project(name)
  attempt(name, [
    ['install', () => (use(install, dir), true)],
    ['esm', () => lastJson(use('node check.mjs', dir)).esm],
    ['cjs', () => lastJson(use('node check.cjs', dir)).cjs],
    ['types (bundler)', () => typecheck(dir, 'bundler')],
    ['types (nodenext)', () => typecheck(dir, 'nodenext')],
    ['types (node10)', () => typecheck(dir, 'node10')],
    ['react entry', () => lastJson(use('node react.mjs', dir)).react],
    ['bundle with css', () => bundle(dir)],
    ...(name === 'npm'
      ? [
          ['framework entries', () => lastJson(use('node frameworks.mjs', dir)).frameworks],
          ['framework types (bundler)', () => typecheck(dir, 'bundler', ['frameworks.ts'])],
          ['framework types (nodenext)', () => typecheck(dir, 'nodenext', ['frameworks.ts'])],
        ]
      : []),
  ])
}

// The package linked from its folder, as npm links a folder it is given: Node finds a linked package's own imports from where its
// files really are, outside the project, so every import inside it has to work from there (the frameworks are this repository's).
{
  const dir = project('npm-linked')
  attempt('npm-linked', [
    // the folder without its closing separator (on Windows a closing \ would escape the quote after it)
    ['install', () => (use(`npm install "${REPO.replace(/[\\/]$/, '')}" --install-links=false --no-audit --no-fund`, dir), true)],
    ['esm', () => lastJson(use('node check.mjs', dir)).esm],
    ['cjs', () => lastJson(use('node check.cjs', dir)).cjs],
    ['react entry', () => lastJson(use('node react.mjs', dir)).react],
    ['react entry (cjs)', () => lastJson(use('node react.cjs', dir)).react],
    ['framework entries', () => lastJson(use('node frameworks.mjs', dir)).frameworks],
  ])
}

// Yarn 4 in its strict Plug'n'Play mode: no node_modules, every import resolved through .pnp.cjs
{
  const dir = project('yarn4-pnp')
  writeFileSync(join(dir, '.yarnrc.yml'), 'nodeLinker: pnp\nenableGlobalCache: false\n')
  // a project of its own, whatever package.json sits in a folder above
  writeFileSync(join(dir, 'yarn.lock'), '')
  const yarn = 'corepack yarn@4.18.1'
  attempt('yarn4-pnp', [
    // Svifa does not make Yarn turn on its experimental ES module loader (.pnp.loader.mjs), which Yarn announces with a warning
    [
      'install',
      () => (
        use(`${yarn} add "@arcwrightstudio/svifa@file:${TGZ}" react@${REACT_VERSION}`, dir),
        existsSync(join(dir, '.pnp.cjs')) && !existsSync(join(dir, '.pnp.loader.mjs'))
      ),
    ],
    ['cjs', () => lastJson(use(`${yarn} node check.cjs`, dir)).cjs],
    ['react entry', () => lastJson(use(`${yarn} node react.cjs`, dir)).react],
    // an ES module through Plug'n'Play, as a bundler loads it (esbuild reads the project's .pnp data itself)
    ['bundle with css', () => bundle(dir)],
  ])
}

// Bun
{
  const dir = project('bun')
  const bun = 'npx -y bun@1'
  attempt('bun', [
    ['install', () => (use(`${bun} add "${TGZ}" react@${REACT_VERSION}`, dir), true)],
    ['react entry', () => lastJson(use(`${bun} react.mjs`, dir)).react],
    ['esm', () => lastJson(use(`${bun} check.mjs`, dir)).esm],
    ['cjs', () => lastJson(use(`${bun} check.cjs`, dir)).cjs],
    ['bundle with css', () => (use(`${bun} build entry.js --outdir=out`, dir), existsSync(join(dir, 'out', 'entry.js')))],
  ])
}

// Deno, on a node_modules folder (it reads package.json and resolves bare names there), with its own type check
{
  const dir = project('deno')
  writeFileSync(join(dir, 'deno.json'), JSON.stringify({ nodeModulesDir: 'manual' }))
  const deno = 'npx -y deno@2'
  attempt('deno', [
    ['install', () => (use(`npm install "${TGZ}" --no-audit --no-fund`, dir), true)],
    ['esm', () => lastJson(use(`${deno} run check.mjs`, dir)).esm],
    ['types (deno check)', () => (use(`${deno} check use.ts`, dir), true)],
  ])
}

const failed = Object.entries(results).flatMap(([name, row]) =>
  Object.entries(row)
    .filter(([, v]) => v !== 'ok')
    .map(([k, v]) => `${name} ${k}: ${v}`)
)
for (const [name, row] of Object.entries(results))
  console.log(
    name.padEnd(10),
    Object.entries(row)
      .map(([k, v]) => `${k} ${v === 'ok' ? 'ok' : 'FAILED'}`)
      .join(', ')
  )
rmSync(HERE, { recursive: true, force: true })
if (failed.length) {
  console.error(failed.join('\n'))
  process.exit(1)
}
