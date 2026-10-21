// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Arcwright Studio

// How much of Svifa's source the tests run. `npm run coverage` runs the suite in Chromium, which records what each test ran of the
// script build (tests/fixtures.ts); this maps that back to the files in src/ through the build's source map, prints statements,
// branches, functions and lines for each file and in all, and fails below the floors set here. Run after the build.
// usage: node scripts/coverage.mjs [--clean]
import { existsSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import libCoverage from 'istanbul-lib-coverage'
import v8toIstanbul from 'v8-to-istanbul'

const root = fileURLToPath(new URL('..', import.meta.url))
const raw = `${root}coverage/raw/`
if (process.argv.includes('--clean')) {
  rmSync(`${root}coverage`, { recursive: true, force: true })
  process.exit(0)
}

// the least the tests may cover, in percent; raised as coverage grows, never lowered
const FLOOR = { statements: 96, branches: 89, functions: 94, lines: 96 }

if (!existsSync(raw)) {
  console.error('Nothing was recorded: run `npm run coverage`, which runs the tests in Chromium first.')
  process.exit(1)
}
const build = `${root}dist/svifa.global.js`
const source = readFileSync(build, 'utf8')
const sourcemap = JSON.parse(readFileSync(`${build}.map`, 'utf8'))
const map = libCoverage.createCoverageMap({})
for (const name of readdirSync(raw)) {
  // the script build with its source map file, or a test's own bundle (the React tests'), which carries its source map inside
  for (const { url, source: own, functions } of JSON.parse(readFileSync(raw + name, 'utf8'))) {
    const converter =
      own === undefined
        ? v8toIstanbul(build, 0, { source, sourceMap: { sourcemap } })
        : v8toIstanbul(`${root}${url.split('/').pop()}`, 0, { source: own })
    await converter.load()
    converter.applyCoverage(functions)
    map.merge(converter.toIstanbul())
  }
}
// only Svifa's own source: a test's bundle also holds React
map.filter((file) => relative(root, file).replaceAll('\\', '/').startsWith('src/'))

const KINDS = ['statements', 'branches', 'functions', 'lines']
const percent = (summary, kind) => summary[kind].pct
const row = (label, summary) =>
  [label.padEnd(18), ...KINDS.map((kind) => `${percent(summary, kind).toFixed(1)}%`.padStart(11))].join('')
console.log(['file'.padEnd(18), ...KINDS.map((kind) => kind.padStart(11))].join(''))
for (const file of map.files().sort()) {
  console.log(row(relative(root, file).replaceAll('\\', '/'), map.fileCoverageFor(file).toSummary().data))
}
const total = map.getCoverageSummary().data
console.log(row('all', total))

const short = KINDS.filter((kind) => percent(total, kind) < FLOOR[kind])
if (short.length > 0) {
  console.error(short.map((kind) => `${kind} ${percent(total, kind).toFixed(1)}% is below the floor of ${FLOOR[kind]}%`).join('\n'))
  process.exit(1)
}
