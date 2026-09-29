<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import {
  formatMatchMinute,
  useMatchStore,
  type GoalEvent,
  type MatchPeriod,
  type SubstitutionEvent,
} from '../../../../entities/match'
import { GoalEventEditor } from '../../../../features/edit-goal'
import { SubstitutionEventEditor } from '../../../../features/edit-substitution'
import { AppIcon } from '../../../../shared/ui'

const props = defineProps<{ matchId: string; requestedGoalId?: string | null }>()
const emit = defineEmits<{
  goalEditRequestHandled: [goalId: string]
  goalEditorOpened: [goalId: string]
  goalEditorClosed: [goalId: string]
  substitutionEditorOpened: []
  substitutionEditorClosed: []
}>()
const store = useMatchStore()
const match = computed(() => store.matches.value.find((item) => item.id === props.matchId) ?? null)
const editingGoalId = ref<string | null>(null)
let lastRequestedGoalId: string | null = null

interface MatchTimelineGoal {
  type: 'goal'
  key: string
  id: string
  period: MatchPeriod
  elapsedMs: number
  goal: GoalEvent
}

interface MatchTimelineSubstitution {
  type: 'substitution'
  key: string
  id: string
  period: MatchPeriod
  elapsedMs: number
  sequence: number
  event: SubstitutionEvent
}

type MatchTimelineEvent = MatchTimelineGoal | MatchTimelineSubstitution

const events = computed<MatchTimelineEvent[]>(() => {
  const current = match.value
  if (!current) return []

  const goals = [...current.goals].sort((left, right) =>
    left.period - right.period
    || left.elapsedMs - right.elapsedMs
    || left.createdAt - right.createdAt
    || left.id.localeCompare(right.id),
  )
  const timelineGoals: MatchTimelineGoal[] = goals.map((goal) => ({
    type: 'goal',
    key: `goal:${goal.id}`,
    id: goal.id,
    period: goal.period,
    elapsedMs: goal.elapsedMs,
    goal,
  }))
  const timelineSubstitutions: MatchTimelineSubstitution[] = (current.participation?.substitutions ?? [])
    .map((event) => ({
      type: 'substitution',
      key: `substitution:${event.id}`,
      id: event.id,
      period: event.period,
      elapsedMs: event.elapsedMs,
      sequence: event.sequence,
      event,
    }))

  return [...timelineGoals, ...timelineSubstitutions].sort((left, right) =>
    right.period - left.period
    || right.elapsedMs - left.elapsedMs
    // Match the documented deterministic tie-break: goals precede substitutions.
    || (left.type === right.type ? 0 : left.type === 'goal' ? -1 : 1)
    || (left.type === 'goal' && right.type === 'goal'
      ? left.goal.createdAt - right.goal.createdAt || left.id.localeCompare(right.id)
      : left.type === 'substitution' && right.type === 'substitution'
        ? left.sequence - right.sequence || left.id.localeCompare(right.id)
        : 0),
  )
})

watch([() => props.requestedGoalId, events], ([requestedGoalId, currentEvents]) => {
  if (!requestedGoalId) {
    lastRequestedGoalId = null
  } else if (requestedGoalId !== lastRequestedGoalId
    && currentEvents.some((event) => event.type === 'goal' && event.id === requestedGoalId)) {
    editingGoalId.value = requestedGoalId
    lastRequestedGoalId = requestedGoalId
    emit('goalEditorOpened', requestedGoalId)
    emit('goalEditRequestHandled', requestedGoalId)
  }
}, { immediate: true })

const goalCount = computed(() => events.value.filter((event) => event.type === 'goal').length)
const substitutionCount = computed(() => events.value.filter((event) => event.type === 'substitution').length)
const playerNameById = computed(() => new Map(
  (match.value?.participation?.squad ?? []).map((player) => [player.playerId, player.nameSnapshot]),
))

function teamName(side: 'home' | 'away'): string {
  return side === 'home' ? match.value?.homeTeam ?? '' : match.value?.awayTeam ?? ''
}

function substitutionHeading(event: SubstitutionEvent): string {
  const outgoing = playerNameById.value.get(event.outgoingPlayerId) ?? event.outgoingPlayerId
  const incoming = playerNameById.value.get(event.incomingPlayerId) ?? event.incomingPlayerId
  return `${outgoing} off · ${incoming} on`
}

function timeLabel(period: MatchPeriod, elapsedMs: number): string {
  if (period === 2 && elapsedMs === 0) return 'HT'
  return formatMatchMinute(period, elapsedMs)
}

function timeAriaLabel(period: MatchPeriod, elapsedMs: number): string {
  if (period === 2 && elapsedMs === 0) return 'Half-time, second half 00:00'
  return `${period === 1 ? 'First' : 'Second'} half ${formatMatchMinute(period, elapsedMs)}`
}

function openGoalEditor(goalId: string): void {
  editingGoalId.value = goalId
  emit('goalEditorOpened', goalId)
}

function closeGoalEditor(goalId: string): void {
  if (editingGoalId.value !== goalId) return
  editingGoalId.value = null
  emit('goalEditorClosed', goalId)
}
</script>

<template>
  <section v-if="match" class="match-timeline" aria-labelledby="timeline-heading">
    <div class="timeline-heading-row">
      <div>
        <p class="section-kicker">EVERY MOMENT</p>
        <h2 id="timeline-heading">Match timeline</h2>
      </div>
      <span class="timeline-count">
        {{ goalCount.toString().padStart(2, '0') }} GOALS · {{ substitutionCount.toString().padStart(2, '0') }} EXCHANGES
      </span>
    </div>

    <ol v-if="events.length" class="timeline-event-list" aria-label="Goals and substitutions, newest first">
      <li
        v-for="event in events"
        :key="event.key"
        class="timeline-event"
        :class="event.type === 'goal' ? 'goal-event' : 'substitution-event'"
        :data-event-type="event.type"
        :data-event-id="event.id"
      >
        <template v-if="event.type === 'goal'">
          <div class="timeline-event-heading goal-event-heading">
            <div class="timeline-event-label goal-event-team">
              <AppIcon class="event-icon goal-event-icon" name="football" />
              <span class="event-kind">Goal</span>
              <strong>{{ teamName(event.goal.side) }}</strong>
              <span v-if="event.goal.scorer" class="goal-scorer">{{ event.goal.scorer }}</span>
            </div>
            <time
              class="timeline-event-time goal-event-time"
              :datetime="`P${event.period}T${event.elapsedMs}MS`"
              :aria-label="timeAriaLabel(event.period, event.elapsedMs)"
            >{{ timeLabel(event.period, event.elapsedMs) }}</time>
          </div>
          <div class="timeline-event-actions">
            <GoalEventEditor
              :match-id="match.id"
              :goal="event.goal"
              :home-team="match.homeTeam"
              :away-team="match.awayTeam"
              :open="editingGoalId === event.id"
              @open="openGoalEditor(event.id)"
              @close="closeGoalEditor(event.id)"
            />
          </div>
        </template>

        <template v-else>
          <div class="timeline-event-heading substitution-event-heading">
            <div class="timeline-event-label substitution-event-label">
              <AppIcon class="event-icon substitution-event-icon" name="exchange" />
              <span class="event-kind">Substitution</span>
              <strong>{{ teamName(match.participation?.ownSide ?? 'home') }}</strong>
              <span class="exchange-players">{{ substitutionHeading(event.event) }}</span>
            </div>
            <time
              class="timeline-event-time substitution-event-time"
              :datetime="`P${event.period}T${event.elapsedMs}MS`"
              :aria-label="timeAriaLabel(event.period, event.elapsedMs)"
            >{{ timeLabel(event.period, event.elapsedMs) }}</time>
          </div>
          <div class="timeline-event-actions">
            <SubstitutionEventEditor
              :match-id="match.id"
              :event-id="event.id"
              @editor-opened="emit('substitutionEditorOpened')"
              @editor-closed="emit('substitutionEditorClosed')"
            />
          </div>
        </template>
      </li>
    </ol>

    <div v-else class="timeline-empty">
      <span aria-hidden="true">○</span>
      <p>Goals and substitutions will appear here as the match unfolds.</p>
    </div>
  </section>
</template>

<style scoped>
.match-timeline { padding: 1.5rem 0 1.6rem; }
.timeline-heading-row { display: flex; align-items: end; justify-content: space-between; gap: 1rem; margin-bottom: 0.9rem; }
.timeline-heading-row h2 { margin: 0; font-family: 'Space Grotesk', sans-serif; font-size: 1.3rem; letter-spacing: -0.04em; }
.section-kicker { margin: 0 0 0.55rem; color: #849087; font-family: 'DM Mono', monospace; font-size: 0.58rem; letter-spacing: 0.1em; }
.timeline-count { padding-bottom: 0.2rem; color: #8b958c; font-family: 'DM Mono', monospace; font-size: 0.56rem; letter-spacing: 0.08em; white-space: nowrap; }
.timeline-event-list { display: grid; gap: 0.7rem; margin: 0; padding: 0; list-style: none; }
.timeline-event { overflow: hidden; border: 1px solid #e4e9e1; border-radius: 0.45rem; background: #fff; }
.timeline-event-heading { min-height: 3.5rem; display: flex; align-items: center; justify-content: space-between; gap: 1rem; padding: 0.7rem 1rem; }
.timeline-event-label { display: flex; align-items: center; flex-wrap: wrap; gap: 0.45rem; min-width: 0; }
.event-icon { flex: 0 0 auto; }
.goal-event-icon { color: #56794f; }
.substitution-event-icon { color: #657f69; }
.event-kind { color: #526156; font-size: 0.875rem; font-weight: 700; white-space: nowrap; }
.substitution-event .event-kind { background: #edf0eb; color: #657166; }
.timeline-event-label strong { overflow: hidden; color: #304235; font-size: 0.76rem; text-overflow: ellipsis; white-space: nowrap; }
.goal-scorer { color: #526156; font-size: 0.875rem; }
.exchange-players { flex-basis: 100%; padding-left: 1.7rem; color: #59685d; font-size: 0.68rem; }
.timeline-event-actions { padding: 0 12px 12px; }
.timeline-event-time { flex: 0 0 auto; color: #214a35; font-family: 'Space Grotesk', sans-serif; font-size: 1rem; font-weight: 600; }
.substitution-event-time { color: #596d5d; }
.timeline-empty { min-height: 4.5rem; display: flex; align-items: center; gap: 0.7rem; padding: 0.7rem 0; color: #89938a; }
.timeline-empty > span { color: #8fa17d; font-size: 1.4rem; }
.timeline-empty p { margin: 0; font-size: 0.76rem; }

@media (max-width: 620px) {
  .timeline-heading-row { flex-direction: column; align-items: flex-start; gap: 0.45rem; }
  .timeline-event-heading { align-items: flex-start; padding: 0.7rem; }
  .timeline-count { text-align: left; white-space: normal; }
}

@media (min-width: 680px) {
  .timeline-event-actions { padding-right: 16px; padding-left: 16px; }
}
</style>
