<script setup lang="ts">
import type { ReadonlyJerseySet } from '../../../../entities/jersey-set'

const props = defineProps<{
  sets: readonly ReadonlyJerseySet[]
  identityLabels: ReadonlyMap<string, string>
  selectedSetId: string | null
  disabled: boolean
}>()

const emit = defineEmits<{
  select: [setId: string]
  edit: [setId: string]
  remove: [setId: string]
}>()

function labelFor(setId: string): string {
  return props.identityLabels.get(setId) ?? 'Unnamed set'
}
</script>

<template>
  <ul v-if="sets.length" class="jersey-set-list" aria-label="Jersey sets">
    <li
      v-for="set in sets"
      :key="set.id"
      class="jersey-set-row"
      :class="{ 'jersey-set-row--selected': selectedSetId === set.id }"
      :data-set-id="set.id"
    >
      <button
        :id="`select-jersey-set-${set.id}`"
        class="set-select"
        type="button"
        :aria-pressed="selectedSetId === set.id"
        :aria-label="`Select ${labelFor(set.id)} set`"
        :disabled="disabled"
        @click="emit('select', set.id)"
      >
        <strong>{{ labelFor(set.id) }}</strong>
        <span>{{ set.jerseys.length }} {{ set.jerseys.length === 1 ? 'jersey' : 'jerseys' }}</span>
      </button>
      <div class="set-actions">
        <button
          :id="`rename-jersey-set-${set.id}`"
          type="button"
          :aria-label="`Rename ${labelFor(set.id)} set`"
          :disabled="disabled"
          @click="emit('edit', set.id)"
        >Rename</button>
        <button
          :id="`remove-jersey-set-${set.id}`"
          type="button"
          :aria-label="`Remove ${labelFor(set.id)} set`"
          :disabled="disabled"
          @click="emit('remove', set.id)"
        >Remove</button>
      </div>
    </li>
  </ul>
  <p v-else class="empty-set-list">No jersey sets yet. Create one to start an inventory.</p>
</template>

<style scoped>
.jersey-set-list { display: grid; gap: 0.45rem; margin: 0; padding: 0; list-style: none; }
.jersey-set-row { min-width: 0; display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; gap: 0.45rem; padding: 0.4rem; border: 1px solid #e3e8e0; border-radius: 0.35rem; background: #fff; }
.jersey-set-row--selected { border-color: #91a979; background: #f1f5ed; }
.set-select { min-width: 0; min-height: 2.8rem; display: grid; gap: 0.2rem; justify-items: start; padding: 0.3rem 0.45rem; border: 0; background: transparent; color: #344b3a; text-align: left; }
.set-select strong { max-width: 100%; overflow-wrap: anywhere; font-size: 0.78rem; }
.set-select span { color: #728075; font-size: 0.66rem; }
.set-actions { display: flex; flex-wrap: wrap; gap: 0.3rem; }
.set-actions button { min-height: 2.75rem; padding: 0 0.6rem; border: 1px solid #dfe5dc; border-radius: 0.3rem; background: transparent; color: #405748; font-size: 0.68rem; }
.set-select:focus-visible, .set-actions button:focus-visible { outline: 3px solid #88a84e; outline-offset: 2px; }
.set-select:disabled, .set-actions button:disabled { cursor: not-allowed; opacity: 0.5; }
.empty-set-list { margin: 0; padding: 0.75rem 0.2rem; color: #718075; font-size: 0.74rem; line-height: 1.5; }
@media (max-width: 620px) {
  .jersey-set-row { grid-template-columns: minmax(0, 1fr); }
  .set-actions { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .set-actions button { width: 100%; }
}
</style>
