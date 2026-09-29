<script setup lang="ts">
export type AppIconName = 'plus' | 'play' | 'pause' | 'arrow-left' | 'football' | 'exchange'

defineProps<{ name: AppIconName }>()
</script>

<template>
  <svg
    class="app-icon"
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    width="18"
    height="18"
    fill="none"
    stroke="currentColor"
    stroke-width="2"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
    focusable="false"
  >
    <template v-if="name === 'plus'"><path d="M12 5v14M5 12h14" /></template>
    <template v-else-if="name === 'play'"><path d="m8 5 12 7-12 7z" fill="currentColor" stroke="none" /></template>
    <template v-else-if="name === 'pause'"><path d="M8 5v14M16 5v14" stroke-width="3" /></template>
    <template v-else-if="name === 'arrow-left'"><path d="M19 12H5m7 7-7-7 7-7" /></template>
    <template v-else-if="name === 'football'">
      <path d="M5.1 5.1c3.7-2.2 10.1-2.2 13.8 0 2.2 3.7 2.2 10.1 0 13.8-3.7 2.2-10.1 2.2-13.8 0-2.2-3.7-2.2-10.1 0-13.8Z" />
      <path d="m9 9 6 6m-5-8 3 3m-6 3 3 3m7-5-3 3" />
    </template>
    <template v-else>
      <path d="m7 7 3 3-3 3M17 17l-3-3 3-3" />
      <path d="M4 10h6m4 4h6" />
    </template>
  </svg>
</template>

<style scoped>
.app-icon { display: inline-block; flex: 0 0 18px; width: 18px; height: 18px; vertical-align: middle; }
</style>
