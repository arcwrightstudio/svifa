// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Arcwright Studio

export default defineNuxtConfig({
  compatibilityDate: '2026-10-01',
  app: { head: { title: 'Svifa with Nuxt' } },
  css: ['@arcwrightstudio/svifa/svifa.css', '~/assets/style.css'],
  devtools: { enabled: false },
})
