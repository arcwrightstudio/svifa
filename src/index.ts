// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Arcwright Studio

export { Svifa, Svifa as default, easeOut } from './svifa'
export type { ResolvedOptions } from './svifa'
export type {
  Axis,
  AxisState,
  Easing,
  Point,
  SvifaEvent,
  SvifaOptions,
  SvifaTarget,
  ScrollToOptions,
  TunableOptions,
} from './types'

/** This copy of Svifa's version. */
export const version: string = __VERSION__
