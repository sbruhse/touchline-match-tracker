<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import {
  type MatchSide,
  useMatchStore,
} from '../../../entities/match'
import { usePlayerStore } from '../../../entities/player'
import {
  buildMatchParticipation,
  disableMatchParticipationSetup,
  persistMatchParticipationSetup,
  type MatchSquadPlayerChoice,
  type MatchSquadDraft,
} from '../model/configureMatchSquad'
import type { SquadWorkflowNavigationIntent, SquadWorkflowPresentation } from '../model/workflow'
import MatchSquadEditor from './components/MatchSquadEditor.vue'

const props = withDefaults(defineProps<{
  matchId: string
  presentation?: SquadWorkflowPresentation
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
  navigationIntent: [intent: SquadWorkflowNavigationIntent]
}>()
const matchStore = useMatchStore()
const playerStore = usePlayerStore()
const editing = ref(false)
const ownSide = ref<MatchSide | ''>('')
const squadPlayerIds = ref<string[]>([])
const starterIds = ref<string[]>([])
const committedDraft = ref<MatchSquadDraft>({ ownSide: '', squadPlayerIds: [], starterIds: [] })
const localError = ref<string | null>(null)

const match = computed(() => matchStore.matches.value.find((item) => item.id === props.matchId) ?? null)
const canConfigure = computed(() => match.value?.clock.status === 'not-started' && match.value.clock.period === 1)
const setup = computed(() => match.value?.participation ?? null)
const choices = computed<MatchSquadPlayerChoice[]>(() => {
  const members = new Map<string, MatchSquadPlayerChoice>()
  for (const player of playerStore.players.value) {
    const existingMember = setup.value?.squad.find((member) => member.playerId === player.id)
    if (!player.archived || existingMember) {
        members.set(player.id, {
          id: player.id,
          name: existingMember?.nameSnapshot ?? player.name,
          label: existingMember?.nameSnapshot ?? player.name,
          archived: player.archived,
      })
    }
  }
  for (const member of setup.value?.squad ?? []) {
    if (!members.has(member.playerId)) {
      members.set(member.playerId, {
        id: member.playerId,
        name: member.nameSnapshot,
        label: member.nameSnapshot,
        archived: true,
      })
    }
  }
  const players = [...members.values()]
  const byName = new Map<string, MatchSquadPlayerChoice[]>()
  for (const player of players) {
    const key = player.name.trim().toLocaleLowerCase()
    byName.set(key, [...(byName.get(key) ?? []), player])
  }
  const labels = new Map<string, string>()
  for (const group of byName.values()) {
    for (const player of group) {
      if (group.length === 1) {
        labels.set(player.id, player.name)
        continue
      }
      const normalizedId = player.id.replace(/[^a-z0-9]/gi, '') || player.id
      let length = Math.min(4, normalizedId.length)
      while (length < normalizedId.length && group.some((other) => other.id !== player.id
        && (other.id.replace(/[^a-z0-9]/gi, '') || other.id).slice(0, length).toLowerCase() === normalizedId.slice(0, length).toLowerCase())) {
        length += 1
      }
      labels.set(player.id, `${player.name} · ${normalizedId.slice(0, length)}`)
    }
  }
  return players.map((player) => ({ ...player, label: labels.get(player.id) ?? player.name }))
})
const savedStarterNames = computed(() => {
  if (!setup.value) return []
  const nameById = new Map(setup.value.squad.map((player) => [player.playerId, player.nameSnapshot]))
  return setup.value.starterIds.map((id) => nameById.get(id) ?? id)
})
const saveError = computed(() => localError.value
  ?? (matchStore.saveStatus.value === 'error' ? matchStore.error.value : null))
const draftDirty = computed(() => editing.value
  && JSON.stringify(currentDraft()) !== JSON.stringify(committedDraft.value))

watch(draftDirty, (dirty) => emit('dirtyChange', dirty), { immediate: true })

watch([() => props.matchId, () => props.presentation, () => Boolean(match.value)], ([, presentation, loaded]) => {
  localError.value = null
  if (presentation === 'workflow' && loaded) {
    beginEditing()
  } else {
    editing.value = false
  }
}, { immediate: true })

watch(() => props.discardDraftToken, (token, previousToken) => {
  if (token !== previousToken && props.presentation === 'workflow' && match.value) beginEditing()
})

function beginEditing(): void {
  const participation = setup.value
  ownSide.value = participation?.ownSide ?? ''
  squadPlayerIds.value = participation?.squad.map((player) => player.playerId) ?? []
  starterIds.value = participation ? [...participation.starterIds] : []
  committedDraft.value = currentDraft()
  localError.value = null
  editing.value = true
}

function toggleSquadPlayer(playerId: string, checked: boolean): void {
  squadPlayerIds.value = checked
    ? [...squadPlayerIds.value, playerId]
    : squadPlayerIds.value.filter((id) => id !== playerId)
  if (!checked) starterIds.value = starterIds.value.filter((id) => id !== playerId)
  localError.value = null
}

function toggleStarter(playerId: string, checked: boolean): void {
  starterIds.value = checked
    ? [...starterIds.value, playerId]
    : starterIds.value.filter((id) => id !== playerId)
  localError.value = null
}

function updateOwnSide(side: MatchSide): void {
  ownSide.value = side
  localError.value = null
}

function cancelEditing(): void {
  editing.value = false
  localError.value = null
}

function currentDraft(): MatchSquadDraft {
  return {
    ownSide: ownSide.value,
    squadPlayerIds: [...squadPlayerIds.value],
    starterIds: [...starterIds.value],
  }
}

async function saveSetup(): Promise<void> {
  const current = match.value
  if (!current) return
  localError.value = null
  const built = buildMatchParticipation(currentDraft(), playerStore.players.value, current.participation)
  if (!built.valid) {
    localError.value = built.error
    return
  }
  try {
    await persistMatchParticipationSetup(current, built.participation, matchStore)
    committedDraft.value = currentDraft()
    if (props.presentation === 'standalone') editing.value = false
    emit('saved', current.id)
  } catch (error) {
    localError.value = error instanceof Error ? error.message : 'Could not save the match squad.'
  }
}

function continueWithoutSaving(): void {
  const intent: SquadWorkflowNavigationIntent = setup.value ? 'keep' : 'skip'
  emit('navigationIntent', intent)
}

async function disableTracking(): Promise<void> {
  const current = match.value
  if (!current) return
  localError.value = null
  try {
    await disableMatchParticipationSetup(current, matchStore)
    if (props.presentation === 'workflow') {
      ownSide.value = ''
      squadPlayerIds.value = []
      starterIds.value = []
      committedDraft.value = currentDraft()
    }
    emit('saved', current.id)
  } catch (error) {
    localError.value = error instanceof Error ? error.message : 'Could not disable player tracking.'
  }
}

async function retryPlayerDirectory(): Promise<void> {
  localError.value = null
  try {
    await playerStore.load()
  } catch (error) {
    localError.value = error instanceof Error
      ? `Could not load the player directory. ${error.message}`
      : 'Could not load the player directory. Try again.'
  }
}
</script>

<template>
  <section v-if="match" class="squad-setup" aria-labelledby="squad-setup-heading" :aria-hidden="!activeStep">
    <div class="squad-heading-row">
      <div>
        <p class="section-kicker">OPTIONAL MATCH TRACKING</p>
        <h2 id="squad-setup-heading">Match squad</h2>
      </div>
      <span v-if="setup" class="tracking-badge">PLAYER TRACKING ON</span>
    </div>

    <div v-if="presentation === 'workflow' && setup && !playerStore.ready.value" class="squad-state" role="status" aria-live="polite">
      {{ playerStore.loading.value ? 'Your player directory is loading. Saved squad choices remain available.' : `Your player directory is unavailable${playerStore.error.value ? `: ${playerStore.error.value}.` : '.'} Saved squad choices remain available.` }}
      <button type="button" :disabled="playerStore.loading.value || playerStore.saving.value" @click="retryPlayerDirectory">Try again</button>
    </div>

    <div v-else-if="presentation !== 'workflow' && !playerStore.ready.value" class="squad-state" role="status" aria-live="polite">
      {{ playerStore.loading.value ? 'Loading your player directory…' : `Your player directory is unavailable${playerStore.error.value ? `: ${playerStore.error.value}` : '.'}` }}
      <button type="button" :disabled="playerStore.loading.value || playerStore.saving.value" @click="retryPlayerDirectory">Try again</button>
    </div>

    <p v-else-if="!setup && !canConfigure" class="squad-locked-note" role="status">
      Player tracking is unavailable for this match because kickoff has already happened. Goals and the match clock remain available.
    </p>

    <template v-if="presentation === 'workflow' && canConfigure && !setup && (!playerStore.ready.value || choices.length === 0)">
      <p class="squad-source-guidance" role="status" aria-live="polite">
        <template v-if="playerStore.loading.value">Loading your player directory. You can skip player tracking while it loads.</template>
        <template v-else-if="playerStore.ready.value">No players are registered yet. Add players in My players to configure a squad; you can skip tracking for now.</template>
        <template v-else>Your player directory is unavailable{{ playerStore.error.value ? `: ${playerStore.error.value}` : '.' }} Retry loading it, or skip player tracking for now.</template>
      </p>
      <button
        v-if="!playerStore.ready.value"
        class="secondary-button"
        type="button"
        :disabled="playerStore.loading.value || playerStore.saving.value"
        @click="retryPlayerDirectory"
      >Try again</button>
      <button class="quiet-button" type="button" :disabled="matchStore.saving.value" @click="continueWithoutSaving">Skip player tracking</button>
    </template>

    <template v-else-if="(presentation === 'workflow' || playerStore.ready.value) && !editing && setup">
      <div class="saved-squad-summary" data-testid="saved-squad-summary">
        <p><strong>Your side:</strong> {{ setup.ownSide === 'home' ? match.homeTeam : match.awayTeam }}</p>
        <p><strong>Starters:</strong> {{ savedStarterNames.join(', ') }}</p>
        <p><strong>Match squad:</strong> {{ setup.squad.map((player) => player.nameSnapshot).join(', ') }}</p>
      </div>
      <div v-if="canConfigure" class="saved-setup-actions">
        <button class="secondary-button" type="button" :disabled="matchStore.saving.value" @click="beginEditing">Edit match squad</button>
        <button class="quiet-button" type="button" :disabled="matchStore.saving.value" @click="disableTracking">Disable player tracking</button>
      </div>
      <p v-else class="squad-locked-note">Squad and starters are locked after kickoff. Substitution history remains match-local.</p>
    </template>

    <template v-else-if="(presentation === 'workflow' || playerStore.ready.value) && !editing && canConfigure">
      <p class="squad-intro">Track your own side's players in this match. Your opponent does not need a player list.</p>
      <p v-if="!choices.length" class="squad-empty-directory">Add players in My players before configuring a tracked lineup.</p>
      <button class="primary-button" type="button" :disabled="!playerStore.ready.value || matchStore.saving.value" @click="beginEditing">
        Set up player tracking
      </button>
    </template>

    <MatchSquadEditor
      v-else-if="editing && (presentation === 'workflow' || playerStore.ready.value)"
      :home-team="match.homeTeam"
      :away-team="match.awayTeam"
      :own-side="ownSide"
      :squad-player-ids="squadPlayerIds"
      :starter-ids="starterIds"
      :choices="choices"
      :disabled="matchStore.saving.value"
      :saving="matchStore.saving.value"
      :error="saveError"
      :save-label="presentation === 'workflow' ? 'Save squad and continue' : 'Save match squad'"
      :cancel-label="presentation === 'workflow' ? (setup ? 'Keep saved squad and continue' : 'Skip player tracking') : 'Cancel'"
      @update-own-side="updateOwnSide"
      @toggle-squad-player="toggleSquadPlayer($event.playerId, $event.checked)"
      @toggle-starter="toggleStarter($event.playerId, $event.checked)"
      @save="saveSetup"
      @cancel="presentation === 'workflow' ? continueWithoutSaving() : cancelEditing()"
    />
    <div v-if="presentation === 'workflow' && setup && canConfigure" class="workflow-squad-actions">
      <button class="quiet-button" type="button" :disabled="matchStore.saving.value" @click="disableTracking">Disable player tracking</button>
    </div>
  </section>
</template>

<style scoped>
.squad-setup { margin-top: 1.1rem; padding: 1.25rem; border: 1px solid #e4e8e0; border-radius: 0.55rem; background: #f2f4ef; }
.squad-heading-row { display: flex; align-items: end; justify-content: space-between; gap: 0.8rem; margin-bottom: 0.8rem; }
.section-kicker { margin: 0 0 0.4rem; color: #526156; font-family: 'DM Sans', sans-serif; font-size: 0.72rem; font-weight: 700; letter-spacing: 0.04em; }
.squad-heading-row h2 { margin: 0; color: #17251d; font-family: 'Space Grotesk', sans-serif; font-size: 1.4rem; letter-spacing: -0.04em; }
.tracking-badge { padding: 0.35rem 0.55rem; border-radius: 999px; background: #eaf2e4; color: #315d38; font-family: 'DM Sans', sans-serif; font-size: 0.7rem; font-weight: 700; white-space: nowrap; }
.squad-intro, .squad-locked-note, .squad-state, .squad-source-guidance { color: #526156; font-size: 0.92rem; line-height: 1.5; }
.squad-intro { margin: 0 0 0.8rem; }
.squad-locked-note { margin: 0.65rem 0 0; }
.squad-source-guidance { margin: 0.65rem 0; }
.squad-state button { min-height: 3rem; padding: 0.4rem 0.8rem; border: 1px solid #cbd7ca; border-radius: 0.35rem; background: #fff; color: #204d38; font: inherit; font-weight: 650; }
.squad-empty-directory, .no-directory-players { color: #526156; font-size: 0.9rem; line-height: 1.45; }
.saved-squad-summary { display: grid; gap: 0.4rem; padding: 0.7rem 0; }
.saved-squad-summary p { margin: 0; color: #526156; font-size: 0.92rem; line-height: 1.45; overflow-wrap: anywhere; }
.saved-squad-summary strong { color: #17251d; }
.saved-setup-actions, .squad-form-actions { display: flex; flex-wrap: wrap; gap: 0.5rem; margin-top: 0.7rem; }
.workflow-squad-actions { margin-top: 0.65rem; }
.primary-button, .secondary-button, .quiet-button { min-height: 3rem; padding: 0.45rem 0.8rem; border-radius: 0.35rem; font-size: 0.9rem; font-weight: 650; }
.primary-button { border: 0; background: var(--green); color: #fff; }
.secondary-button { border: 1px solid #d9e1d5; background: #fff; color: #405748; }
.quiet-button { border: 1px solid transparent; background: transparent; color: #718075; }
.primary-button:disabled, .secondary-button:disabled, .quiet-button:disabled { cursor: not-allowed; opacity: 0.5; }

@media (max-width: 520px) {
  .squad-setup { padding: 1rem 0.8rem; }
  .saved-setup-actions > button { flex: 1; }
}
</style>
