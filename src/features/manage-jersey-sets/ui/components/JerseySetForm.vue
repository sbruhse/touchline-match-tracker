<script setup lang="ts">
const props = defineProps<{
  modelValue: string
  idPrefix: string
  mode: 'create' | 'edit'
  disabled: boolean
  error: string | null
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string]
  submit: []
  cancel: []
}>()
</script>

<template>
  <form class="jersey-set-form" @submit.prevent="emit('submit')">
    <label :for="`${idPrefix}-name`">Set name</label>
    <input
      :id="`${idPrefix}-name`"
      :value="modelValue"
      name="jerseySetName"
      autocomplete="off"
      maxlength="60"
      placeholder="e.g. Home kit"
      required
      :disabled="disabled"
      :aria-invalid="error ? 'true' : undefined"
      :aria-describedby="error ? `${idPrefix}-error` : undefined"
      @input="emit('update:modelValue', ($event.target as HTMLInputElement).value)"
    />
    <p v-if="error" :id="`${idPrefix}-error`" class="form-error" role="alert">{{ error }}</p>
    <div class="form-actions">
      <button class="primary-button" type="submit" :disabled="disabled">
        {{ mode === 'create' ? 'Create set' : 'Save set name' }}
      </button>
      <button class="cancel-button" type="button" :disabled="disabled" @click="emit('cancel')">Cancel</button>
    </div>
  </form>
</template>

<style scoped>
.jersey-set-form { display: grid; gap: 0.55rem; min-width: 0; padding: 0.9rem; border: 1px solid #dfe5dc; border-radius: 0.4rem; background: #fff; }
.jersey-set-form label { color: #49564d; font-size: 0.74rem; font-weight: 600; }
.jersey-set-form input { width: 100%; min-width: 0; min-height: 2.8rem; padding: 0 0.7rem; border: 1px solid #dfe5dc; border-radius: 0.35rem; background: #fbfcfa; color: var(--ink); }
.jersey-set-form input[aria-invalid='true'] { border-color: #a5473d; }
.form-error { margin: 0; color: #8a3d34; font-size: 0.75rem; line-height: 1.45; }
.form-actions { display: flex; flex-wrap: wrap; gap: 0.45rem; }
.primary-button, .cancel-button { min-height: 2.8rem; padding: 0.35rem 0.8rem; border: 0; border-radius: 0.35rem; font-size: 0.73rem; font-weight: 600; }
.primary-button { background: var(--green); color: #fff; }
.cancel-button { border: 1px solid #dfe5dc; background: transparent; color: #405748; }
.primary-button:disabled, .cancel-button:disabled { cursor: not-allowed; opacity: 0.5; }
.primary-button:focus-visible, .cancel-button:focus-visible, .jersey-set-form input:focus-visible { outline: 3px solid #88a84e; outline-offset: 2px; }
.form-actions > button { flex: 1 1 auto; }
</style>
