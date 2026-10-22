// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Arcwright Studio

import { mergeApplicationConfig, type ApplicationConfig } from '@angular/core'
import { provideServerRendering, withRoutes } from '@angular/ssr'
import { appConfig } from './app.config'
import { serverRoutes } from './app.routes.server'

// the browser's providers, Svifa's among them, with server rendering added
export const config: ApplicationConfig = mergeApplicationConfig(appConfig, {
  providers: [provideServerRendering(withRoutes(serverRoutes))],
})
