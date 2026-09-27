<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import {
  formatMatchMinute,
  type SubstitutionEvent,
  useMatchStore,
} from '../../../entities/match'
import {
  prepareSubstitutionOccurrence,
  recordMatchSubstitution,
  type SubstitutionLineupChoice,
  type SubstitutionOccurrence,
} from '../model/recordSubstitution'
import { FocusedEditorShell } from '../../../shared/ui'
import SubstitutionDraftForm from './components/SubstitutionDraftForm.vue'

const props = defineProps<{ matchId: string }>()
const emit = defineEmits<{
  recorded: [event: SubstitutionEvent]
  editorOpened: []
  editorClosed: []
}>()
const store = useMatchStore()
const launcher = ref<HTMLButtonElement | null>(null)
const occurrence = ref<SubstitutionOccurrence | null>(null)
const capturedLineup = ref<string[]>([])
const capturedBench = ref<string[]>([])
const outgoingPlayerId = ref('')
const incomingPlayerId = ref('')
const localError = ref<string | null>(null)
const match = computed(() => store.matches.value.find((item) => item.id === props.matchId) ?? null)
const isActiveMatch = computed(() => match.value?.clock.status === 'running'
  || match.value?.clock.status === 'paused'
  || match.value?.clock.status === 'halftime')
const canStart = computed(() => Boolean(
  store.ready.value && !store.saving.value && match.value?.participation && isActiveMatch.value,
))
const namesById = computed(() => new Map(
  (match.value?.participation?.squad ?? []).map((player) => [player.playerId, player.nameSnapshot]),
))
const labelsById = computed(() => {
  const groups = new Map<string, string[]>()
  for (const [playerId, name] of namesById.value) {
    const key = name.trim().toLocaleLowerCase()
    groups.set(key, [...(groups.get(key) ?? []), playerId])
  }
  const labels = new Map<string, string>()
  for (const [key, ids] of groups) {
    const name = namesById.value.get(ids[0]) ?? key
    for (const playerId of ids) {
      if (ids.length === 1) {
        labels.set(playerId, name)
        continue
      }
      const stableId = playerId.replace(/[^a-z0-9]/gi, '') || playerId
      let length = Math.min(4, stableId.length)
      while (length < stableId.length && ids.some((otherId) => otherId !== playerId
        && (otherId.replace(/[^a-z0-9]/gi, '') || otherId).slice(0, length).toLowerCase() === stableId.slice(0, length).toLowerCase())) {
        length += 1
      }
      labels.set(playerId, `${name} · ${stableId.slice(0, length)}`)
    }
  }
  return labels
})
const onPitchChoices = computed<SubstitutionLineupChoice[]>(() => capturedLineup.value.map((id) => ({
  id,
  label: labelsById.value.get(id) ?? id,
})))
const benchChoices = computed<SubstitutionLineupChoice[]>(() => capturedBench.value.map((id) => ({
  id,
  label: labelsById.value.get(id) ?? id,
})))
const occurrenceLabel = computed(() => {
  if (!occurrence.value || !match.value) return ''
  if (occurrence.value.atHalfTime) {
    return 'Half-time · second half starts at 00:00'
  }
  const period = occurrence.value.period === 1 ? 'First half' : 'Second half'
  return `${period} · ${formatMatchMinute(occurrence.value.period, occurrence.value.elapsedMs)}`
})

watch(() => props.matchId, cancelDraft)

function beginDraft(): void {
  const current = match.value
  if (!current || !canStart.value) return
  const capturedAt = Date.now()
  const prepared = prepareSubstitutionOccurrence(current, capturedAt)
  if (!prepared.valid) {
    localError.value = prepared.error
    return
  }
  occurrence.value = prepared.occurrence
  capturedLineup.value = prepared.lineup
  capturedBench.value = prepared.bench
  outgoingPlayerId.value = ''
  incomingPlayerId.value = ''
  localError.value = null
  emit('editorOpened')
}

function cancelDraft(): void {
  if (store.saving.value && occurrence.value) return
  const wasOpen = occurrence.value !== null
  occurrence.value = null
  capturedLineup.value = []
  capturedBench.value = []
  outgoingPlayerId.value = ''
  incomingPlayerId.value = ''
  localError.value = null
  if (wasOpen) emit('editorClosed')
}

function focusLauncher(): HTMLElement | null {
  return launcher.value
}

async function saveDraft(): Promise<void> {
  const current = match.value
  const captured = occurrence.value
  if (!current || !captured) return
  if (!outgoingPlayerId.value || !incomingPlayerId.value) {
    localError.value = 'Choose one player coming off and one player coming on.'
    return
  }
  localError.value = null
  try {
    const event = await recordMatchSubstitution(
      current,
      captured,
      outgoingPlayerId.value,
      incomingPlayerId.value,
      store,
      Date.now(),
    )
    cancelDraft()
    emit('recorded', event)
  } catch (error) {
    localError.value = error instanceof Error ? error.message : 'Could not save the substitution.'
  }
}

const formId = 'substitution-draft-form'
</script>

<template>
  <section v-if="match?.participation" class="record-substitution" aria-label="Match substitution">
    <button
      ref="launcher"
      class="start-substitution-button"
      type="button"
      data-action="start-substitution"
      :disabled="!canStart"
      @click="beginDraft"
    >Substitute</button>
    <p v-if="match.clock.status === 'not-started'" class="substitution-hint">Substitutions become available after kickoff.</p>
    <p v-else-if="match.clock.status === 'full-time'" class="substitution-hint">No new live substitutions can be recorded after full-time.</p>
    <p v-if="localError && !occurrence" class="substitution-error" role="alert" aria-live="assertive">{{ localError }}</p>

    <FocusedEditorShell
      :open="Boolean(occurrence)"
      title="Make a substitution"
      :fallback-focus="focusLauncher"
      @close="cancelDraft"
    >
      <SubstitutionDraftForm
        :form-id="formId"
        :occurrence-label="occurrenceLabel"
        :on-pitch="onPitchChoices"
        :bench="benchChoices"
        :outgoing-player-id="outgoingPlayerId"
        :incoming-player-id="incomingPlayerId"
        :disabled="store.saving.value"
        :saving="store.saving.value"
        :error="localError"
        @update-outgoing="outgoingPlayerId = $event"
        @update-incoming="incomingPlayerId = $event"
        @save="saveDraft"
      />

      <template #actions>
        <button class="cancel-substitution-button" type="button" :disabled="store.saving.value" @click="cancelDraft">Cancel</button>
        <button
          class="save-substitution-button"
          type="submit"
          :form="formId"
          :disabled="store.saving.value || !outgoingPlayerId || !incomingPlayerId || !benchChoices.length"
        >Save substitution</button>
      </template>
    </FocusedEditorShell>
  </section>
</template>

<style scoped>
.record-substitution { min-width: 0; }
.start-substitution-button,
.cancel-substitution-button,
.save-substitution-button { min-height: 48px; padding: 0 16px; border-radius: 10px; font: inherit; font-size: 0.9rem; font-weight: 700; }
.start-substitution-button { width: 100%; border: 1px solid #cad7c7; background: #edf3e8; color: #204d38; }
.cancel-substitution-button { border: 1px solid #cbd5cb; background: #fff; color: #34483a; }
.save-substitution-button { border: 1px solid #204d38; background: #204d38; color: #fff; }
.start-substitution-button:disabled { cursor: not-allowed; opacity: 0.5; }
.cancel-substitution-button:disabled, .save-substitution-button:disabled { cursor: not-allowed; opacity: 0.55; }
.substitution-hint { margin: 0.4rem 0 0; color: #526156; font-size: 0.875rem; }
.substitution-error { margin: 0.4rem 0 0; padding: 0.6rem 0.7rem; border-radius: 8px; background: #f8e9e6; color: #8a3028; font-size: 1rem; }

@media (max-width: 520px) {
  .cancel-substitution-button, .save-substitution-button { flex: 1 1 100%; }
}
</style>
