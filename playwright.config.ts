// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Arcwright Studio

import { defineConfig, devices } from '@playwright/test'

// A test for something only some engines have runs only there, so no engine reports it skipped. Chromium alone shows its real
// scroll bars headless, has scroll-driven animations, emulates a touch screen and takes a zoom level from its profile
// (@chromium-only); WebKit has no window.find to stand in for find in page (@not-webkit); Firefox draws whole pixels whatever it is
// asked, so Svifa draws nothing between them there (@not-firefox, and @firefox-only for what it does instead). The package's own
// tests use no browser, so they run once.
const CHROMIUM_ONLY = ['**/scrollbars.spec.ts', '**/package.spec.ts', '**/server.spec.ts']

// Playwright starts every worker with FORCE_COLOR set, and Node warns in each one that also inherits a NO_COLOR. The runner has
// already read NO_COLOR for its own output by the time it reads this file, so the workers are started without it.
delete process.env.NO_COLOR

export default defineConfig({
  testDir: 'tests',
  fullyParallel: true,
  // three engines at once: more workers than this and Firefox can time out just creating its pages
  workers: 4,
  reporter: [['list']],
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } },
      grepInvert: /@firefox-only/,
    },
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'], viewport: { width: 1280, height: 800 } },
      testIgnore: CHROMIUM_ONLY,
      grepInvert: /@chromium-only|@not-firefox/,
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'], viewport: { width: 1280, height: 800 } },
      testIgnore: CHROMIUM_ONLY,
      grepInvert: /@chromium-only|@not-webkit|@firefox-only/,
    },
  ],
})
