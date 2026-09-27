<script setup lang="ts">
import { ref } from 'vue'
import type { MatchPeriod, SubstitutionEvent } from '../../../../entities/match'
import type { SubstitutionCorrection } from '../../../../entities/match'
import { formatElapsedTimeInput, parseElapsedTimeInput, type CorrectionPlayerChoice } from '../../model/editSubstitution'

const props = defineProps<{
  formId: string
  event: Readonly<SubstitutionEvent>
  choices: CorrectionPlayerChoice[]
  disabled: boolean
  saving: boolean
  error: string | null
}>()
const emit = defineEmits<{
  save: [correction: SubstitutionCorrection]
}>()

const outgoingPlayerId = ref(props.event.outgoingPlayerId)
const incomingPlayerId = ref(props.event.incomingPlayerId)
const period = ref<MatchPeriod>(props.event.period)
const elapsedTime = ref(formatElapsedTimeInput(props.event.elapsedMs))
const timeEdited = ref(false)
const localError = ref<string | null>(null)

function setPeriod(value: string): void {
  period.value = value === '2' ? 2 : 1
  localError.value = null
}

function setElapsedTime(value: string): void {
  elapsedTime.value = value
  timeEdited.value = true
  localError.value = null
}

function setHalfTimeBoundary(): void {
  period.value = 2
  elapsedTime.value = '00:00'
  timeEdited.value = true
  localError.value = null
}

function save(): void {
  const elapsedMs = timeEdited.value ? parseElapsedTimeInput(elapsedTime.value) : props.event.elapsedMs
  if (elapsedMs === null) {
    localError.value = 'Enter elapsed time as minutes:seconds, for example 47:00.'
    return
  }
  emit('save', {
    outgoingPlayerId: outgoingPlayerId.value,
    incomingPlayerId: incomingPlayerId.value,
    period: period.value,
    elapsedMs,
  })
}
</script>

<template>
  <form :id="formId" class="correction-form" @submit.prevent="save">
    <div class="correction-fields">
      <label class="correction-field">
        <span>Half</span>
        <select name="correction-period" :value="period" :disabled="disabled" @change="setPeriod(($event.target as HTMLSelectElement).value)">
          <option value="1">First half</option>
          <option value="2">Second half</option>
        </select>
      </label>
      <label class="correction-field correction-time-field">
        <span>Elapsed time (mm:ss)</span>
        <input
          name="correction-time"
          :value="elapsedTime"
          type="text"
          inputmode="numeric"
          autocomplete="off"
          maxlength="9"
          placeholder="mm:ss"
          :disabled="disabled"
          @input="setElapsedTime(($event.target as HTMLInputElement).value)"
        />
      </label>
      <button class="half-time-button" type="button" :disabled="disabled" @click="setHalfTimeBoundary">
        Set half-time · second half 00:00
      </button>
    </div>

    <div class="correction-fields player-correction-fields">
      <label class="correction-field">
        <span>OFF · player coming off</span>
        <select name="correction-outgoing" v-model="outgoingPlayerId" :disabled="disabled">
          <option v-for="player in choices" :key="player.id" :value="player.id">{{ player.label }}</option>
        </select>
      </label>
      <label class="correction-field">
        <span>ON · player coming on</span>
        <select name="correction-incoming" v-model="incomingPlayerId" :disabled="disabled">
          <option v-for="player in choices" :key="player.id" :value="player.id">{{ player.label }}</option>
        </select>
      </label>
    </div>

    <p class="time-edit-help">Changing only the players preserves the original millisecond time. Editing the time records whole seconds.</p>
    <p v-if="localError || error" class="correction-error" role="alert" aria-live="assertive">{{ localError ?? error }}</p>
    <p v-if="saving" class="correction-saving" role="status" aria-live="polite">Saving correction…</p>
  </form>
</template>

<style scoped>
.correction-form { display: grid; gap: 20px; }
.correction-fields { display: grid; grid-template-columns: minmax(8rem, 1fr) minmax(8rem, 1fr) auto; align-items: end; gap: 12px; }
.player-correction-fields { grid-template-columns: 1fr 1fr; }
.correction-field { display: grid; gap: 8px; color: #526156; font-size: 1rem; font-weight: 700; }
.correction-field select, .correction-field input { width: 100%; min-width: 0; min-height: 48px; padding: 8px 12px; border: 1px solid #cbd5cb; border-radius: 8px; background: #fff; color: #17251d; font: inherit; font-size: 1rem; font-weight: 400; }
.half-time-button { min-height: 48px; padding: 8px 12px; border: 1px solid #cbd5cb; border-radius: 8px; background: #fff; color: #204d38; font: inherit; font-size: 0.9rem; font-weight: 700; }
.time-edit-help { margin: 0; color: #526156; font-size: 0.9rem; line-height: 1.45; }
.correction-error { margin: 0; padding: 12px; border-radius: 8px; background: #f8e9e6; color: #8a3028; font-size: 1rem; line-height: 1.45; }
.correction-saving { margin: 0; color: #526156; font-size: 1rem; }
.half-time-button:disabled { cursor: not-allowed; opacity: 0.5; }

@media (max-width: 620px) {
  .correction-fields, .player-correction-fields { grid-template-columns: 1fr; }
  .half-time-button { width: 100%; }
}
</style>
