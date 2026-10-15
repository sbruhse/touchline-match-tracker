<script setup lang="ts">
import { computed } from 'vue'
import type { GoalPlayerDraft, GoalPlayerOption } from '../../model/goalPlayerDraft'

const props = defineProps<{
  role: 'scorer' | 'assist'
  value: GoalPlayerDraft
  players: readonly GoalPlayerOption[]
  hasSquadChoices: boolean
  disabled: boolean
  error: string | null
}>()

const emit = defineEmits<{
  update: [value: GoalPlayerDraft]
}>()

const roleLabel = computed(() => props.role === 'scorer' ? 'Scorer' : 'Assist')
const selectId = computed(() => `goal-${props.role}-player`)
const inputId = computed(() => `goal-${props.role}-name`)
const errorId = computed(() => `goal-${props.role}-error`)
const manualOptionValue = '__manual_name__'
const selectValue = computed(() => {
  if (props.value.mode === 'squad') return props.value.playerId
  if (props.value.mode === 'manual') return manualOptionValue
  return ''
})
const selectedLabel = computed(() => props.value.mode === 'squad' ? props.value.label : '')
const hasStaleSelection = computed(() => {
  const selectedPlayerId = props.value.mode === 'squad' ? props.value.playerId : null
  return selectedPlayerId !== null
    && !props.players.some(({ playerId }) => playerId === selectedPlayerId)
})

function changeSelection(event: Event): void {
  const value = (event.target as HTMLSelectElement).value
  if (!value) {
    emit('update', { mode: 'none' })
    return
  }
  if (value === manualOptionValue) {
    const name = props.value.mode === 'none' ? '' : props.value.name
    emit('update', { mode: 'manual', name })
    return
  }
  const selected = props.players.find((player) => player.playerId === value)
  if (!selected) return
  emit('update', { mode: 'squad', ...selected })
}

function updateManualName(event: Event): void {
  emit('update', { mode: 'manual', name: (event.target as HTMLInputElement).value })
}
</script>

<template>
  <div class="goal-player-field">
    <label class="field-label" :for="hasSquadChoices ? selectId : inputId">
      {{ roleLabel }} <small>Optional</small>
    </label>
    <select
      v-if="hasSquadChoices"
      :id="selectId"
      :name="role"
      :value="selectValue"
      :disabled="disabled"
      :aria-invalid="error ? 'true' : undefined"
      :aria-describedby="error ? errorId : undefined"
      @change="changeSelection"
    >
      <option value="">No {{ roleLabel.toLocaleLowerCase() }} selected</option>
      <option v-if="hasStaleSelection" :value="value.mode === 'squad' ? value.playerId : ''" disabled>
        Previously selected · {{ value.mode === 'squad' ? value.label : '' }} (not in the saved squad)
      </option>
      <option v-for="player in players" :key="player.playerId" :value="player.playerId">
        {{ player.label }}
      </option>
      <option :value="manualOptionValue">Enter a name manually</option>
    </select>
    <input
      v-if="!hasSquadChoices || value.mode === 'manual'"
      :id="inputId"
      :name="role"
      type="text"
      autocomplete="off"
      :aria-label="`${roleLabel} name`"
      :value="value.mode === 'squad' || value.mode === 'none' ? '' : value.name"
      :disabled="disabled"
      :aria-invalid="error ? 'true' : undefined"
      :aria-describedby="error ? errorId : undefined"
      placeholder="Add name"
      @input="updateManualName"
    />
    <p v-if="selectedLabel" class="selected-player-label">{{ selectedLabel }}</p>
    <p v-if="error" :id="errorId" class="field-error" role="alert">{{ error }}</p>
  </div>
</template>

<style scoped>
.goal-player-field { display: grid; min-width: 0; gap: 0.45rem; }
.field-label { color: #526156; font-size: 1rem; font-weight: 700; }
.field-label small { margin-left: 0.25rem; color: #68756b; font-size: 0.875rem; font-weight: 400; }
.goal-player-field select, .goal-player-field input { width: 100%; min-width: 0; min-height: 48px; padding: 0.55rem 0.7rem; border: 1px solid #cbd5cb; border-radius: 0.5rem; background: #fff; color: #17251d; font: inherit; font-size: 1rem; }
.goal-player-field select:focus-visible, .goal-player-field input:focus-visible { outline: 3px solid #5f8d2e; outline-offset: 2px; }
.selected-player-label, .field-error { margin: 0; font-size: 0.9rem; line-height: 1.45; overflow-wrap: anywhere; }
.selected-player-label { color: #33483a; }
.field-error { color: #8a3028; }
</style>
