// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Arcwright Studio

import Svifa from '@arcwrightstudio/svifa'
import '@arcwrightstudio/svifa/svifa.css'
import './style.css'

// The page glides, and so do same-page links, stopping below the sticky header.
const svifa = new Svifa({ anchors: { offset: -56 } })

const bar = document.querySelector('progress')!
svifa.on('scroll', ({ progress }) => {
  bar.value = progress
})
