// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Arcwright Studio

import { bootstrapApplication, type BootstrapContext } from '@angular/platform-browser'
import { App } from './app/app'
import { config } from './app/app.config.server'

// the app as the server renders it, for each request
const bootstrap = (context: BootstrapContext) => bootstrapApplication(App, config, context)

export default bootstrap
