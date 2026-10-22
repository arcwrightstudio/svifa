<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Arcwright Studio -->

<script>
  import { useSvifa } from '@arcwrightstudio/svifa/svelte'

  let progress = $state(0)
  useSvifa((svifa) => (progress = svifa.progress))
</script>

<progress value={progress} max="1"></progress>
