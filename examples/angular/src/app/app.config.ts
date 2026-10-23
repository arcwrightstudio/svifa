// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Arcwright Studio

import { provideZonelessChangeDetection, type ApplicationConfig } from '@angular/core'
import { provideClientHydration } from '@angular/platform-browser'
import { provideSmoothScroll } from '@arcwrightstudio/svifa/angular'

export const appConfig: ApplicationConfig = {
  providers: [
    provideZonelessChangeDetection(),
    // the browser takes over the page the server rendered, rather than drawing it again
    provideClientHydration(),
    // the page glides, and so do same-page links, stopping below the sticky header
    provideSmoothScroll({ anchors: { offset: -56 } }),
  ],
}
