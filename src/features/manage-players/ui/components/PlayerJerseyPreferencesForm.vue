<script setup lang="ts">
import type { PlayerJerseyPreferenceDraft } from '../types'

const props = defineProps<{
  modelValue: readonly PlayerJerseyPreferenceDraft[]
  idPrefix: string
  disabled: boolean
  saving: boolean
  error: string | null
  errorSetId: string | null
}>()

const emit = defineEmits<{
  'update:modelValue': [draft: PlayerJerseyPreferenceDraft[]]
  submit: []
  cancel: []
}>()

function updateNumber(setId: string, value: string): void {
  emit('update:modelValue', props.modelValue.map((row) => row.setId === setId ? { ...row, value } : { ...row }))
}
</script>

<template>
  <form class="preferred-number-form" @submit.prevent="emit('submit')">
    <p class="preference-help">Set one optional preferred number per jersey set. Leave a field blank to clear it; preferences do not reserve a jersey.</p>
    <p v-if="!modelValue.length" class="no-preference-sets">
      Create a jersey set before adding preferred numbers. The player profile can still be edited without one.
    </p>
    <div v-for="row in modelValue" :key="row.setId" class="preference-field">
      <label :for="`${idPrefix}-${row.setId}`">Preferred number for {{ row.label }}</label>
      <input
        :id="`${idPrefix}-${row.setId}`"
        :value="row.value"
        :name="`preferredNumber-${row.setId}`"
        type="text"
        inputmode="numeric"
        pattern="[0-9]*"
        autocomplete="off"
        placeholder="Optional"
        :disabled="disabled"
        :aria-invalid="errorSetId === row.setId ? 'true' : undefined"
        :aria-describedby="errorSetId === row.setId ? `${idPrefix}-${row.setId}-error` : undefined"
        @input="updateNumber(row.setId, ($event.target as HTMLInputElement).value)"
      />
      <p v-if="error && errorSetId === row.setId" :id="`${idPrefix}-${row.setId}-error`" class="form-error" role="alert">{{ error }}</p>
    </div>
    <p v-if="error && errorSetId === null" class="form-error" role="alert">{{ error }}</p>
    <div class="preference-actions">
      <button v-if="modelValue.length" class="primary-button" type="submit" :disabled="disabled">
        {{ saving ? 'Saving preferred numbers…' : 'Save preferred numbers' }}
      </button>
      <button :id="`${idPrefix}-cancel`" class="cancel-button" type="button" :disabled="disabled" @click="emit('cancel')">Cancel</button>
    </div>
  </form>
</template>

<style scoped>
.preferred-number-form { min-width: 0; display: grid; gap: 0.7rem; padding: 0.9rem; border: 1px solid #dfe5dc; border-radius: 0.4rem; background: #fff; }
.preference-help, .no-preference-sets { margin: 0; color: #718075; font-size: 0.73rem; line-height: 1.5; }
.preference-field { min-width: 0; display: grid; gap: 0.4rem; }
.preference-field label { color: #49564d; font-size: 0.74rem; font-weight: 600; overflow-wrap: anywhere; }
.preference-field input { width: 100%; min-width: 0; min-height: 2.8rem; padding: 0 0.7rem; border: 1px solid #dfe5dc; border-radius: 0.35rem; background: #fbfcfa; color: var(--ink); }
.preference-field input[aria-invalid='true'] { border-color: #a5473d; }
.form-error { margin: 0; color: #8a3d34; font-size: 0.74rem; line-height: 1.45; }
.preference-actions { display: flex; flex-wrap: wrap; gap: 0.45rem; }
.primary-button, .cancel-button { min-height: 2.8rem; flex: 1 1 8rem; padding: 0.35rem 0.8rem; border-radius: 0.35rem; font-size: 0.72rem; font-weight: 600; }
.primary-button { border: 0; background: var(--green); color: #fff; }
.cancel-button { border: 1px solid #dfe5dc; background: transparent; color: #405748; }
.primary-button:disabled, .cancel-button:disabled { cursor: not-allowed; opacity: 0.5; }
.primary-button:focus-visible, .cancel-button:focus-visible, .preference-field input:focus-visible { outline: 3px solid #88a84e; outline-offset: 2px; }
</style>
