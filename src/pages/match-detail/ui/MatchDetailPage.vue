<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import {
  getMatchMinute,
  scoreFor,
  useMatchStore,
  useMatchTime,
} from '../../../entities/match'
import { ConfigureMatchSquad } from '../../../features/configure-match-squad'
import type { CommittedGoalResult } from '../../../features/record-goal'
import { MatchLineupWidget } from '../../../widgets/match-lineup'
import MatchTimeline from './components/MatchTimeline.vue'
import MatchActionBar from './components/MatchActionBar.vue'
import MatchHeader from './components/MatchHeader.vue'

const props = defineProps<{ matchId: string }>()
const emit = defineEmits<{ back: [] }>()
const store = useMatchStore()
const match = computed(() => store.matches.value.find((item) => item.id === props.matchId) ?? null)
const score = computed(() => match.value ? scoreFor(match.value) : { home: 0, away: 0 })
const { now, refresh } = useMatchTime()
const selectedPanel = ref<'events' | 'player-times'>('events')
const actionHeight = ref(100)
const recentlySavedGoal = ref<CommittedGoalResult | null>(null)
const requestedGoalId = ref<string | null>(null)
const focusedGoalEditorId = ref<string | null>(null)
const focusedSubstitutionEditor = ref(false)
const displayedMinute = computed(() => match.value ? getMatchMinute(match.value.clock, now.value) : '')
const clockStatusLabel = computed(() => {
  if (!match.value) return ''
  switch (match.value.clock.status) {
    case 'not-started': return 'READY FOR KICKOFF'
    case 'running': return 'CLOCK RUNNING'
    case 'paused': return 'CLOCK PAUSED'
    case 'halftime': return 'HALF TIME'
    case 'full-time': return 'FULL TIME'
  }
})
const periodLabel = computed(() => match.value?.clock.period === 2 ? 'SECOND HALF' : 'FIRST HALF')
const canSubstitute = computed(() => Boolean(match.value?.participation
  && ['running', 'paused', 'halftime'].includes(match.value.clock.status)))
const matchSaveFeedback = computed(() => {
  if (focusedGoalEditorId.value || focusedSubstitutionEditor.value) return null
  if (store.saving.value) return { type: 'saving', text: 'Saving changes…' }
  if (store.saveStatus.value === 'error') {
    return { type: 'error', text: `Could not save changes. ${store.error.value ?? ''} Retry the action to try again.` }
  }
  if (recentlySavedGoal.value) return { type: 'goal', text: 'Goal saved.' }
  if (store.saveStatus.value === 'saved') return { type: 'saved', text: 'All changes saved.' }
  return null
})

watch(() => match.value?.clock.status, (status, previousStatus) => {
  if (previousStatus === 'not-started' && status !== 'not-started') selectedPanel.value = 'events'
})

function handleGoalRecorded(result: CommittedGoalResult): void {
  refresh()
  recentlySavedGoal.value = result
}

function handleGoalEditorOpened(goalId: string): void {
  focusedGoalEditorId.value = goalId
  recentlySavedGoal.value = null
}

function handleClockUpdated(): void {
  refresh()
  recentlySavedGoal.value = null
}

function handleSubstitutionRecorded(): void {
  refresh()
  recentlySavedGoal.value = null
}

function handleSubstitutionEditorOpened(): void {
  focusedSubstitutionEditor.value = true
}

function handleSubstitutionEditorClosed(): void {
  focusedSubstitutionEditor.value = false
}

function openRecentlySavedGoal(): void {
  if (!recentlySavedGoal.value) return
  requestedGoalId.value = recentlySavedGoal.value.goalId
  recentlySavedGoal.value = null
}

function handleGoalEditRequestHandled(goalId: string): void {
  if (requestedGoalId.value === goalId) requestedGoalId.value = null
}

function setSelectedPanel(panel: 'events' | 'player-times', focus = false): void {
  selectedPanel.value = panel
  if (focus) {
    document.getElementById(panel === 'events' ? 'events-tab' : 'player-times-tab')?.focus()
  }
}

function onTabKeydown(event: KeyboardEvent): void {
  const keys: Record<string, 'events' | 'player-times'> = {
    ArrowLeft: 'events',
    ArrowRight: 'player-times',
    Home: 'events',
    End: 'player-times',
  }
  const panel = keys[event.key]
  if (!panel) return
  event.preventDefault()
  setSelectedPanel(panel, true)
}

function onActionBarResize(height: number): void {
  actionHeight.value = height
}
</script>

<template>
  <section v-if="match" class="match-ready-view" aria-labelledby="match-heading" :style="{ paddingBottom: `${actionHeight + 48}px` }">
    <header class="match-sticky-header">
      <MatchHeader
        :match="match"
        :home-score="score.home"
        :away-score="score.away"
        :minute="displayedMinute"
        :phase="clockStatusLabel"
        :period-label="periodLabel"
        @back="emit('back')"
        @clock-updated="handleClockUpdated"
      />
      <div class="match-panel-tabs" role="tablist" aria-label="Match panels" @keydown="onTabKeydown">
        <button
          id="events-tab"
          type="button"
          role="tab"
          aria-controls="events-panel"
          :aria-selected="selectedPanel === 'events'"
          :tabindex="selectedPanel === 'events' ? 0 : -1"
          @click="setSelectedPanel('events')"
        >Events</button>
        <button
          id="player-times-tab"
          type="button"
          role="tab"
          aria-controls="player-times-panel"
          :aria-selected="selectedPanel === 'player-times'"
          :tabindex="selectedPanel === 'player-times' ? 0 : -1"
          @click="setSelectedPanel('player-times')"
        >Player times</button>
      </div>
      <div
        v-if="matchSaveFeedback"
        class="save-feedback match-save-feedback"
        :class="`match-save-feedback--${matchSaveFeedback.type}`"
        :role="matchSaveFeedback.type === 'error' ? 'alert' : 'status'"
        :aria-live="matchSaveFeedback.type === 'error' ? 'assertive' : 'polite'"
      >
        <span>{{ matchSaveFeedback.text }}</span>
        <button v-if="matchSaveFeedback.type === 'goal'" type="button" @click="openRecentlySavedGoal">Add details</button>
      </div>
    </header>

    <div class="match-workspace-body">
      <ConfigureMatchSquad v-if="match.clock.status === 'not-started'" :match-id="match.id" />

      <section
        id="events-panel"
        class="match-panel"
        role="tabpanel"
        aria-labelledby="events-tab"
        tabindex="0"
        v-show="selectedPanel === 'events'"
      >
        <MatchTimeline
          :match-id="match.id"
          :requested-goal-id="requestedGoalId"
          @goal-edit-request-handled="handleGoalEditRequestHandled"
          @goal-editor-opened="handleGoalEditorOpened"
          @goal-editor-closed="focusedGoalEditorId = null"
          @substitution-editor-opened="handleSubstitutionEditorOpened"
          @substitution-editor-closed="handleSubstitutionEditorClosed"
        />
      </section>

      <section
        id="player-times-panel"
        class="match-panel"
        role="tabpanel"
        aria-labelledby="player-times-tab"
        tabindex="0"
        v-show="selectedPanel === 'player-times'"
      >
        <MatchLineupWidget v-if="match.participation" :match-id="match.id" />
        <div v-else class="untracked-player-times">
          <h2>Player times unavailable</h2>
          <p v-if="match.clock.status === 'not-started'">
            Player tracking can be set up before kickoff. The match can also start without player tracking.
          </p>
          <p v-else>Player tracking was not enabled for this match. Player times are not available.</p>
        </div>
      </section>

      <div class="ready-card-footer">
        <p>Changes are stored in this browser after each save completes.</p>
        <span class="ready-badge">THIS DEVICE ONLY</span>
      </div>
    </div>

    <MatchActionBar
      :match="match"
      :can-substitute="canSubstitute"
      @goal-recorded="handleGoalRecorded"
      @substitution-recorded="handleSubstitutionRecorded"
      @focused-editor-opened="handleSubstitutionEditorOpened"
      @focused-editor-closed="handleSubstitutionEditorClosed"
      @resize="onActionBarResize"
    />
  </section>
</template>

<style scoped>
.match-ready-view { width: min(100%, 64rem); min-height: 100vh; margin: 0 auto; color: #17251d; background: #fff; }
.match-sticky-header { position: sticky; z-index: 40; top: 0; border-bottom: 1px solid #dfe5dc; background: #fff; box-shadow: 0 5px 20px rgb(23 37 29 / 7%); }
.match-panel-tabs { display: grid; grid-template-columns: 1fr 1fr; gap: 4px; padding: 4px 12px 8px; background: #fff; }
.match-panel-tabs button { min-height: 48px; padding: 0 12px; color: #526156; background: transparent; border: 1px solid transparent; border-radius: 10px; font: inherit; font-size: 1rem; font-weight: 700; }
.match-panel-tabs button[aria-selected='true'] { color: #204d38; background: #edf3e8; border-color: #d6e1d1; }
.match-panel-tabs button:focus-visible, .match-panel:focus-visible { outline: 3px solid #5f8d2e; outline-offset: 2px; }
.match-workspace-body { padding: 8px 16px 24px; }
.match-panel { min-width: 0; }
.untracked-player-times { padding: 24px 4px; }
.untracked-player-times h2 { margin: 0 0 8px; font-size: 1.2rem; }
.untracked-player-times p { max-width: 42rem; margin: 0; color: #526156; font-size: 1rem; line-height: 1.5; }
.match-save-feedback { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin: 0; padding: 8px 16px; color: #204d38; background: #edf3e8; border-top: 1px solid #e4e8e0; font-size: 0.9rem; }
.match-save-feedback--error { color: #8a3028; background: #f8e9e6; }
.match-save-feedback button { min-height: 48px; padding: 0 14px; color: #fff; background: #204d38; border: 0; border-radius: 8px; font: inherit; font-weight: 700; }
.ready-card-footer { min-height: 3.9rem; display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-top: 16px; border-top: 1px solid #e4e8e0; }
.ready-card-footer p { margin: 0; color: #526156; font-size: 0.875rem; }
.ready-badge { color: #526156; font-size: 0.75rem; white-space: nowrap; }

@media (min-width: 680px) {
  .match-workspace-body { padding-right: 24px; padding-left: 24px; }
}
</style>
