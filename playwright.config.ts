import { defineConfig, devices } from '@playwright/test'

// A test for something only some engines have runs only there, so no engine reports it skipped. Chromium alone shows its real
// scroll bars headless and has scroll-driven animations (@chromium-only); WebKit has no window.find to stand in for find in page
// (@not-webkit). The package's own tests use no browser, so they run once.
const CHROMIUM_ONLY = ['**/scrollbars.spec.ts', '**/package.spec.ts']

export default defineConfig({
  testDir: 'tests',
  fullyParallel: true,
  // three engines at once: more workers than this and Firefox can time out just creating its pages
  workers: 4,
  reporter: [['list']],
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } } },
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'], viewport: { width: 1280, height: 800 } },
      testIgnore: CHROMIUM_ONLY,
      grepInvert: /@chromium-only/,
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'], viewport: { width: 1280, height: 800 } },
      testIgnore: CHROMIUM_ONLY,
      grepInvert: /@chromium-only|@not-webkit/,
    },
  ],
})
