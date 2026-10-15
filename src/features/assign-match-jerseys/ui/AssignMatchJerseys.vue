<script setup lang="ts">
import { computed, nextTick, ref, useTemplateRef, watch } from 'vue'
import { useJerseySetStore } from '../../../entities/jersey-set'
import { useMatchStore } from '../../../entities/match'
import { usePlayerStore } from '../../../entities/player'
import { useMatchJerseyDraft } from '../model/useMatchJerseyDraft'
import type { JerseyWorkflowNavigationIntent, JerseyWorkflowPresentation } from '../model/workflow'
import JerseyAssignmentEditor from './components/JerseyAssignmentEditor.vue'
import JerseyAssignmentSummary from './components/JerseyAssignmentSummary.vue'
import type { JerseyAssignmentRowView, PlayerIdentityInput } from './types'

const props = withDefaults(defineProps<{
  matchId: string
  mode: 'prepare' | 'summary'
  presentation?: JerseyWorkflowPresentation
  activeStep?: boolean
  discardDraftToken?: number
}>(), {
  presentation: 'standalone',
  activeStep: true,
  discardDraftToken: 0,
})
const emit = defineEmits<{
  saved: [matchId: string]
  dirtyChange: [dirty: boolean]
  navigationIntent: [intent: JerseyWorkflowNavigationIntent]
}>()

const matchStore = useMatchStore()
const playerStore = usePlayerStore()
const jerseySetStore = useJerseySetStore()
const draft = useMatchJerseyDraft(props.matchId, { matchStore, playerStore, jerseySetStore })
const proposalExists = ref(false)
const summaryError = ref<string | null>(null)
const editLauncher = useTemplateRef<HTMLButtonElement>('editLauncher')

const isMatchLoading = computed(() => matchStore.loading.value)
const editorDisabled = computed(() => matchStore.loading.value || matchStore.saving.value
  || playerStore.loading.value || playerStore.saving.value
  || jerseySetStore.loading.value || jerseySetStore.saving.value)
const sourceDataUnavailable = computed(() => !playerStore.ready.value || !jerseySetStore.ready.value)
const setChoices = computed(() => jerseySetStore.sets.value.map(({ id, name }) => ({ id, name })))
const selectedSet = computed(() => {
  const setId = draft.draft.value?.setId
  return setId ? jerseySetStore.sets.value.find((set) => set.id === setId) ?? null : null
})
const ownerPlayers = computed<PlayerIdentityInput[]>(() => playerStore.players.value.map(({ id, name }) => ({ id, name })))
const editorRows = computed<JerseyAssignmentRowView[]>(() => {
  const participation = draft.match.value?.participation
  return (draft.draft.value?.rows ?? []).map((row) => ({
    ...row,
    nameSnapshot: participation?.squad.find(({ playerId }) => playerId === row.playerId)?.nameSnapshot ?? row.playerId,
    playerSize: playerStore.players.value.find(({ id }) => id === row.playerId)?.jerseySize ?? null,
  }))
})
const draftDirty = computed(() => {
  const current = draft.draft.value
  const match = draft.match.value
  if (!current || !match) return false
  const currentRows = current.rows.map(({ playerId, jerseyId, jerseySnapshot }) => ({
    playerId,
    jerseyId,
    jerseySnapshot,
  }))
  const assignment = match.jerseyAssignment
  const savedRows = assignment
    ? assignment.rows.map(({ playerId, jersey }) => ({
        playerId,
        jerseyId: jersey?.jerseyId ?? null,
        jerseySnapshot: jersey ? { ...jersey } : null,
      }))
    : (match.participation?.squad ?? []).map(({ playerId }) => ({
        playerId,
        jerseyId: null,
        jerseySnapshot: null,
      }))
  return JSON.stringify({
    setId: current.setId,
    setNameSnapshot: current.setNameSnapshot,
    rows: currentRows,
  }) !== JSON.stringify({
    setId: assignment?.setId ?? null,
    setNameSnapshot: assignment?.setNameSnapshot ?? null,
    rows: savedRows,
  })
})

watch(draftDirty, (dirty) => emit('dirtyChange', dirty), { immediate: true })

watch(
  () => [props.matchId, props.presentation, draft.match.value?.id, Boolean(draft.match.value?.participation)],
  () => {
    if (props.presentation === 'workflow' && draft.match.value?.participation
      && draft.isEditable.value && !draft.isOpen.value) {
      proposalExists.value = false
      draft.open()
    }
  },
  { immediate: true },
)

watch(() => props.discardDraftToken, (token, previousToken) => {
  if (token !== previousToken && props.presentation === 'workflow' && draft.isOpen.value) {
    draft.reset()
    proposalExists.value = false
    summaryError.value = null
  }
})

watch(draft.isOpen, async (isOpen, wasOpen) => {
  if (wasOpen && !isOpen && props.presentation === 'standalone') {
    await nextTick()
    if (props.mode === 'prepare') editLauncher.value?.focus()
  }
})

function openEditor(): void {
  if (draft.open()) {
    proposalExists.value = false
    summaryError.value = null
  }
}

function selectSet(setId: string): void {
  if (draft.selectSet(setId)) proposalExists.value = false
}

function generateProposal(): void {
  if (draft.generate()) proposalExists.value = true
}

function cancelDraft(): void {
  draft.cancel()
  proposalExists.value = false
}

async function acceptDraft(): Promise<void> {
  if (await draft.accept()) {
    proposalExists.value = false
    emit('saved', props.matchId)
  }
}

function requestKeepOrSkip(): void {
  const intent: JerseyWorkflowNavigationIntent = draft.match.value?.jerseyAssignment ? 'keep' : 'skip'
  emit('navigationIntent', intent)
}

function handleCancel(): void {
  if (props.presentation === 'workflow') requestKeepOrSkip()
  else cancelDraft()
}

async function retrySources(): Promise<void> {
  await draft.retryData()
}

async function retryMatch(): Promise<void> {
  summaryError.value = null
  try {
    await matchStore.load()
  } catch (error) {
    summaryError.value = error instanceof Error ? `Could not load the saved match. ${error.message}` : 'Could not load the saved match. Try again.'
  }
}
</script>

<template>
  <section v-if="isMatchLoading" class="assignment-load-state" role="status" aria-live="polite">
    <p>Loading the saved match…</p>
  </section>
  <section v-else-if="!matchStore.ready.value || !draft.match.value" class="assignment-load-state" aria-live="polite">
    <p v-if="summaryError || matchStore.error.value" role="alert">{{ summaryError ?? `Saved match data is unavailable. ${matchStore.error.value}` }}</p>
    <p v-else>This saved match is unavailable.</p>
    <button v-if="!matchStore.ready.value" type="button" :disabled="matchStore.loading.value || matchStore.saving.value" @click="retryMatch">Try again</button>
  </section>
  <section v-else class="match-jersey-assignment" :aria-hidden="!activeStep">
    <JerseyAssignmentSummary
      v-if="mode === 'summary' || !draft.isEditable.value"
      :assignment="draft.match.value.jerseyAssignment"
      :squad="draft.match.value.participation?.squad ?? []"
      :owner-players="ownerPlayers"
    />
    <template v-else-if="presentation === 'workflow'">
      <JerseyAssignmentEditor
        v-if="draft.isOpen.value && draft.match.value.participation"
        :sets="setChoices"
        :selected-set-id="draft.draft.value?.setId ?? null"
        :rows="editorRows"
        :jerseys="selectedSet?.jerseys ?? []"
        :owner-players="ownerPlayers"
        :proposal-exists="proposalExists"
        :disabled="editorDisabled"
        :navigation-disabled="matchStore.saving.value"
        :active-step="activeStep"
        save-label="Save assignments and finish"
        :cancel-label="draft.match.value.jerseyAssignment ? 'Keep saved jerseys' : 'Skip jerseys'"
        :data-unavailable="sourceDataUnavailable"
        :message="draft.message.value"
        @select-set="selectSet"
        @generate="generateProposal"
        @select-jersey="draft.selectJersey($event.playerId, $event.jerseyId)"
        @accept="acceptDraft"
        @cancel="handleCancel"
        @retry="retrySources"
      />
      <template v-else>
        <p v-if="!draft.match.value.participation" class="squad-required">
          Save a match squad before preparing jerseys. Player tracking and kickoff remain optional.
        </p>
        <JerseyAssignmentSummary
          :assignment="draft.match.value.jerseyAssignment"
          :squad="draft.match.value.participation?.squad ?? []"
          :owner-players="ownerPlayers"
        />
        <button class="workflow-skip-button" type="button" :disabled="matchStore.saving.value" @click="requestKeepOrSkip">
          {{ draft.match.value.jerseyAssignment ? 'Keep saved jerseys and finish' : 'Skip jerseys and finish' }}
        </button>
      </template>
    </template>
    <template v-else>
      <p v-if="!draft.match.value.participation" class="squad-required">
        Save a match squad before preparing jerseys. Player tracking and kickoff remain optional.
      </p>
      <template v-if="!draft.isOpen.value">
        <JerseyAssignmentSummary
          :assignment="draft.match.value.jerseyAssignment"
          :squad="draft.match.value.participation?.squad ?? []"
          :owner-players="ownerPlayers"
        />
        <button
          v-if="draft.match.value.participation"
          class="open-editor-button"
          ref="editLauncher"
          type="button"
          :disabled="matchStore.saving.value"
          @click="openEditor"
        >{{ draft.match.value.jerseyAssignment ? 'Edit jersey assignments' : 'Prepare jerseys' }}</button>
      </template>
      <JerseyAssignmentEditor
        v-else
        :sets="setChoices"
        :selected-set-id="draft.draft.value?.setId ?? null"
        :rows="editorRows"
        :jerseys="selectedSet?.jerseys ?? []"
        :owner-players="ownerPlayers"
        :proposal-exists="proposalExists"
        :disabled="editorDisabled"
        :navigation-disabled="editorDisabled"
        :active-step="activeStep"
        save-label="Accept assignments"
        cancel-label="Cancel"
        :data-unavailable="sourceDataUnavailable"
        :message="draft.message.value"
        @select-set="selectSet"
        @generate="generateProposal"
        @select-jersey="draft.selectJersey($event.playerId, $event.jerseyId)"
        @accept="acceptDraft"
        @cancel="handleCancel"
        @retry="retrySources"
      />
    </template>
    <p v-if="activeStep" class="visually-hidden" role="status" aria-live="polite">{{ draft.announcement.value }}</p>
  </section>
</template>

<style scoped>
.match-jersey-assignment { min-width: 0; display: grid; gap: 0.75rem; margin-top: 1rem; }
.squad-required, .assignment-load-state p { margin: 0; color: #5b6a60; font-size: 0.9rem; line-height: 1.5; }
.assignment-load-state { display: grid; justify-items: start; gap: 0.7rem; padding: 0.9rem 0; }
.assignment-load-state button, .open-editor-button, .workflow-skip-button { min-height: 3rem; padding: 0.45rem 0.85rem; border: 1px solid #cbd7ca; border-radius: 0.4rem; background: #edf3e8; color: #204d38; font: inherit; font-size: 0.9rem; font-weight: 700; }
.assignment-load-state button:focus-visible, .open-editor-button:focus-visible, .workflow-skip-button:focus-visible { outline: 3px solid #91b83c; outline-offset: 2px; }
.assignment-load-state button:disabled, .open-editor-button:disabled, .workflow-skip-button:disabled { cursor: not-allowed; opacity: 0.55; }
.visually-hidden { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0; }
</style>
