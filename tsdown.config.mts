// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Arcwright Studio

import { readFileSync, writeFileSync } from 'node:fs'
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
  // An ES module is a .js file and a CommonJS module a .cjs file, as since 1.0.0. The package itself is "type": "commonjs": Yarn's
  // Plug'n'Play turns on its experimental ES module loader, and says so, for every project that installs a package marked
  // "type": "module". dist/package.json marks what is built as ES modules for Node instead.
  outExtensions: ({ format }) =>
    format === 'es' ? { js: '.js', dts: '.d.ts' } : format === 'cjs' ? { js: '.cjs', dts: '.d.cts' } : undefined,
}

// Declarations are written from the source alone (it states every exported type: isolatedDeclarations in tsconfig.json).
const dts = { generator: 'oxc' } as const

// The entry for each framework, and the modules of that framework it imports.
const FRAMEWORKS: Record<string, RegExp> = {
  react: /^react(\/|$)/,
  vue: /^vue(\/|$)/,
  svelte: /^svelte(\/|$)/,
  solid: /^solid-js(\/|$)/,
  angular: /^@angular\//,
}

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
    hooks: { 'build:done': () => writeFileSync('dist/package.json', '{\n  "type": "module"\n}\n') },
  },
  // Each framework's entry: the core stays out of it and is imported from the file beside it, the one the package's own export names
  // (./svifa.js, ./svifa.cjs), so a project holds one Svifa class whichever entry it uses and no lookup of the package by its name is
  // needed; the framework is the project's own. The React entry is a client component for frameworks with server components
  // (Next.js).
  ...Object.entries(FRAMEWORKS).map(([name, framework]): UserConfig => ({
    ...shared,
    entry: { [name]: `src/${name}.ts` },
    format: ['esm', 'cjs'],
    platform: 'neutral',
    dts,
    deps: { neverBundle: [framework, '@arcwrightstudio/svifa'] },
    outputOptions: (options, format) => ({
      ...options,
      paths: { '@arcwrightstudio/svifa': format === 'cjs' ? './svifa.cjs' : './svifa.js' },
    }),
    banner: name === 'react' ? { js: "'use client'" } : undefined,
  })),
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
