<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Arcwright Studio -->

<script>
  import { smoothScroll } from '@arcwrightstudio/svifa/svelte'
  import '@arcwrightstudio/svifa/svifa.css'
  import '../style.css'

  let { children } = $props()

  // the page glides, and so do same-page links, stopping below the sticky header
  smoothScroll({ anchors: { offset: -56 } })
</script>

{@render children()}
