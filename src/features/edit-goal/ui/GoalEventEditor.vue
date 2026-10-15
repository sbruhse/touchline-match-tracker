<script setup lang="ts">
import { computed, reactive, ref, watch, type DeepReadonly } from 'vue'
import { formatMatchMinute, getAcceptedJerseyNumber, useMatchStore, type GoalEvent, type MatchSide } from '../../../entities/match'
import { createPlayerIdentityLabels } from '../../../entities/player'
import { FocusedEditorShell } from '../../../shared/ui'
import type { GoalPlayerDraft, GoalPlayerOption } from '../model/goalPlayerDraft'
import { prepareGoalEdit } from '../model/prepareGoalEdit'
import { persistGoalEdit } from '../model/persistGoalEdit'
import GoalPlayerField from './components/GoalPlayerField.vue'

const props = defineProps<{
  matchId: string
  goal: DeepReadonly<GoalEvent>
  homeTeam: string
  awayTeam: string
  open: boolean
}>()

const emit = defineEmits<{
  open: []
  close: []
  saved: [goalId: string, now: number]
}>()

const store = useMatchStore()
const match = computed(() => store.matches.value.find((item) => item.id === props.matchId) ?? null)
const launcher = ref<HTMLElement | null>(null)
const hasDraft = ref(false)
const saveError = ref('')
const timeError = ref('')
const savedDisplayTime = ref('')
const draft = reactive({
  side: 'home' as MatchSide,
  time: '',
  scorer: { mode: 'none' } as GoalPlayerDraft,
  assist: { mode: 'none' } as GoalPlayerDraft,
  description: '',
})

const hasDetails = computed(() => Boolean(
  props.goal.scorer.trim() || props.goal.assist.trim() || props.goal.description.trim(),
))
const launcherLabel = computed(() => hasDetails.value ? 'Edit' : 'Add details')
const launcherAccessibleLabel = computed(() => `${hasDetails.value ? 'Edit details' : 'Add details'} for ${teamName(props.goal.side)} goal at ${formatMatchMinute(props.goal.period, props.goal.elapsedMs)}`)
const editorTitle = computed(() => hasDetails.value ? 'Edit goal details' : 'Add goal details')
const formId = 'goal-edit-form'
const participation = computed(() => match.value?.participation ?? null)
const hasSquadChoices = computed(() => participation.value?.ownSide === draft.side)
const playerOptions = computed<GoalPlayerOption[]>(() => {
  const squad = participation.value?.squad ?? []
  const identityLabels = createPlayerIdentityLabels(squad.map(({ playerId, nameSnapshot }) => ({
    id: playerId,
    name: nameSnapshot,
  })))
  const jerseyAssignment = match.value?.jerseyAssignment ?? null

  return squad.map(({ playerId, nameSnapshot }) => {
    const number = getAcceptedJerseyNumber(jerseyAssignment, playerId)
    const name = identityLabels.get(playerId) ?? nameSnapshot
    return {
      playerId,
      name: nameSnapshot,
      label: number === undefined || number === null ? name : `#${number} ${name}`,
    }
  })
})

function teamName(side: MatchSide): string {
  return side === 'home' ? props.homeTeam : props.awayTeam
}

function focusFallback(): HTMLElement | null {
  const panel = launcher.value?.closest<HTMLElement>('.match-panel')
  if (launcher.value?.isConnected && (!panel || getComputedStyle(panel).display !== 'none')) {
    return launcher.value
  }
  return document.querySelector<HTMLElement>('.match-panel-tabs [aria-selected="true"]')
    ?? launcher.value
}

function roleDraft(playerId: string | null, name: string): GoalPlayerDraft {
  if (playerId !== null) {
    const option = playerOptions.value.find((candidate) => candidate.playerId === playerId)
    return {
      mode: 'squad',
      playerId,
      name,
      label: option?.label ?? name,
    }
  }
  return name.trim() ? { mode: 'manual', name } : { mode: 'none' }
}

function loadSavedValues(goal: DeepReadonly<GoalEvent> = props.goal): void {
  draft.side = goal.side
  draft.time = formatMatchMinute(goal.period, goal.elapsedMs).replace('′', '')
  savedDisplayTime.value = draft.time
  draft.scorer = roleDraft(goal.scorerPlayerId, goal.scorer)
  draft.assist = roleDraft(goal.assistPlayerId, goal.assist)
  draft.description = goal.description
}

watch(() => props.open, (open) => {
  if (open && !hasDraft.value) {
    loadSavedValues()
    hasDraft.value = true
  }
}, { immediate: true })

watch(playerOptions, (options) => {
  const refreshLabel = (role: GoalPlayerDraft): GoalPlayerDraft => {
    if (role.mode !== 'squad') return role
    const option = options.find((candidate) => candidate.playerId === role.playerId)
    return option ? { ...role, label: option.label } : role
  }
  draft.scorer = refreshLabel(draft.scorer)
  draft.assist = refreshLabel(draft.assist)
})

watch(
  () => [props.goal.side, props.goal.period, props.goal.elapsedMs, props.goal.scorerPlayerId, props.goal.scorer, props.goal.assistPlayerId, props.goal.assist, props.goal.description],
  () => {
    if (!hasDraft.value) loadSavedValues()
  },
)

watch(() => draft.side, (side) => {
  if (side === participation.value?.ownSide) return
  if (draft.scorer.mode === 'squad') draft.scorer = { mode: 'manual', name: draft.scorer.name }
  if (draft.assist.mode === 'squad') draft.assist = { mode: 'manual', name: draft.assist.name }
})

function discardChanges(): void {
  loadSavedValues()
  hasDraft.value = false
  saveError.value = ''
  timeError.value = ''
}

async function save(): Promise<void> {
  if (!store.ready.value || store.saving.value) return
  const currentMatch = match.value
  if (!currentMatch) return
  saveError.value = ''
  timeError.value = ''
  const prepared = prepareGoalEdit(currentMatch, props.goal.id, {
    side: draft.side,
    time: draft.time,
    savedDisplayTime: savedDisplayTime.value,
    scorer: draft.scorer,
    assist: draft.assist,
    description: draft.description,
  })
  if (!prepared.ok) {
    if (prepared.field === 'time') timeError.value = prepared.error
    else saveError.value = prepared.error
    return
  }

  const editedGoal = prepared.goal
  const now = Date.now()
  try {
    await persistGoalEdit(currentMatch, editedGoal, store, now)
    loadSavedValues(editedGoal)
    hasDraft.value = false
    emit('saved', editedGoal.id, now)
    emit('close')
  } catch {
    saveError.value = store.error.value ?? 'The goal could not be saved. Your changes are still here; try again.'
  }
}
</script>

<template>
  <button
    ref="launcher"
    class="goal-editor-launcher"
    type="button"
    :aria-label="launcherAccessibleLabel"
    @click="emit('open')"
  >{{ launcherLabel }}</button>

  <FocusedEditorShell
    :open="open"
    :title="editorTitle"
    :fallback-focus="focusFallback"
    @close="emit('close')"
  >
    <form :id="formId" class="goal-editor" :aria-label="`Edit goal at ${draft.time}`" @submit.prevent="save">
      <div class="goal-editor-grid">
        <label>
          <span>Team</span>
          <select v-model="draft.side" name="side" :disabled="!store.ready.value || store.saving.value">
            <option value="home">{{ homeTeam }}</option>
            <option value="away">{{ awayTeam }}</option>
          </select>
        </label>
        <label>
          <span>Match minute</span>
          <input v-model="draft.time" name="time" autocomplete="off" aria-label="Match minute" :disabled="!store.ready.value || store.saving.value" required />
        </label>
        <GoalPlayerField
          role="scorer"
          :value="draft.scorer"
          :players="playerOptions"
          :has-squad-choices="hasSquadChoices"
          :disabled="!store.ready.value || store.saving.value"
          :error="null"
          @update="draft.scorer = $event"
        />
        <GoalPlayerField
          role="assist"
          :value="draft.assist"
          :players="playerOptions"
          :has-squad-choices="hasSquadChoices"
          :disabled="!store.ready.value || store.saving.value"
          :error="null"
          @update="draft.assist = $event"
        />
        <label class="description-field">
          <span>Description <small>Optional</small></span>
          <textarea v-model="draft.description" name="description" rows="3" placeholder="How it happened…" :disabled="!store.ready.value || store.saving.value"></textarea>
        </label>
      </div>
      <p v-if="store.saving.value" class="editor-saving" role="status" aria-live="polite">
        Saving goal details…
      </p>
      <p v-if="timeError" class="editor-error" role="alert">{{ timeError }}</p>
      <p v-if="saveError" class="editor-error" role="alert">{{ saveError }}</p>
    </form>

    <template #actions>
      <button class="discard-goal-button" type="button" :disabled="store.saving.value" @click="discardChanges">Discard changes</button>
      <button class="save-goal-button" type="submit" :form="formId" :disabled="!store.ready.value || store.saving.value">
        Save details
      </button>
    </template>
  </FocusedEditorShell>
</template>

<style scoped>
.goal-editor-launcher,
.discard-goal-button,
.save-goal-button {
  min-height: 48px;
  padding: 0 16px;
  border-radius: 10px;
  font: inherit;
  font-size: 0.9rem;
  font-weight: 700;
}

.goal-editor-launcher {
  color: #204d38;
  background: #fff;
  border: 1px solid #cad7c7;
}

.goal-editor { display: grid; gap: 20px; }
.goal-editor-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
.goal-editor label { display: grid; gap: 8px; }
.goal-editor label > span { color: #526156; font-size: 1rem; font-weight: 700; }
.goal-editor label small { margin-left: 4px; color: #68756b; font-size: 0.875rem; font-weight: 400; }
.description-field { grid-column: 1 / -1; }
.goal-editor input, .goal-editor select, .goal-editor textarea {
  width: 100%;
  min-width: 0;
  min-height: 48px;
  padding: 10px 12px;
  border: 1px solid #cbd5cb;
  border-radius: 8px;
  background: #fff;
  color: #17251d;
  font: inherit;
  font-size: 1rem;
}
.goal-editor textarea { resize: vertical; }
.editor-saving { margin: 0; color: #526156; font-size: 1rem; }
.editor-error { margin: 0; color: #8a3028; font-size: 1rem; }
.discard-goal-button { color: #34483a; background: #fff; border: 1px solid #cbd5cb; }
.save-goal-button { color: #fff; background: #204d38; border: 1px solid #204d38; }
.discard-goal-button:disabled, .save-goal-button:disabled { cursor: not-allowed; opacity: 0.55; }

@media (max-width: 520px) {
  .goal-editor-grid { grid-template-columns: 1fr; }
  .description-field { grid-column: auto; }
  .discard-goal-button, .save-goal-button { flex: 1 1 100%; }
}
</style>
