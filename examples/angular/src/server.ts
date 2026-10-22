// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Arcwright Studio

import { join } from 'node:path'
import { AngularNodeAppEngine, createNodeRequestHandler, isMainModule, writeResponseToNodeResponse } from '@angular/ssr/node'
import express from 'express'

const browserFiles = join(import.meta.dirname, '../browser')
const app = express()
const angularApp = new AngularNodeAppEngine()

// the built scripts and styles, as files
app.use(express.static(browserFiles, { maxAge: '1y', index: false, redirect: false }))

// every other request, rendered by Angular
app.use((request, response, next) => {
  angularApp
    .handle(request)
    .then((rendered) => (rendered ? writeResponseToNodeResponse(rendered, response) : next()))
    .catch(next)
})

// run directly (npm run serve), it listens on PORT, or 4000
if (isMainModule(import.meta.url)) {
  const port = process.env['PORT'] || 4000
  app.listen(port, (error) => {
    if (error) throw error
    console.log(`Listening on http://localhost:${port}`)
  })
}

// the handler the Angular CLI uses while developing and building
export const reqHandler = createNodeRequestHandler(app)
