<script setup lang="ts">
import { computed } from 'vue'
import {
  aggregatePlayerGoalStatistics,
  aggregatePlayerParticipation,
  useMatchStore,
  useMatchTime,
} from '../../../entities/match'
import { usePlayerStore } from '../../../entities/player'
import PlayerMatchBreakdown from './components/PlayerMatchBreakdown.vue'
import PlayerStatisticsSummary from './components/PlayerStatisticsSummary.vue'

const props = defineProps<{ playerId: string }>()
const emit = defineEmits<{
  back: []
  openMatch: [matchId: string]
}>()

const matchStore = useMatchStore()
const playerStore = usePlayerStore()
const { now } = useMatchTime()
const player = computed(() => playerStore.players.value.find((item) => item.id === props.playerId) ?? null)
const displayName = computed(() => {
  const current = player.value
  if (!current) return ''
  const sameName = playerStore.players.value.filter((item) =>
    item.name.trim().toLocaleLowerCase() === current.name.trim().toLocaleLowerCase(),
  )
  if (sameName.length < 2) return current.name

  const stableId = (id: string) => id.replace(/[^a-z0-9]/gi, '') || id
  const currentId = stableId(current.id)
  let length = Math.min(4, currentId.length)
  while (length < currentId.length && sameName.some((other) => other.id !== current.id
    && stableId(other.id).slice(0, length).toLowerCase() === currentId.slice(0, length).toLowerCase())) {
    length += 1
  }
  return `${current.name} · ${currentId.slice(0, length)}`
})
const statistics = computed(() => player.value
  ? aggregatePlayerParticipation(matchStore.matches.value, props.playerId, now.value)
  : null)
const goalStatistics = computed(() => player.value
  ? aggregatePlayerGoalStatistics(matchStore.matches.value, props.playerId)
  : null)
const untrackedMatches = computed(() => {
  const ids = new Set(statistics.value?.excludedMatches
    .filter((item) => item.reason === 'untracked')
    .map((item) => item.matchId) ?? [])
  return matchStore.matches.value
    .filter((match) => ids.has(match.id))
    .map((match) => ({
      id: match.id,
      teams: `${match.homeTeam} vs ${match.awayTeam}`,
      createdAt: match.createdAt,
    }))
    .sort((left, right) => right.createdAt - left.createdAt || left.id.localeCompare(right.id))
})

</script>

<template>
  <section class="player-statistics-page" aria-labelledby="player-statistics-heading">
    <button class="back-link" type="button" @click="emit('back')">
      <span aria-hidden="true">←</span> My players
    </button>

    <p v-if="!playerStore.ready.value || !matchStore.ready.value" class="statistics-loading" role="status" aria-live="polite">
      Loading player statistics…
    </p>
    <section v-else-if="!player" class="missing-player" role="alert">
      <p class="section-kicker">PLAYER HISTORY</p>
      <h1 id="player-statistics-heading">Player not found</h1>
      <p>This directory identity is unavailable. Saved match records have not been changed.</p>
    </section>

    <template v-else-if="statistics">
      <header class="player-heading">
        <div class="player-monogram" aria-hidden="true">{{ player.name.slice(0, 1).toUpperCase() }}</div>
        <div class="player-heading-copy">
          <p class="section-kicker">PLAYER HISTORY</p>
          <h1 id="player-statistics-heading">{{ displayName }}</h1>
          <span v-if="player.archived" class="archived-label">ARCHIVED PLAYER · HISTORY RETAINED</span>
          <p v-else class="identity-note">Statistics are connected to this player identity, not just their name.</p>
        </div>
        <span class="identity-mark" :title="`Player ID ${player.id}`">ID · {{ player.id.slice(0, 8) }}</span>
      </header>

      <PlayerStatisticsSummary
        :total-elapsed-ms="statistics.totalElapsedMs"
        :appearance-count="statistics.appearanceCount"
        :goal-count="goalStatistics?.goalCount ?? 0"
        :assist-count="goalStatistics?.assistCount ?? 0"
      />
      <PlayerMatchBreakdown
        :breakdowns="statistics.breakdowns"
        :untracked-matches="untrackedMatches"
        @open-match="emit('openMatch', $event)"
      />
    </template>
  </section>
</template>

<style scoped>
.player-statistics-page { max-width: 58rem; margin: 0 auto; padding: 2.6rem 0 3.5rem; }
.back-link { display: inline-flex; align-items: center; gap: 0.4rem; margin-bottom: 1.25rem; padding: 0; border: 0; background: transparent; color: #66766a; font-size: 0.75rem; }
.back-link:hover { color: var(--green); }
.player-heading { display: flex; align-items: center; gap: 1rem; padding: 1.3rem 0 1.5rem; border-bottom: 1px solid #dfe5dc; }
.player-monogram { width: 3.8rem; height: 3.8rem; display: grid; flex: 0 0 auto; place-items: center; border-radius: 50%; background: #e8f0e2; color: #3f6849; font-family: 'Space Grotesk', sans-serif; font-size: 1.4rem; }
.player-heading-copy { min-width: 0; flex: 1; }
.section-kicker { margin: 0 0 0.4rem; color: #849087; font-family: 'DM Mono', monospace; font-size: 0.55rem; letter-spacing: 0.1em; }
.player-heading h1 { margin: 0; color: #203629; font-family: 'Space Grotesk', sans-serif; font-size: clamp(1.6rem, 4vw, 2.35rem); letter-spacing: -0.055em; overflow-wrap: anywhere; }
.identity-note { margin: 0.4rem 0 0; color: #778379; font-size: 0.7rem; }
.archived-label { display: inline-block; margin-top: 0.45rem; padding: 0.2rem 0.4rem; border-radius: 999px; background: #eef0ec; color: #768076; font-family: 'DM Mono', monospace; font-size: 0.49rem; letter-spacing: 0.06em; }
.identity-mark { flex: 0 0 auto; color: #859087; font-family: 'DM Mono', monospace; font-size: 0.54rem; letter-spacing: 0.04em; }
.statistics-loading, .missing-player { padding: 2rem 0; color: #66766a; }
.missing-player h1 { margin: 0; color: #24382b; font-family: 'Space Grotesk', sans-serif; font-size: 1.8rem; }
.missing-player > p:last-child { font-size: 0.75rem; }

@media (max-width: 600px) {
  .player-statistics-page { padding: 2rem 0 2.5rem; }
  .player-heading { align-items: flex-start; flex-wrap: wrap; gap: 0.75rem; }
  .player-monogram { width: 3.1rem; height: 3.1rem; }
  .identity-mark { width: 100%; padding-left: 3.85rem; }
}
</style>
