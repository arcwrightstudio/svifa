// The test and expect every spec uses: Playwright's own, with one addition for `npm run coverage`. During that run, in Chromium
// (the engine that reports it), each test records which parts of Svifa's scripts it ran (the script build, and the React tests'
// own bundle with its source map inside), for scripts/coverage.mjs to read.
import { randomUUID } from 'node:crypto'
import { mkdirSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { test as base } from '@playwright/test'
import { ORIGIN, SCRIPT_URL } from './setup'

const measuring = process.env.npm_lifecycle_event === 'coverage'
const RAW = fileURLToPath(new URL('../coverage/raw/', import.meta.url))

export const test = base.extend<{ coverage: void }>({
  coverage: [
    async ({ page, browserName }, use) => {
      const on = measuring && browserName === 'chromium'
      if (on) await page.coverage.startJSCoverage({ resetOnNavigation: false })
      await use()
      if (!on) return
      const runs = (await page.coverage.stopJSCoverage()).filter(
        (entry) => entry.url.startsWith(ORIGIN) && entry.url.endsWith('.js')
      )
      if (runs.length === 0) return
      mkdirSync(RAW, { recursive: true })
      const kept = runs.map(({ url, source, functions }) => ({ url, source: url === SCRIPT_URL ? undefined : source, functions }))
      writeFileSync(`${RAW}${randomUUID()}.json`, JSON.stringify(kept))
    },
    { auto: true },
  ],
})

export { expect } from '@playwright/test'
