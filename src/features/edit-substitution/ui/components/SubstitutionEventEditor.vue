<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue'
import {
  type SubstitutionCorrection,
  useMatchStore,
} from '../../../../entities/match'
import type { CorrectionPlayerChoice } from '../../model/editSubstitution'
import {
  persistSubstitutionCorrection,
  persistSubstitutionRemoval,
} from '../../model/editSubstitution'
import { FocusedEditorShell } from '../../../../shared/ui'
import SubstitutionCorrectionForm from './SubstitutionCorrectionForm.vue'

const props = defineProps<{ matchId: string; eventId: string }>()
const emit = defineEmits<{
  editorOpened: []
  editorClosed: []
}>()
const store = useMatchStore()
const editing = ref(false)
const launcher = ref<HTMLButtonElement | null>(null)
const error = ref<string | null>(null)
const formId = 'substitution-correction-form'
const match = computed(() => store.matches.value.find((item) => item.id === props.matchId) ?? null)
const event = computed(() => match.value?.participation?.substitutions.find((item) => item.id === props.eventId) ?? null)
const playerChoices = computed<CorrectionPlayerChoice[]>(() => {
  const squad = match.value?.participation?.squad ?? []
  const nameById = new Map(squad.map((player) => [player.playerId, player.nameSnapshot]))
  const byName = new Map<string, string[]>()
  for (const player of squad) {
    const key = player.nameSnapshot.trim().toLocaleLowerCase()
    byName.set(key, [...(byName.get(key) ?? []), player.playerId])
  }
  const labels = new Map<string, string>()
  for (const ids of byName.values()) {
    for (const id of ids) {
      const name = nameById.get(id) ?? id
      if (ids.length === 1) {
        labels.set(id, name)
        continue
      }
      const shortId = id.replace(/[^a-z0-9]/gi, '') || id
      let length = Math.min(4, shortId.length)
      while (length < shortId.length && ids.some((otherId) => otherId !== id
        && (otherId.replace(/[^a-z0-9]/gi, '') || otherId).slice(0, length).toLowerCase() === shortId.slice(0, length).toLowerCase())) {
        length += 1
      }
      labels.set(id, `${name} · ${shortId.slice(0, length)}`)
    }
  }
  return [...nameById.keys()].map((id) => ({ id, label: labels.get(id) ?? id }))
})
const playerLabelById = computed(() => new Map(playerChoices.value.map((player) => [player.id, player.label])))

function playerLabel(playerId: string): string {
  return playerLabelById.value.get(playerId) ?? playerId
}

function errorMessage(reason: string, conflictEventId: string | null): string {
  if (!conflictEventId) return reason
  const conflictEvent = match.value?.participation?.substitutions.find((item) => item.id === conflictEventId)
  if (!conflictEvent) return reason
  return `${reason} First conflict: ${playerLabel(conflictEvent.outgoingPlayerId)} off for ${playerLabel(conflictEvent.incomingPlayerId)}.`
}

function beginEdit(): void {
  error.value = null
  editing.value = true
  emit('editorOpened')
}

function cancelEdit(): void {
  if (store.saving.value) return
  const wasEditing = editing.value
  editing.value = false
  error.value = null
  if (wasEditing) emit('editorClosed')
}

function focusFallback(): HTMLElement | null {
  if (launcher.value?.isConnected) return launcher.value
  return document.querySelector<HTMLElement>('#events-panel')
}

async function saveCorrection(correction: SubstitutionCorrection): Promise<void> {
  const current = match.value
  if (!current || !event.value) return
  error.value = null
  try {
    const result = await persistSubstitutionCorrection(current, props.eventId, correction, store)
    if (!result.valid) {
      error.value = errorMessage(result.conflict.reason, result.conflict.eventId)
      return
    }
    cancelEdit()
  } catch (saveError) {
    error.value = saveError instanceof Error ? saveError.message : 'Could not save the substitution correction.'
  }
}

async function removeEvent(): Promise<void> {
  const current = match.value
  if (!current || !event.value) return
  error.value = null
  try {
    const result = await persistSubstitutionRemoval(current, props.eventId, store)
    if (!result.valid) {
      error.value = errorMessage(result.conflict.reason, result.conflict.eventId)
      return
    }
    cancelEdit()
  } catch (saveError) {
    error.value = saveError instanceof Error ? saveError.message : 'Could not remove the substitution.'
  }
}

onBeforeUnmount(() => {
  if (!editing.value) return
  editing.value = false
  emit('editorClosed')
})
</script>

<template>
  <div v-if="event" class="event-editor">
    <button
      ref="launcher"
      class="edit-event-button"
      type="button"
      :disabled="store.saving.value"
      :aria-label="`Correct substitution ${playerLabel(event.outgoingPlayerId)} off for ${playerLabel(event.incomingPlayerId)}`"
      @click="beginEdit"
    >Correct</button>
    <FocusedEditorShell
      :open="editing"
      title="Correct substitution"
      :fallback-focus="focusFallback"
      @close="cancelEdit"
    >
      <SubstitutionCorrectionForm
        :key="event.id"
        :form-id="formId"
        :event="event"
        :choices="playerChoices"
        :disabled="store.saving.value"
        :saving="store.saving.value"
        :error="error"
        @save="saveCorrection"
      />

      <template #actions>
        <button class="cancel-correction-button" type="button" :disabled="store.saving.value" @click="cancelEdit">Cancel</button>
        <button class="remove-correction-button" type="button" :disabled="store.saving.value" @click="removeEvent">Remove substitution</button>
        <button class="save-correction-button" type="submit" :form="formId" :disabled="store.saving.value">Save correction</button>
      </template>
    </FocusedEditorShell>
  </div>
</template>

<style scoped>
.event-editor { flex: 0 0 auto; }
.edit-event-button { min-height: 48px; padding: 0 16px; border: 1px solid #cad7c7; border-radius: 10px; background: #fff; color: #204d38; font: inherit; font-size: 0.9rem; font-weight: 700; }
.edit-event-button:disabled { cursor: not-allowed; opacity: 0.5; }
.save-correction-button, .remove-correction-button, .cancel-correction-button { min-height: 48px; padding: 0 16px; border-radius: 10px; font: inherit; font-size: 0.9rem; font-weight: 700; }
.save-correction-button { border: 1px solid #204d38; background: #204d38; color: #fff; }
.remove-correction-button { border: 1px solid #c9877d; background: #fff; color: #8a3028; }
.cancel-correction-button { border: 1px solid #cbd5cb; background: #fff; color: #34483a; }
.save-correction-button:disabled, .remove-correction-button:disabled, .cancel-correction-button:disabled { cursor: not-allowed; opacity: 0.55; }
@media (max-width: 520px) { .save-correction-button, .remove-correction-button, .cancel-correction-button { flex: 1 1 100%; } }
</style>
