// The plain-page example and the README load Svifa from jsDelivr, pinned to a version and to the files' integrity hashes. This
// checks that they pin the version in package.json and that each hash is the hash of the file this build makes, so they work the
// moment that version is published. Run after the build. usage: node scripts/check-example.mjs [--write]
// --write puts this version and this build's hashes into them.
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const { name, version } = JSON.parse(readFileSync(`${root}package.json`, 'utf8'))
const write = process.argv.includes('--write')
const problems = []
let found = 0

// each tag that loads a file of the package from the CDN, with the integrity it carries
const tag = /<(script|link)\b[^>]*?\b(?:src|href)="https:\/\/cdn\.jsdelivr\.net\/npm\/(@?[^@"]+)@([^/"]+)\/([^"]+)"[^>]*>/g
for (const place of ['examples/html/index.html', 'README.md']) {
  const path = `${root}${place}`
  const text = readFileSync(path, 'utf8').replace(tag, (whole, _kind, pkg, pinned, file) => {
    found++
    const where = `${place}, ${file}`
    if (pkg !== name) problems.push(`${where}: loads ${pkg}, not ${name}`)
    if (pinned !== version) problems.push(`${where}: pins ${pinned}, but package.json is at ${version}`)
    const hash = `sha384-${createHash('sha384')
      .update(readFileSync(`${root}${file}`))
      .digest('base64')}`
    const carried = /\bintegrity="([^"]+)"/.exec(whole)?.[1]
    if (write) {
      const pinnedTag = whole.replace(`${pkg}@${pinned}/`, `${pkg}@${version}/`)
      return carried
        ? pinnedTag.replace(carried, hash)
        : pinnedTag.replace(/\s*\/?>$/, (end) => ` integrity="${hash}" crossorigin="anonymous"${end}`)
    }
    if (carried !== hash) problems.push(`${where}: integrity ${carried ?? 'missing'}, but this build's is ${hash}`)
    if (!/\bcrossorigin="anonymous"/.test(whole))
      problems.push(`${where}: needs crossorigin="anonymous" for its integrity to be checked`)
    return whole
  })
  if (write) writeFileSync(path, text)
}
if (found === 0) problems.push('the example and the README load nothing from the CDN')

if (write) {
  console.log(`the example and the README now pin ${name}@${version} and this build's hashes`)
} else if (problems.length) {
  console.error(problems.join('\n'))
  process.exit(1)
} else {
  console.log(`the example and the README pin ${name}@${version}, and their ${found} hashes are this build's`)
}
