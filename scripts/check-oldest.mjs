// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Arcwright Studio

// Proves each framework entry works with the oldest version of its framework that package.json supports (peerDependencies): installs
// that version into a folder of its own and runs the entry's tests against it (SVIFA_<NAME>_DIR, read by tests/app.ts), in Chromium.
// Fails when a version here no longer matches the lowest one peerDependencies names. Run after the build.
// usage: node scripts/check-oldest.mjs
import { execSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO = fileURLToPath(new URL('..', import.meta.url))
const HERE = mkdtempSync(join(tmpdir(), 'svifa-oldest-'))
const { peerDependencies } = JSON.parse(readFileSync(join(REPO, 'package.json'), 'utf8'))

// each entry, the framework package peerDependencies names, and what is installed to test it
const OLDEST = {
  react: { peer: 'react', install: ['react@18.3.1', 'react-dom@18.3.1'] },
  vue: { peer: 'vue', install: ['vue@3.3.13'] },
  svelte: { peer: 'svelte', install: ['svelte@4.2.20'] },
  solid: { peer: 'solid-js', install: ['solid-js@1.6.16'] },
  angular: {
    peer: '@angular/core',
    install: [
      '@angular/core@19.2.25',
      '@angular/common@19.2.25',
      '@angular/compiler@19.2.25',
      '@angular/platform-browser@19.2.25',
      'rxjs@7.8.2',
      'zone.js@0.15.1',
    ],
  },
}

const failed = []
for (const [name, { peer, install }] of Object.entries(OLDEST)) {
  // the version tested is in the line peerDependencies starts from (">=3.3" is tested on a 3.3 release)
  const lowest = peerDependencies[peer].replace(/^>=/, '')
  const version = install.find((spec) => spec.startsWith(`${peer}@`)).slice(peer.length + 1)
  if (!`${version}.`.startsWith(`${lowest}.`)) {
    failed.push(`${name}: peerDependencies supports ${peer} from ${lowest}, but ${version} is what is tested`)
    continue
  }
  // a folder of its own, with a package.json, so npm installs there and nowhere above it
  const dir = join(HERE, name)
  mkdirSync(dir)
  writeFileSync(join(dir, 'package.json'), '{ "private": true }\n')
  execSync(`npm install --prefix "${dir}" --no-audit --no-fund --ignore-scripts ${install.join(' ')}`, { stdio: 'ignore' })
  try {
    execSync(`npx playwright test tests/${name}.spec.ts --project chromium --reporter=line`, {
      cwd: REPO,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, [`SVIFA_${name.toUpperCase()}_DIR`]: join(dir, 'node_modules') },
    })
    console.log(`${name.padEnd(8)} ${version} ok`)
  } catch (error) {
    failed.push(`${name} ${version}: ${String(error.stdout).split('\n').filter(Boolean).slice(-8).join(' | ')}`)
  }
}

rmSync(HERE, { recursive: true, force: true, maxRetries: 10, retryDelay: 500 })
if (failed.length) {
  console.error(failed.join('\n'))
  process.exit(1)
}
