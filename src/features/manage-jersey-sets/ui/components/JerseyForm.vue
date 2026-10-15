<script setup lang="ts">
import type { JerseyDraft, PlayerOwnerChoice, UnresolvedOwnerChoice } from '../types'

const props = defineProps<{
  modelValue: JerseyDraft
  idPrefix: string
  mode: 'create' | 'edit'
  disabled: boolean
  ownerChoices: readonly PlayerOwnerChoice[]
  unresolvedOwner: UnresolvedOwnerChoice | null
  error: string | null
  errorField: 'number' | 'size' | 'owner' | null
}>()

const emit = defineEmits<{
  'update:modelValue': [draft: JerseyDraft]
  submit: []
  cancel: []
}>()

function update(patch: Partial<JerseyDraft>): void {
  emit('update:modelValue', { ...props.modelValue, ...patch })
}
</script>

<template>
  <form class="jersey-form" @submit.prevent="emit('submit')">
    <div class="form-field">
      <label :for="`${idPrefix}-number`">Back number</label>
      <input
        :id="`${idPrefix}-number`"
        :value="modelValue.number"
        name="jerseyNumber"
        type="text"
        inputmode="numeric"
        pattern="[0-9]*"
        autocomplete="off"
        placeholder="e.g. 7"
        required
        :disabled="disabled"
        :aria-invalid="errorField === 'number' ? 'true' : undefined"
        :aria-describedby="errorField === 'number' ? `${idPrefix}-number-error` : undefined"
        @input="update({ number: ($event.target as HTMLInputElement).value })"
      />
      <p v-if="errorField === 'number' && error" :id="`${idPrefix}-number-error`" class="form-error" role="alert">{{ error }}</p>
    </div>
    <div class="form-field">
      <label :for="`${idPrefix}-size`">Actual jersey size</label>
      <input
        :id="`${idPrefix}-size`"
        :value="modelValue.size"
        name="jerseySize"
        type="text"
        autocomplete="off"
        placeholder="e.g. 164, M, or S/M"
        required
        :disabled="disabled"
        :aria-invalid="errorField === 'size' ? 'true' : undefined"
        :aria-describedby="errorField === 'size' ? `${idPrefix}-size-error` : undefined"
        @input="update({ size: ($event.target as HTMLInputElement).value })"
      />
      <p v-if="errorField === 'size' && error" :id="`${idPrefix}-size-error`" class="form-error" role="alert">{{ error }}</p>
    </div>
    <div class="form-field">
      <label :for="`${idPrefix}-owner`">Owner</label>
      <select
        :id="`${idPrefix}-owner`"
        :value="modelValue.ownerPlayerId"
        name="jerseyOwner"
        :disabled="disabled"
        :aria-invalid="errorField === 'owner' ? 'true' : undefined"
        :aria-describedby="errorField === 'owner' ? `${idPrefix}-owner-error` : undefined"
        @change="update({ ownerPlayerId: ($event.target as HTMLSelectElement).value })"
      >
        <option value="">Team</option>
        <option v-if="unresolvedOwner" :value="unresolvedOwner.id">{{ unresolvedOwner.label }}</option>
        <option v-for="owner in ownerChoices" :key="owner.id" :value="owner.id">{{ owner.label }}</option>
      </select>
      <p v-if="errorField === 'owner' && error" :id="`${idPrefix}-owner-error`" class="form-error" role="alert">{{ error }}</p>
    </div>
    <div class="form-actions">
      <button class="primary-button" type="submit" :disabled="disabled">
        {{ mode === 'create' ? 'Add jersey' : 'Save jersey' }}
      </button>
      <button class="cancel-button" type="button" :disabled="disabled" @click="emit('cancel')">Cancel</button>
    </div>
  </form>
</template>

<style scoped>
.jersey-form { min-width: 0; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0.7rem; padding: 0.9rem; border: 1px solid #dfe5dc; border-radius: 0.4rem; background: #fff; }
.form-field { min-width: 0; display: grid; align-content: start; gap: 0.4rem; }
.form-field label { color: #49564d; font-size: 0.73rem; font-weight: 600; }
.form-field input, .form-field select { width: 100%; min-width: 0; min-height: 2.8rem; padding: 0 0.65rem; border: 1px solid #dfe5dc; border-radius: 0.35rem; background: #fbfcfa; color: var(--ink); font-size: 0.8rem; }
.form-field [aria-invalid='true'] { border-color: #a5473d; }
.form-error { grid-column: 1 / -1; margin: 0; color: #8a3d34; font-size: 0.72rem; line-height: 1.45; }
.form-actions { grid-column: 1 / -1; display: flex; flex-wrap: wrap; gap: 0.45rem; }
.primary-button, .cancel-button { min-height: 2.8rem; padding: 0.35rem 0.8rem; border: 0; border-radius: 0.35rem; font-size: 0.73rem; font-weight: 600; }
.primary-button { background: var(--green); color: #fff; }
.cancel-button { border: 1px solid #dfe5dc; background: transparent; color: #405748; }
.primary-button:disabled, .cancel-button:disabled { cursor: not-allowed; opacity: 0.5; }
.primary-button:focus-visible, .cancel-button:focus-visible, .form-field input:focus-visible, .form-field select:focus-visible { outline: 3px solid #88a84e; outline-offset: 2px; }
.form-actions > button { flex: 1 1 auto; }
@media (max-width: 520px) { .jersey-form { grid-template-columns: minmax(0, 1fr); } .form-actions { grid-column: 1; } }
</style>
