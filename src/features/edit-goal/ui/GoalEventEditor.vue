<script setup lang="ts">
import { computed, reactive, ref, watch, type DeepReadonly } from 'vue'
import { formatMatchMinute, parseMatchMinute, useMatchStore, type GoalEvent, type MatchSide } from '../../../entities/match'
import { FocusedEditorShell } from '../../../shared/ui'
import { persistGoalEdit } from '../model/persistGoalEdit'

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
const draft = reactive({
  side: 'home' as MatchSide,
  time: '',
  scorer: '',
  assist: '',
  description: '',
})

const hasDetails = computed(() => Boolean(
  props.goal.scorer.trim() || props.goal.assist.trim() || props.goal.description.trim(),
))
const launcherLabel = computed(() => hasDetails.value ? 'Edit' : 'Add details')
const launcherAccessibleLabel = computed(() => `${hasDetails.value ? 'Edit details' : 'Add details'} for ${teamName(props.goal.side)} goal at ${formatMatchMinute(props.goal.period, props.goal.elapsedMs)}`)
const editorTitle = computed(() => hasDetails.value ? 'Edit goal details' : 'Add goal details')
const formId = 'goal-edit-form'

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

function loadSavedValues(goal: DeepReadonly<GoalEvent> = props.goal): void {
  draft.side = goal.side
  draft.time = formatMatchMinute(goal.period, goal.elapsedMs).replace('′', '')
  draft.scorer = goal.scorer
  draft.assist = goal.assist
  draft.description = goal.description
}

watch(() => props.open, (open) => {
  if (open && !hasDraft.value) {
    loadSavedValues()
    hasDraft.value = true
  }
})

watch(
  () => [props.goal.side, props.goal.period, props.goal.elapsedMs, props.goal.scorer, props.goal.assist, props.goal.description],
  () => {
    if (!hasDraft.value) loadSavedValues()
  },
)

function discardChanges(): void {
  loadSavedValues()
  hasDraft.value = false
  saveError.value = ''
  timeError.value = ''
}

async function save(): Promise<void> {
  if (!store.ready.value || store.saving.value) return
  const parsedTime = parseMatchMinute(draft.time)
  if (!parsedTime) {
    timeError.value = 'Enter a minute from 1–90, or stoppage time such as 45+2.'
    return
  }

  const editedGoal: GoalEvent = {
    ...props.goal,
    side: draft.side,
    period: parsedTime.period,
    elapsedMs: parsedTime.elapsedMs,
    scorer: draft.scorer.trim(),
    assist: draft.assist.trim(),
    description: draft.description.trim(),
  }
  const currentMatch = match.value
  if (!currentMatch) return
  const now = Date.now()
  saveError.value = ''
  timeError.value = ''
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
        <label>
          <span>Scorer <small>Optional</small></span>
          <input v-model="draft.scorer" name="scorer" autocomplete="off" placeholder="Add scorer" :disabled="!store.ready.value || store.saving.value" />
        </label>
        <label>
          <span>Assist <small>Optional</small></span>
          <input v-model="draft.assist" name="assist" autocomplete="off" placeholder="Add assist" :disabled="!store.ready.value || store.saving.value" />
        </label>
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
