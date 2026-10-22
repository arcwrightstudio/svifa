// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Arcwright Studio

// Proves every example works with Svifa as it would be published: packs the package, copies each example into a temporary folder,
// installs it there with the tarball in place of the published version (with every dependency at least a week old), builds it with
// its framework's own tools, serves the result as the framework does, and drives it in a browser. The wheel must glide the
// page, a same-page link must glide to its section below the sticky header, the reading progress must follow, and the console must
// stay clear of errors and warnings. Run after the build.
// usage: node scripts/check-examples.mjs [name ...]
import { execSync, spawn } from 'node:child_process'
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { createServer as createNetServer } from 'node:net'
import { tmpdir } from 'node:os'
import { extname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from '@playwright/test'

const REPO = fileURLToPath(new URL('..', import.meta.url))
const HERE = mkdtempSync(join(tmpdir(), 'svifa-examples-'))
const { version } = JSON.parse(readFileSync(join(REPO, 'package.json'), 'utf8'))
execSync(`npm pack --pack-destination "${HERE}"`, { cwd: REPO, stdio: 'ignore' })
const TGZ = join(HERE, `arcwrightstudio-svifa-${version}.tgz`).split('\\').join('/')
// the newest release of each dependency that is at least a week old
const BEFORE = new Date(Date.now() - 7 * 864e5).toISOString()
const QUIET = {
  CI: '1',
  ASTRO_TELEMETRY_DISABLED: '1',
  NEXT_TELEMETRY_DISABLED: '1',
  NUXT_TELEMETRY_DISABLED: '1',
  NG_CLI_ANALYTICS: 'false',
}

// How each example is served once built: a folder of static files, or the framework's own server.
const EXAMPLES = {
  vite: { files: 'dist' },
  vue: { files: 'dist' },
  solid: { files: 'dist' },
  angular: { files: 'dist/svifa-example/browser' },
  astro: { files: 'dist', next: '/more/' },
  html: { files: '.', plain: true },
  next: { server: (port) => ['node_modules/next/dist/bin/next', 'start', '-p', String(port)] },
  nuxt: { server: () => ['.output/server/index.mjs'] },
  sveltekit: { server: () => ['build'] },
}

const TYPES = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
}

// a port nothing listens on, as the system hands one out
const freePort = () =>
  new Promise((resolve) => {
    const probe = createNetServer().listen(0, () => {
      const { port } = probe.address()
      probe.close(() => resolve(port))
    })
  })

// a folder of built files, served as a static host does (a folder's index.html for its path)
function serveFiles(root, port) {
  const server = createServer((request, response) => {
    let path = decodeURIComponent(new URL(request.url, 'http://x').pathname)
    if (path.endsWith('/')) path += 'index.html'
    const file = join(root, path)
    if (!existsSync(file)) {
      response.writeHead(404).end()
      return
    }
    response.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' }).end(readFileSync(file))
  })
  return new Promise((resolve) => server.listen(port, () => resolve(() => server.close())))
}

// the framework's own server, run by Node itself (no shell between, so stopping it stops the server), ready once it answers
async function serveWith(args, cwd, port) {
  const child = spawn(process.execPath, args, { cwd, env: { ...process.env, ...QUIET, PORT: String(port) }, stdio: 'ignore' })
  for (let i = 0; i < 120; i++) {
    try {
      if ((await fetch(`http://localhost:${port}/`)).ok) return () => child.kill()
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 500))
  }
  child.kill()
  throw new Error(`${args.join(' ')} did not start`)
}

// Builds the plain page's copy: the tags that load Svifa from the CDN load this build instead.
function plainPage(dir) {
  const page = join(dir, 'index.html')
  const html = readFileSync(page, 'utf8')
    .replace(/<link rel="stylesheet" href="https:\/\/cdn[^>]*>/, '<link rel="stylesheet" href="/svifa.css" />')
    .replace(/<script src="https:\/\/cdn[^>]*><\/script>/, '<script src="/svifa.global.min.js"></script>')
  writeFileSync(page, html)
  cpSync(join(REPO, 'svifa.css'), join(dir, 'svifa.css'))
  cpSync(join(REPO, 'dist', 'svifa.global.min.js'), join(dir, 'svifa.global.min.js'))
}

// What every example must do in the browser.
async function drive(browser, url, name, spec) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })
  const said = []
  page.on(
    'console',
    (message) => ['error', 'warning'].includes(message.type()) && said.push(`${message.type()}: ${message.text()}`)
  )
  page.on('pageerror', (error) => said.push(`error: ${error.message}`))
  try {
    await steps(page, name, spec, url)
  } catch (error) {
    throw new Error([error.message.split('\n')[0], ...said].join(' | '), { cause: error })
  } finally {
    await page.close()
  }
  if (said.length) throw new Error(said.join(' | '))
  return true
}

async function steps(page, name, spec, url) {
  await page.goto(url, { waitUntil: 'networkidle' })
  await page.waitForFunction(() => document.documentElement.classList.contains('svifa'), null, { timeout: 10000 })
  const rests = () => page.waitForFunction(() => !document.documentElement.classList.contains('svifa-gliding'))

  // the wheel glides the page to where it was sent
  await page.mouse.move(640, 600)
  await page.mouse.wheel(0, 400)
  await page.waitForFunction(() => document.documentElement.classList.contains('svifa-gliding'), null, { timeout: 2000 })
  await rests()
  const wheeled = await page.evaluate(() => window.scrollY)
  if (Math.abs(wheeled - 400) > 1) throw new Error(`the wheel took the page to ${wheeled}, not 400`)

  // a same-page link glides to its section, stopping below the 56px header, and the reading progress follows
  await page.click('a[href="#three"]')
  await page.waitForFunction(() => document.documentElement.classList.contains('svifa-gliding'), null, { timeout: 2000 })
  await rests()
  const top = await page.evaluate(() => document.getElementById('three').getBoundingClientRect().top)
  if (Math.abs(top - 56) > 1) throw new Error(`the link left its section at ${top}px, not 56`)
  const progress = await page.evaluate(() => document.querySelector('progress')?.value ?? 1)
  if (!(progress > 0.5)) throw new Error(`the reading progress reads ${progress}`)

  // the Angular example's box glides with a Svifa of its own
  if (name === 'angular') {
    const box = page.locator('.box')
    await box.scrollIntoViewIfNeeded()
    const at = await box.boundingBox()
    await page.mouse.move(at.x + at.width / 2, at.y + at.height / 2)
    await page.mouse.wheel(0, 120)
    await page.waitForFunction(() => document.querySelector('.box').classList.contains('svifa-gliding'), null, { timeout: 2000 })
    await page.waitForFunction(() => !document.querySelector('.box').classList.contains('svifa-gliding'))
    const boxed = await box.evaluate((element) => element.scrollTop)
    if (Math.abs(boxed - 120) > 1) throw new Error(`the box glided to ${boxed}, not 120`)
  }

  // the Astro example's next page comes in with a view transition, and its own Svifa glides it
  if (spec.next) {
    await page.click(`a[href="${spec.next}"]`)
    await page.waitForURL(`**${spec.next}`)
    await page.waitForFunction(() => document.querySelector('svifa-scroll')?.svifa != null, null, { timeout: 5000 })
    await page.mouse.wheel(0, 300)
    await page.waitForFunction(() => document.documentElement.classList.contains('svifa-gliding'), null, { timeout: 2000 })
    await rests()
  }
}

const chosen = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(EXAMPLES)
const unknown = chosen.filter((name) => !Object.hasOwn(EXAMPLES, name))
if (unknown.length) {
  console.error(`No such example: ${unknown.join(', ')}. The examples are ${Object.keys(EXAMPLES).join(', ')}.`)
  process.exit(1)
}
const browser = await chromium.launch()
const results = {}
// what the frameworks print about themselves while building, shown at the end
const notes = []
for (const name of chosen) {
  const spec = EXAMPLES[name]
  const dir = join(HERE, name)
  const row = (results[name] = {})
  const step = async (label, run) => {
    if (Object.values(row).some((value) => value !== 'ok')) return
    try {
      row[label] = (await run()) === false ? 'FAILED' : 'ok'
    } catch (error) {
      // what the command printed last, the error itself included
      const said = [error.stdout, error.stderr, error.message].filter(Boolean).join('\n')
      row[label] = `FAILED: ${said.split('\n').filter(Boolean).slice(-12).join(' | ').slice(0, 2000)}`
    }
  }
  cpSync(join(REPO, 'examples', name), dir, {
    recursive: true,
    filter: (from) => !/node_modules|[\\/](\.next|\.nuxt|\.output|dist|build|\.svelte-kit|\.astro|\.angular)$/.test(from),
  })
  const run = (command) =>
    execSync(command, { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, ...QUIET } })
  if (spec.plain) {
    await step('build', () => (plainPage(dir), true))
  } else {
    const manifest = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'))
    manifest.dependencies['@arcwrightstudio/svifa'] = `file:${TGZ}`
    writeFileSync(join(dir, 'package.json'), JSON.stringify(manifest, null, 2))
    await step('install', () => (run(`npm install --before=${BEFORE} --no-audit --no-fund`), true))
    // a warning about Svifa fails the build; one a framework prints about itself is listed at the end
    await step('build', () => {
      // the temporary folder's own name says svifa, so paths into it are taken out before a line is read
      const warned = run('npm run build 2>&1')
        .split('\n')
        .filter((line) => /warn/i.test(line))
        .map((line) => line.split(HERE).join('<example>').split(HERE.split('\\').join('/')).join('<example>'))
      const about = (line) => /svifa/i.test(line.replace(/<example>[^\s'"]*/g, ''))
      notes.push(...warned.filter((line) => !about(line)).map((line) => `${name}: ${line.trim()}`))
      const ours = warned.filter(about)
      if (ours.length) throw new Error(ours.join(' | '))
      return true
    })
  }
  const port = await freePort()
  let stop = null
  await step('serve', async () => {
    stop = spec.server ? await serveWith(spec.server(port), dir, port) : await serveFiles(join(dir, spec.files), port)
    return true
  })
  await step('in the browser', () => drive(browser, `http://localhost:${port}/`, name, spec))
  stop?.()
}
await browser.close()

for (const [name, row] of Object.entries(results)) {
  console.log(
    name.padEnd(10),
    Object.entries(row)
      .map(([label, value]) => `${label} ${value === 'ok' ? 'ok' : 'FAILED'}`)
      .join(', ')
  )
}
const failed = Object.entries(results).flatMap(([name, row]) =>
  Object.entries(row)
    .filter(([, value]) => value !== 'ok')
    .map(([label, value]) => `${name} ${label}: ${value}`)
)
if (notes.length) console.log(['', 'What the frameworks printed about themselves while building:', ...new Set(notes)].join('\n'))
rmSync(HERE, { recursive: true, force: true, maxRetries: 10, retryDelay: 500 })
if (failed.length) {
  console.error(failed.join('\n'))
  process.exit(1)
}
