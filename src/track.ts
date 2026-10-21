// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Arcwright Studio

import type { Scroller } from './scroller'
import type { AxisState, Easing } from './types'

/** A glide either closes a share of the gap every moment (lerp) or covers it over a set time along a curve. */
export type Motion =
  | { kind: 'lerp'; to: number; rate: number }
  | { kind: 'timed'; from: number; to: number; duration: number; easing: Easing; elapsed: number }

/** Where an axis reports how it moves: Svifa itself for its main axis, the axis's own view for the other. */
export interface Report {
  velocity: number
  direction: -1 | 0 | 1
}

/** One axis of the scroller as Svifa glides it: where the content is drawn, where it is heading, and the glide under way. */
export class Track {
  value: number // where the content is drawn
  goal: number // where it is heading (wheel turns add up here)
  motion: Motion | null = null
  written: number | null = null // where the browser put the scroller on Svifa's last move
  origin = 0 // where the scroller was when the glide under way began from rest
  moved = false // whether that glide has moved the scroller yet
  lastNative = 0 // when the last scroll Svifa did not make was seen
  still: ReturnType<typeof setTimeout> | undefined

  constructor(
    readonly area: Scroller,
    readonly report: Report
  ) {
    this.value = this.goal = area.position
  }

  /** Where the content is now: the glide's exact position while it moves, and otherwise where the browser has the scroller. */
  get scroll(): number {
    return this.motion ? this.value : this.area.position
  }

  /** Where it is heading: the end of the glide under way, or where it is when nothing glides. */
  get target(): number {
    return this.motion ? this.goal : this.scroll
  }
}

/** An axis as anyone may read it (`svifa.x`, `svifa.y`). */
export class AxisView implements AxisState {
  constructor(private readonly track: Track) {}

  get scroll(): number {
    return this.track.scroll
  }

  get target(): number {
    return this.track.target
  }

  get limit(): number {
    return this.track.area.measure()
  }

  get progress(): number {
    const limit = this.track.area.measure()
    return limit > 0 ? this.track.scroll / limit : 1
  }

  get velocity(): number {
    return this.track.report.velocity
  }

  get direction(): -1 | 0 | 1 {
    return this.track.report.direction
  }
}
