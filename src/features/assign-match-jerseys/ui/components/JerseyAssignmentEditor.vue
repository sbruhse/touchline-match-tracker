<script setup lang="ts">
import { computed, onMounted, useTemplateRef } from 'vue'
import {
  createJerseyIdentityLabels,
  createJerseySetIdentityLabels,
  type Jersey,
  type JerseySet,
} from '../../../../entities/jersey-set'
import { createPlayerIdentityLabels } from '../../../../entities/player'
import JerseyAssignmentRow from './JerseyAssignmentRow.vue'
import type { JerseyAssignmentRowView, JerseyAssignmentOptionView, PlayerIdentityInput } from '../types'

const props = defineProps<{
  sets: readonly Pick<JerseySet, 'id' | 'name'>[]
  selectedSetId: string | null
  rows: readonly JerseyAssignmentRowView[]
  jerseys: readonly Jersey[]
  ownerPlayers: readonly PlayerIdentityInput[]
  proposalExists: boolean
  disabled: boolean
  navigationDisabled: boolean
  activeStep: boolean
  saveLabel: string
  cancelLabel: string
  dataUnavailable: boolean
  message: string | null
}>()

const emit = defineEmits<{
  selectSet: [setId: string]
  generate: []
  selectJersey: [payload: { playerId: string; jerseyId: string | null }]
  accept: []
  cancel: []
  retry: []
}>()

const setPicker = useTemplateRef<HTMLSelectElement>('setPicker')
const retryButton = useTemplateRef<HTMLButtonElement>('retryButton')
const setLabels = computed(() => createJerseySetIdentityLabels(props.sets))
const playerLabels = computed(() => createPlayerIdentityLabels(
  props.rows.map(({ playerId, nameSnapshot }) => ({ id: playerId, name: nameSnapshot })),
))
const ownerLabels = computed(() => createPlayerIdentityLabels(props.ownerPlayers))
const jerseyLabels = computed(() => createJerseyIdentityLabels(props.jerseys))
const jerseyOptions = computed<JerseyAssignmentOptionView[]>(() => props.jerseys.map((jersey) => ({
  id: jersey.id,
  label: jerseyLabels.value.get(jersey.id) ?? `Number ${jersey.number}, size ${jersey.size}`,
  ownerLabel: jersey.ownerPlayerId === null
    ? 'Team'
    : ownerLabels.value.get(jersey.ownerPlayerId) ?? `Unavailable player · ${jersey.ownerPlayerId}`,
})))

onMounted(() => {
  if (!props.activeStep) return
  if (props.dataUnavailable) retryButton.value?.focus()
  else setPicker.value?.focus()
})

function changeSet(event: Event): void {
  const setId = (event.target as HTMLSelectElement).value
  if (setId) emit('selectSet', setId)
}
</script>

<template>
  <section class="jersey-editor" aria-labelledby="jersey-editor-heading">
    <header class="editor-heading">
      <div>
        <h2 id="jersey-editor-heading">Jersey assignments</h2>
        <p class="editor-intro">Review every player, then save the whole distribution.</p>
      </div>
      <span class="draft-state">Draft · not saved</span>
    </header>

    <div class="set-controls">
      <div class="set-field">
        <label for="jersey-assignment-set">Jersey set</label>
        <select
          ref="setPicker"
          id="jersey-assignment-set"
          :value="selectedSetId ?? ''"
          :disabled="disabled || dataUnavailable"
          @change="changeSet"
        >
          <option value="" disabled>Select a set</option>
          <option v-for="set in sets" :key="set.id" :value="set.id">
            {{ setLabels.get(set.id) ?? set.name }}
          </option>
        </select>
      </div>
      <button
        class="generate-button"
        type="button"
        :disabled="disabled || dataUnavailable || !selectedSetId"
        @click="emit('generate')"
      >{{ proposalExists ? 'Replace draft with a new proposal' : 'Generate proposal' }}</button>
    </div>

    <p v-if="dataUnavailable" class="source-unavailable" role="status">
      Player or jersey data is unavailable. Retry loading it before generating or editing assignments.
      <button ref="retryButton" type="button" :disabled="disabled" @click="emit('retry')">Try again</button>
    </p>
    <p v-else-if="!sets.length" class="empty-sets" role="status">
      No jersey sets are available. Create a set before preparing this match.
    </p>
    <p v-if="message" class="editor-message" role="alert" aria-live="assertive">{{ message }}</p>

    <div v-if="rows.length" class="assignment-rows" aria-label="Match squad jersey assignments">
      <JerseyAssignmentRow
        v-for="row in rows"
        :key="row.playerId"
        :row="row"
        :player-label="playerLabels.get(row.playerId) ?? row.nameSnapshot"
        :jersey-options="jerseyOptions"
        :disabled="disabled || !selectedSetId || dataUnavailable"
        @select-jersey="emit('selectJersey', $event)"
      />
    </div>
    <p v-else class="empty-squad">Save a match squad before preparing jerseys.</p>

    <div class="editor-actions">
      <button class="accept-button" type="button" :disabled="disabled || !selectedSetId" @click="emit('accept')">
        {{ saveLabel }}
      </button>
      <button class="cancel-button" type="button" :disabled="navigationDisabled" @click="emit('cancel')">{{ cancelLabel }}</button>
    </div>
  </section>
</template>

<style scoped>
.jersey-editor { min-width: 0; display: grid; gap: 1rem; padding: 1rem; border: 1px solid #dfe5dc; border-radius: 0.6rem; background: #fbfcfa; }
.editor-heading { display: flex; align-items: flex-start; justify-content: space-between; gap: 0.8rem; }
.editor-heading h2 { margin: 0; color: #20382a; font-family: 'Space Grotesk', sans-serif; font-size: 1.25rem; letter-spacing: -0.025em; }
.editor-intro { margin: 0.35rem 0 0; color: #66756a; font-size: 0.9rem; line-height: 1.45; }
.draft-state { flex: 0 0 auto; padding: 0.35rem 0.55rem; border-radius: 999px; background: #edf3e8; color: #204d38; font-size: 0.78rem; font-weight: 700; }
.set-controls { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: end; gap: 0.65rem; }
.set-field { display: grid; min-width: 0; gap: 0.35rem; }
.set-field label { color: #3b5141; font-size: 0.9rem; font-weight: 600; }
.set-field select { width: 100%; min-width: 0; min-height: 3rem; padding: 0.45rem 0.7rem; border: 1px solid #cbd7ca; border-radius: 0.4rem; background: #fff; color: #17251d; font: inherit; font-size: 0.95rem; }
.generate-button, .accept-button, .cancel-button, .source-unavailable button { min-height: 3rem; padding: 0.45rem 0.85rem; border: 1px solid #cbd7ca; border-radius: 0.4rem; background: #fff; color: #204d38; font: inherit; font-size: 0.9rem; font-weight: 700; overflow-wrap: anywhere; }
.generate-button { background: #edf3e8; }
.assignment-rows { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0.7rem; }
.editor-actions { display: flex; flex-wrap: wrap; gap: 0.6rem; }
.editor-actions button { flex: 1 1 11rem; }
.accept-button { border-color: #204d38; background: #204d38; color: #fff; }
.cancel-button { background: transparent; color: #3b5141; }
.source-unavailable, .empty-sets, .empty-squad, .editor-message { margin: 0; font-size: 0.9rem; line-height: 1.5; overflow-wrap: anywhere; }
.source-unavailable { display: flex; align-items: center; justify-content: space-between; gap: 0.7rem; padding: 0.75rem; border-left: 4px solid #d0a146; background: #fff9ec; color: #5d4a24; }
.source-unavailable button { flex: 0 0 auto; }
.empty-sets, .empty-squad { color: #66756a; }
.editor-message { padding: 0.7rem; border-left: 4px solid #8a3028; background: #f8e9e6; color: #78271f; }
.jersey-editor button:focus-visible, .jersey-editor select:focus-visible { outline: 3px solid #91b83c; outline-offset: 2px; }
.jersey-editor button:disabled, .jersey-editor select:disabled { cursor: not-allowed; opacity: 0.55; }
.visually-hidden { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0; }

@media (max-width: 620px) {
  .editor-heading { flex-direction: column; }
  .set-controls, .assignment-rows { grid-template-columns: minmax(0, 1fr); }
  .editor-actions { flex-direction: column; }
  .editor-actions button, .source-unavailable button { flex: 0 0 auto; width: 100%; }
}
</style>
