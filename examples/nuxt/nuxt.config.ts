// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Arcwright Studio

export default defineNuxtConfig({
  compatibilityDate: '2026-10-01',
  app: { head: { title: 'Svifa with Nuxt' } },
  css: ['@arcwrightstudio/svifa/svifa.css', '~/assets/style.css'],
  devtools: { enabled: false },
  // Nitro looks @vue/shared up with a trailing slash when it leaves it outside the server bundle, which Node reports as deprecated
  // (DEP0155); bundled in, it is never looked up that way
  nitro: { externals: { inline: ['@vue/shared'] } },
})
