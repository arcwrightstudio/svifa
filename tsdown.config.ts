// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Arcwright Studio

import { readFileSync } from 'node:fs'
import { defineConfig, type UserConfig } from 'tsdown'

const { version } = JSON.parse(readFileSync('./package.json', 'utf8')) as { version: string }

// What every build shares: ES2019 syntax, read by every browser Svifa runs in and by older build tools (webpack 4 cannot parse `?.`
// or class fields), source maps, and the version written in.
const shared: UserConfig = {
  target: 'es2019',
  sourcemap: true,
  define: { __VERSION__: JSON.stringify(version) },
  // each build writes its own files into dist/, which the build script empties first
  clean: false,
}

// Declarations are written from the source alone (it states every exported type: isolatedDeclarations in tsconfig.json).
const dts = { generator: 'oxc' } as const

export default defineConfig([
  // for bundlers and Node: an ES module and a CommonJS module, each with its types (the CommonJS module carries the class both as
  // Svifa and as default, as the ES module does)
  {
    ...shared,
    entry: { svifa: 'src/index.ts' },
    format: ['esm', 'cjs'],
    platform: 'neutral',
    dts,
    outputOptions: (options, format) => (format === 'cjs' ? { ...options, exports: 'named' } : options),
  },
  // the React entry: the core stays one import of '@arcwrightstudio/svifa', so a project holds one Svifa class whichever entry it
  // uses; and it is a client component for frameworks with server components (Next.js)
  {
    ...shared,
    entry: { react: 'src/react.ts' },
    format: ['esm', 'cjs'],
    platform: 'neutral',
    dts,
    deps: { neverBundle: ['react', '@arcwrightstudio/svifa'] },
    banner: { js: "'use client'" },
  },
  // for a plain <script> tag: window.Svifa, readable and minified (keepNames: the class is still called Svifa in devtools)
  ...[false, true].map((minify): UserConfig => ({
    ...shared,
    entry: { [minify ? 'svifa.global.min' : 'svifa.global']: 'src/global.ts' },
    format: 'iife',
    platform: 'browser',
    minify,
    // named as written (svifa.global.js), with no format in the name
    outputOptions: (options) => ({ ...options, entryFileNames: '[name].js', keepNames: true }),
  })),
])
