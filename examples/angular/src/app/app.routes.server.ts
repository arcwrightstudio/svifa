// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Arcwright Studio

import { RenderMode, type ServerRoute } from '@angular/ssr'

// every page is rendered on the server when it is asked for
export const serverRoutes: ServerRoute[] = [{ path: '**', renderMode: RenderMode.Server }]
