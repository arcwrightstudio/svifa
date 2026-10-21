// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Arcwright Studio

// Writes dist/sbom.cdx.json, the package's software bill of materials (CycloneDX), from npm's own `npm sbom`. What would make two
// builds of the same source differ is left out: the time, a random serial number, npm's version, and the name of the folder the
// build runs in, which npm takes for the package's name.
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'

const pkg = JSON.parse(readFileSync('package.json', 'utf8'))
const npm = process.env.npm_execpath
if (!npm) throw new Error('Run this as npm run sbom (or as part of npm run build).')
const bom = JSON.parse(
  execFileSync(process.execPath, [npm, 'sbom', '--sbom-format', 'cyclonedx', '--sbom-type', 'library', '--omit', 'dev'], {
    encoding: 'utf8',
  })
)
delete bom.serialNumber
delete bom.metadata.timestamp
bom.metadata.tools = bom.metadata.tools.map(({ vendor, name }) => ({ vendor, name }))
const [group, name] = pkg.name.split('/')
Object.assign(bom.metadata.component, { group, name })
writeFileSync('dist/sbom.cdx.json', `${JSON.stringify(bom, null, 2)}\n`)
