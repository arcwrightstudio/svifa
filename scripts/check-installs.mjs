// Before a release: packs Svifa as it would be published, installs it with each package manager (npm, pnpm, Yarn 1, Yarn 4 in
// Plug'n'Play mode, Bun, Deno) into a fresh project in a temporary folder, and proves it works there: an ES module import, a CommonJS
// require, a type check and a bundle with the stylesheet. Any warning printed while the package runs, is bundled or is type checked
// fails the check. Bun, Deno and Yarn 4 are fetched through npx and corepack when missing.
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
execSync(`npm pack --pack-destination "${HERE}"`, { cwd: REPO, stdio: 'ignore' })
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
// the React entry, beside React (it imports the core by the package's own name, which every manager has to resolve)
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
const ENTRY = `import Svifa from '@arcwrightstudio/svifa'
import '@arcwrightstudio/svifa/svifa.css'
window.svifa = new Svifa()`

const run = (cmd, cwd) => execSync(cmd, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, CI: '1', COREPACK_ENABLE_DOWNLOAD_PROMPT: '0' } }).trim()
// runs a step that uses the package, with what it writes to stderr read too: a warning there is a failure (npm's own lines, such as
// npx saying it fetched Bun or Deno, are about the machine, not the package)
const use = (cmd, cwd) => {
  const out = run(`${cmd} 2>&1`, cwd)
  const warned = out.split('\n').filter((line) => /warn/i.test(line) && !/^npm warn /i.test(line))
  if (warned.length) throw new Error(warned.join(' | '))
  return out
}
const lastJson = (out) => JSON.parse(out.split('\n').filter((l) => l.startsWith('{')).at(-1))

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
  return dir
}

function typecheck(dir, resolution) {
  const config = {
    compilerOptions: { strict: true, noEmit: true, target: 'ES2020', lib: ['ES2020', 'DOM'], skipLibCheck: false, types: [],
      ...{
        bundler: { module: 'ESNext', moduleResolution: 'Bundler' },
        nodenext: { module: 'NodeNext', moduleResolution: 'NodeNext' },
        node10: { module: 'CommonJS', moduleResolution: 'Node10' },
      }[resolution] },
    files: ['use.ts', 'react.ts'],
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
      row[label] = 'FAILED: ' + String(error.stderr || error.message).split('\n').filter(Boolean).slice(-2).join(' | ').slice(0, 220)
    }
  }
}

// npm, pnpm and Yarn 1: a node_modules folder
for (const [name, install] of [
  ['npm', `npm install "${TGZ}" react@${REACT_VERSION} @types/react@${REACT_VERSION} --no-audit --no-fund`],
  ['pnpm', `pnpm add "${TGZ}" react@${REACT_VERSION} @types/react@${REACT_VERSION}`],
  ['yarn1', `yarn add "file:${TGZ}" react@${REACT_VERSION} @types/react@${REACT_VERSION} --no-lockfile`],
]) {
  const dir = project(name)
  attempt(name, [
    ['install', () => (run(install, dir), true)],
    ['esm', () => lastJson(use('node check.mjs', dir)).esm],
    ['cjs', () => lastJson(use('node check.cjs', dir)).cjs],
    ['types (bundler)', () => typecheck(dir, 'bundler')],
    ['types (nodenext)', () => typecheck(dir, 'nodenext')],
    ['types (node10)', () => typecheck(dir, 'node10')],
    ['react entry', () => lastJson(use('node react.mjs', dir)).react],
    ['bundle with css', () => bundle(dir)],
  ])
}

// Yarn 4 in its strict Plug'n'Play mode: no node_modules, every import resolved through .pnp.cjs
{
  const dir = project('yarn4-pnp')
  writeFileSync(join(dir, '.yarnrc.yml'), 'nodeLinker: pnp\nenableGlobalCache: false\n')
  // a project of its own, whatever package.json sits in a folder above
  writeFileSync(join(dir, 'yarn.lock'), '')
  const yarn = 'corepack yarn@4.9.2'
  attempt('yarn4-pnp', [
    ['install', () => (run(`${yarn} add "@arcwrightstudio/svifa@file:${TGZ}" react@${REACT_VERSION}`, dir), existsSync(join(dir, '.pnp.cjs')))],
    ['esm', () => lastJson(use(`${yarn} node check.mjs`, dir)).esm],
    ['cjs', () => lastJson(use(`${yarn} node check.cjs`, dir)).cjs],
    // through require: Yarn's ES module loader for Plug'n'Play is experimental and cannot load React itself on current Node
    ['react entry', () => lastJson(use(`${yarn} node react.cjs`, dir)).react],
  ])
}

// Bun
{
  const dir = project('bun')
  const bun = 'npx -y bun@1'
  attempt('bun', [
    ['install', () => (run(`${bun} add "${TGZ}" react@${REACT_VERSION}`, dir), true)],
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
    ['install', () => (run(`npm install "${TGZ}" --no-audit --no-fund`, dir), true)],
    ['esm', () => lastJson(use(`${deno} run check.mjs`, dir)).esm],
    ['types (deno check)', () => (use(`${deno} check use.ts`, dir), true)],
  ])
}

const failed = Object.entries(results).flatMap(([name, row]) => Object.entries(row).filter(([, v]) => v !== 'ok').map(([k, v]) => `${name} ${k}: ${v}`))
for (const [name, row] of Object.entries(results)) console.log(name.padEnd(10), Object.entries(row).map(([k, v]) => `${k} ${v === 'ok' ? 'ok' : 'FAILED'}`).join(', '))
rmSync(HERE, { recursive: true, force: true })
if (failed.length) {
  console.error(failed.join('\n'))
  process.exit(1)
}
