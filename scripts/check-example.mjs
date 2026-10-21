// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Arcwright Studio

// The plain-page example and the README load Svifa from jsDelivr, pinned to a version and to the files' integrity hashes. This
// checks that they pin the version in package.json, and that each hash is the hash of the file that version serves: the published
// file once the version is on npm (between releases, while the source changes), this build's file while it is not (a release
// being prepared, so the tags work the moment it is published). Run after the build. usage: node scripts/check-example.mjs [--write]
// --write puts this version and those hashes into them.
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'

const root = fileURLToPath(new URL('..', import.meta.url))
const { name, version } = JSON.parse(readFileSync(`${root}package.json`, 'utf8'))
const write = process.argv.includes('--write')
const problems = []
let found = 0

// The files of a published version, from its tarball on the registry (the CDN serves exactly these), or null when that version is
// not published. A tarball is a gzipped tar of 512-byte blocks, each file a header then its content.
async function published() {
  const url = `https://registry.npmjs.org/${name}/-/${name.split('/').pop()}-${version}.tgz`
  const response = await fetch(url)
  if (response.status === 404) return null
  if (!response.ok) throw new Error(`the registry answered ${response.status} for ${url}`)
  const tar = gunzipSync(Buffer.from(await response.arrayBuffer()))
  const files = new Map()
  const text = (from, to) => tar.toString('utf8', from, to).replace(/\0.*$/s, '')
  for (let at = 0; at + 512 <= tar.length && tar[at] !== 0;) {
    const size = Number.parseInt(text(at + 124, at + 136).trim() || '0', 8)
    // a regular file ('0', or NUL in old archives); the extended headers some archives carry hold no file
    const type = tar[at + 156]
    if (type === 0x30 || type === 0) {
      const prefix = text(at + 345, at + 500)
      const path = (prefix ? `${prefix}/` : '') + text(at, at + 100)
      files.set(path.replace(/^package\//, ''), tar.subarray(at + 512, at + 512 + size))
    }
    at += 512 + Math.ceil(size / 512) * 512
  }
  return files
}

const files = await published()
const fileOf = (file) => {
  if (!files) return readFileSync(`${root}${file}`)
  const bytes = files.get(file)
  if (!bytes) throw new Error(`${name}@${version} as published has no ${file}`)
  return bytes
}

// each tag that loads a file of the package from the CDN, with the integrity it carries
const tag = /<(script|link)\b[^>]*?\b(?:src|href)="https:\/\/cdn\.jsdelivr\.net\/npm\/(@?[^@"]+)@([^/"]+)\/([^"]+)"[^>]*>/g
for (const place of ['examples/html/index.html', 'README.md']) {
  const path = `${root}${place}`
  const text = readFileSync(path, 'utf8').replace(tag, (whole, _kind, pkg, pinned, file) => {
    found++
    const where = `${place}, ${file}`
    if (pkg !== name) problems.push(`${where}: loads ${pkg}, not ${name}`)
    if (pinned !== version) problems.push(`${where}: pins ${pinned}, but package.json is at ${version}`)
    const hash = `sha384-${createHash('sha384').update(fileOf(file)).digest('base64')}`
    const carried = /\bintegrity="([^"]+)"/.exec(whole)?.[1]
    if (write) {
      const pinnedTag = whole.replace(`${pkg}@${pinned}/`, `${pkg}@${version}/`)
      return carried
        ? pinnedTag.replace(carried, hash)
        : pinnedTag.replace(/\s*\/?>$/, (end) => ` integrity="${hash}" crossorigin="anonymous"${end}`)
    }
    if (carried !== hash) problems.push(`${where}: integrity ${carried ?? 'missing'}, but the file's is ${hash}`)
    if (!/\bcrossorigin="anonymous"/.test(whole))
      problems.push(`${where}: needs crossorigin="anonymous" for its integrity to be checked`)
    return whole
  })
  if (write) writeFileSync(path, text)
}
if (found === 0) problems.push('the example and the README load nothing from the CDN')

const source = files ? `the files of ${version} as published` : `this build's files (${version} is not published yet)`
if (write) {
  console.log(`the example and the README now pin ${name}@${version} and the hashes of ${source}`)
} else if (problems.length) {
  console.error(problems.join('\n'))
  process.exit(1)
} else {
  console.log(`the example and the README pin ${name}@${version}, and their ${found} hashes are those of ${source}`)
}
