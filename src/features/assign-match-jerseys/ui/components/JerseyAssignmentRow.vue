<script setup lang="ts">
import type { JerseyAssignmentOptionView, JerseyAssignmentRowView } from '../types'

const props = defineProps<{
  row: JerseyAssignmentRowView
  playerLabel: string
  jerseyOptions: readonly JerseyAssignmentOptionView[]
  disabled: boolean
}>()

const emit = defineEmits<{
  selectJersey: [payload: { playerId: string; jerseyId: string | null }]
}>()

const fieldId = `jersey-for-${props.row.playerId}`
const errorId = `${fieldId}-error`

function changeSelection(event: Event): void {
  const value = (event.target as HTMLSelectElement).value
  emit('selectJersey', { playerId: props.row.playerId, jerseyId: value || null })
}

function staleSelectionLabel(): string {
  const snapshot = props.row.jerseySnapshot
  if (!snapshot) return 'Previously selected jersey is no longer available'
  return `Previously selected: number ${snapshot.number}, size ${snapshot.size} (no longer in this set)`
}
</script>

<template>
  <fieldset class="assignment-row">
    <legend :id="`${fieldId}-player`" class="assignment-player">
      <span v-if="row.jerseySnapshot" class="assigned-number">#{{ row.jerseySnapshot.number }}</span>
      <span v-else class="unassigned-state">Unassigned</span>
      <span class="assignment-player-name">{{ playerLabel }}</span>
    </legend>
    <p class="player-size">Player size: {{ row.playerSize || 'Not recorded' }}</p>
    <label class="jersey-label" :for="fieldId">Jersey for {{ playerLabel }}</label>
    <select
      :id="fieldId"
      :value="row.jerseyId ?? ''"
      :disabled="disabled"
      :aria-invalid="row.error ? 'true' : undefined"
      :aria-describedby="row.error ? errorId : undefined"
      @change="changeSelection"
    >
      <option value="">No jersey selected</option>
      <option
        v-if="row.jerseyId && !jerseyOptions.some(({ id }) => id === row.jerseyId)"
        :value="row.jerseyId"
        disabled
      >{{ staleSelectionLabel() }}</option>
      <option v-for="jersey in jerseyOptions" :key="jersey.id" :value="jersey.id">
        {{ jersey.label }} — Owned by {{ jersey.ownerLabel }}
      </option>
    </select>
    <p v-if="row.error" :id="errorId" class="assignment-error" role="alert">{{ row.error }}</p>
  </fieldset>
</template>

<style scoped>
.assignment-row { display: grid; min-width: 0; gap: 0.35rem; margin: 0; padding: 0.8rem; border: 1px solid #dfe5dc; border-radius: 0.45rem; background: #fff; }
.assignment-player { display: flex; flex-wrap: wrap; align-items: baseline; gap: 0.35rem 0.55rem; max-width: 100%; padding: 0; color: #20382a; font-family: 'Space Grotesk', sans-serif; font-size: 1rem; font-weight: 600; line-height: 1.35; overflow-wrap: anywhere; }
.assigned-number { flex: 0 0 auto; color: #204d38; font-family: 'DM Mono', monospace; font-size: 1.15em; font-weight: 750; font-variant-numeric: tabular-nums; }
.unassigned-state { flex: 0 0 auto; color: #78271f; font-family: 'DM Mono', monospace; font-size: 0.72em; font-weight: 700; text-transform: uppercase; }
.assignment-player-name { min-width: 0; overflow-wrap: anywhere; }
.player-size { margin: 0 0 0.15rem; color: #526156; font-size: 0.9rem; line-height: 1.4; }
.jersey-label { color: #33483a; font-size: 0.92rem; font-weight: 600; }
.assignment-row select { width: 100%; min-width: 0; min-height: 3rem; padding: 0.45rem 0.7rem; border: 1px solid #cbd7ca; border-radius: 0.4rem; background: #fff; color: #17251d; font: inherit; font-size: 0.95rem; }
.assignment-row select:focus-visible { outline: 3px solid #91b83c; outline-offset: 2px; }
.assignment-error { margin: 0; color: #78271f; font-size: 0.9rem; line-height: 1.45; overflow-wrap: anywhere; }
</style>
