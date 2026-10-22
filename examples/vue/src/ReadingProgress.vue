<!-- SPDX-License-Identifier: MIT -->
<!-- Copyright (c) 2026 Arcwright Studio -->

<script setup lang="ts">
import { ref } from 'vue'
import { useSvifa } from '@arcwrightstudio/svifa/vue'

const progress = ref(0)
useSvifa((svifa) => (progress.value = svifa.progress))
</script>

<template>
  <progress :value="progress" max="1" />
</template>
