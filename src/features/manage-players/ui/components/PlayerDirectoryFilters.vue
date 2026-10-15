<script setup lang="ts">
const props = defineProps<{
  modelValue: boolean
  disabled: boolean
}>()

const emit = defineEmits<{
  'update:modelValue': [showArchived: boolean]
}>()
</script>

<template>
  <div class="player-filter" role="group" aria-label="Filter players">
    <button type="button" :disabled="disabled" :aria-pressed="!props.modelValue" @click="emit('update:modelValue', false)">
      Active
    </button>
    <button type="button" :disabled="disabled" :aria-pressed="props.modelValue" @click="emit('update:modelValue', true)">
      Archived
    </button>
  </div>
</template>

<style scoped>
.player-filter { display: flex; flex-wrap: wrap; gap: 0.45rem; margin: 1.25rem 0 0.85rem; }
.player-filter button { min-height: 2.75rem; padding: 0 0.85rem; border: 1px solid #dfe5dc; border-radius: 999px; background: transparent; color: #627066; font-size: 0.72rem; }
.player-filter button[aria-pressed='true'] { border-color: var(--green); background: var(--green); color: #fff; }
.player-filter button:focus-visible { outline: 3px solid #d4a744; outline-offset: 2px; }
</style>
