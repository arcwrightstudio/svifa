// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Arcwright Studio

'use client'

import { useState } from 'react'
import { useSvifa } from '@arcwrightstudio/svifa/react'

export function ReadingProgress() {
  const [progress, setProgress] = useState(0)
  useSvifa((svifa) => setProgress(svifa.progress))
  return <progress value={progress} max={1} />
}
