<script setup lang="ts">
import type { SubstitutionLineupChoice } from '../../model/recordSubstitution'

defineProps<{
  formId: string
  occurrenceLabel: string
  onPitch: SubstitutionLineupChoice[]
  bench: SubstitutionLineupChoice[]
  outgoingPlayerId: string
  incomingPlayerId: string
  disabled: boolean
  saving: boolean
  error: string | null
}>()
const emit = defineEmits<{
  updateOutgoing: [playerId: string]
  updateIncoming: [playerId: string]
  save: []
}>()
</script>

<template>
  <form :id="formId" class="substitution-form" @submit.prevent="emit('save')">
    <p class="captured-time" role="status" aria-live="polite">
      Captured occurrence time: <strong>{{ occurrenceLabel }}</strong>. Player selection will not change this time.
    </p>
    <div class="exchange-fields">
      <fieldset class="player-choice-group">
        <legend>Player off · on the pitch</legend>
        <label
          v-for="player in onPitch"
          :key="player.id"
          class="player-choice"
          :class="{ 'player-choice--selected': outgoingPlayerId === player.id }"
        >
          <input
            type="radio"
            name="outgoingPlayer"
            :value="player.id"
            :checked="outgoingPlayerId === player.id"
            :disabled="disabled"
            @change="emit('updateOutgoing', player.id)"
          />
          <span>{{ player.label }}</span>
        </label>
        <p v-if="!onPitch.length" class="choice-empty">No eligible player is on the pitch.</p>
      </fieldset>

      <fieldset class="player-choice-group">
        <legend>Player on · on the bench</legend>
        <label
          v-for="player in bench"
          :key="player.id"
          class="player-choice"
          :class="{ 'player-choice--selected': incomingPlayerId === player.id }"
        >
          <input
            type="radio"
            name="incomingPlayer"
            :value="player.id"
            :checked="incomingPlayerId === player.id"
            :disabled="disabled"
            @change="emit('updateIncoming', player.id)"
          />
          <span>{{ player.label }}</span>
        </label>
        <p v-if="!bench.length" class="choice-empty" role="status">
          This match has no eligible player on the bench to come on.
        </p>
      </fieldset>
    </div>
    <p v-if="error" class="substitution-error" role="alert" aria-live="assertive">{{ error }}</p>
    <p v-if="saving" class="substitution-saving" role="status" aria-live="polite">Saving substitution…</p>
  </form>
</template>

<style scoped>
.substitution-form { display: grid; gap: 20px; }
.captured-time { margin: 0; padding: 12px 14px; border-left: 3px solid #204d38; background: #f2f4ef; color: #526156; font-size: 1rem; line-height: 1.45; }
.captured-time strong { color: #17251d; font-variant-numeric: tabular-nums; }
.exchange-fields { display: grid; gap: 20px; }
.player-choice-group { display: grid; gap: 8px; min-width: 0; margin: 0; padding: 0; border: 0; }
.player-choice-group legend { margin-bottom: 4px; color: #17251d; font-size: 1rem; font-weight: 700; }
.player-choice { display: flex; align-items: center; gap: 12px; min-height: 52px; padding: 8px 12px; border: 1px solid #cbd5cb; border-radius: 10px; background: #fff; color: #17251d; font-size: 1rem; line-height: 1.35; }
.player-choice--selected { border-color: #204d38; background: #edf3e8; }
.player-choice input { width: 20px; height: 20px; flex: 0 0 auto; margin: 0; accent-color: #204d38; }
.player-choice span { overflow-wrap: anywhere; }
.choice-empty { margin: 0; padding: 12px; border: 1px dashed #aeb9ad; border-radius: 10px; color: #526156; font-size: 1rem; line-height: 1.45; }
.substitution-error { margin: 0; padding: 12px; border-radius: 8px; background: #f8e9e6; color: #8a3028; font-size: 1rem; }
.substitution-saving { margin: 0; color: #526156; font-size: 1rem; }

@media (min-width: 700px) { .exchange-fields { grid-template-columns: 1fr 1fr; align-items: start; } }
</style>
