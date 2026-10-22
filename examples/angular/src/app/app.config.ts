// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Arcwright Studio

import { provideZonelessChangeDetection, type ApplicationConfig } from '@angular/core'
import { provideSmoothScroll } from '@arcwrightstudio/svifa/angular'

export const appConfig: ApplicationConfig = {
  providers: [
    provideZonelessChangeDetection(),
    // the page glides, and so do same-page links, stopping below the sticky header
    provideSmoothScroll({ subpixel: 'main > section', anchors: { offset: -56 } }),
  ],
}
