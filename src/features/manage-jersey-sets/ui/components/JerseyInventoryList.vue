<script setup lang="ts">
import type { Jersey } from '../../../../entities/jersey-set'

const props = defineProps<{
  jerseys: readonly Readonly<Jersey>[]
  identityLabels: ReadonlyMap<string, string>
  ownerLabels: ReadonlyMap<string, string>
  editingJerseyId: string | null
  disabled: boolean
}>()

const emit = defineEmits<{
  edit: [jerseyId: string]
  remove: [jerseyId: string]
}>()

defineSlots<{
  editor(props: { jersey: Readonly<Jersey> }): any
}>()

function labelFor(jerseyId: string): string {
  return props.identityLabels.get(jerseyId) ?? 'Jersey item'
}

function ownerLabelFor(jersey: Readonly<Jersey>): string {
  return jersey.ownerPlayerId === null ? 'Team' : props.ownerLabels.get(jersey.ownerPlayerId) ?? 'Unavailable player'
}
</script>

<template>
  <ul v-if="jerseys.length" class="jersey-inventory-list" aria-label="Jerseys">
    <li v-for="jersey in jerseys" :key="jersey.id" class="jersey-row" :data-jersey-id="jersey.id">
      <div class="jersey-row-summary">
        <div class="jersey-row-copy">
          <strong>{{ labelFor(jersey.id) }}</strong>
          <span>Owned by {{ ownerLabelFor(jersey) }}</span>
        </div>
        <div class="jersey-row-actions">
          <button
            :id="`edit-jersey-${jersey.id}`"
            type="button"
            :aria-label="`Edit ${labelFor(jersey.id)}`"
            :disabled="disabled"
            @click="emit('edit', jersey.id)"
          >Edit</button>
          <button
            type="button"
            :aria-label="`Remove ${labelFor(jersey.id)}`"
            :disabled="disabled"
            @click="emit('remove', jersey.id)"
          >Remove</button>
        </div>
      </div>
      <slot v-if="editingJerseyId === jersey.id" name="editor" :jersey="jersey" />
    </li>
  </ul>
  <p v-else class="empty-jersey-list">This set is empty. Add jerseys as they are recorded.</p>
</template>

<style scoped>
.jersey-inventory-list { display: grid; gap: 0.55rem; margin: 0; padding: 0; list-style: none; }
.jersey-row { min-width: 0; display: grid; gap: 0.6rem; padding: 0.7rem; border: 1px solid #e3e8e0; border-radius: 0.4rem; background: #fff; }
.jersey-row-summary { min-width: 0; display: flex; align-items: center; justify-content: space-between; gap: 0.75rem; }
.jersey-row-copy { min-width: 0; display: grid; gap: 0.25rem; }
.jersey-row-copy strong { color: #364a3a; font-size: 0.78rem; overflow-wrap: anywhere; }
.jersey-row-copy span { color: #718075; font-size: 0.68rem; overflow-wrap: anywhere; }
.jersey-row-actions { display: flex; flex: 0 0 auto; flex-wrap: wrap; gap: 0.35rem; }
.jersey-row-actions button { min-height: 2.75rem; padding: 0 0.65rem; border: 1px solid #dfe5dc; border-radius: 0.3rem; background: transparent; color: #405748; font-size: 0.68rem; }
.jersey-row-actions button:focus-visible { outline: 3px solid #88a84e; outline-offset: 2px; }
.jersey-row-actions button:disabled { cursor: not-allowed; opacity: 0.5; }
.empty-jersey-list { margin: 0; padding: 0.85rem 0.2rem; color: #718075; font-size: 0.74rem; line-height: 1.5; }
@media (max-width: 520px) {
  .jersey-row-summary { align-items: stretch; flex-direction: column; }
  .jersey-row-actions { width: 100%; }
  .jersey-row-actions button { flex: 1 1 7rem; }
}
</style>
