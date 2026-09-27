<script setup lang="ts">
import { computed } from 'vue'
import type { DeepReadonly } from 'vue'
import {
  calculateParticipationPlayingTime,
  formatPlayingTime,
  getElapsedMs,
  useMatchStore,
  useMatchTime,
  type MatchParticipation,
} from '../../../entities/match'
import type { LineupPlayerRow } from './LineupPlayerList.vue'
import LineupPlayerList from './LineupPlayerList.vue'

const props = defineProps<{ matchId: string }>()
const store = useMatchStore()
const { now } = useMatchTime()
const match = computed(() => store.matches.value.find((item) => item.id === props.matchId) ?? null)
function participationSnapshot(participation: DeepReadonly<MatchParticipation>): MatchParticipation {
  return {
    ownSide: participation.ownSide,
    squad: participation.squad.map((player) => ({ ...player })),
    starterIds: [...participation.starterIds],
    substitutions: participation.substitutions.map((event) => ({ ...event })),
  }
}
const calculation = computed(() => {
  const current = match.value
  if (!current?.participation) return null
  return calculateParticipationPlayingTime(
    participationSnapshot(current.participation),
    current.participation.substitutions,
    {
      clock: current.clock,
      currentElapsedMs: getElapsedMs(current.clock, now.value),
      completedPeriodElapsedMs: current.completedPeriodElapsedMs,
    },
  )
})
const labelsById = computed(() => {
  const participation = match.value?.participation
  if (!participation) return new Map<string, string>()
  const byName = new Map<string, string[]>()
  const nameById = new Map(participation.squad.map((player) => [player.playerId, player.nameSnapshot]))
  for (const player of participation.squad) {
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
  return labels
})
const playerRows = computed<LineupPlayerRow[]>(() => {
  const participation = match.value?.participation
  const result = calculation.value
  if (!participation || !result?.valid) return []
  return participation.squad.map(({ playerId }) => {
    const time = result.playerTimes.find((item) => item.playerId === playerId)
    const elapsedMs = time?.elapsedMs ?? 0
    return {
      playerId,
      label: labelsById.value.get(playerId) ?? playerId,
      elapsedMs,
      playingTime: formatPlayingTime(elapsedMs),
      liveContribution: time?.liveContribution ?? false,
    }
  })
})
const onPitchRows = computed(() => {
  const onPitch = new Set(calculation.value?.valid ? calculation.value.lineup : [])
  return playerRows.value.filter((player) => onPitch.has(player.playerId))
})
const benchRows = computed(() => {
  const onPitch = new Set(calculation.value?.valid ? calculation.value.lineup : [])
  return playerRows.value.filter((player) => !onPitch.has(player.playerId))
})
const lineupTitle = computed(() => {
  if (!calculation.value?.valid) return 'Lineup'
  if (calculation.value.lineupStatus === 'planned') return 'Planned lineup'
  if (calculation.value.lineupStatus === 'final') return 'Final lineup'
  return 'Current lineup'
})
const matchStateLabel = computed(() => {
  switch (match.value?.clock.status) {
    case 'not-started': return 'PLANNED'
    case 'running': return 'LIVE'
    case 'paused': return 'PAUSED'
    case 'halftime': return 'HALF-TIME'
    case 'full-time': return 'FULL TIME'
    default: return ''
  }
})
const lineupStateBadge = computed(() => {
  if (match.value?.clock.status === 'full-time') return 'FINAL'
  if (match.value?.clock.status === 'not-started') return 'READY'
  return matchStateLabel.value
})
</script>

<template>
  <section v-if="match?.participation" class="match-lineup" aria-labelledby="match-lineup-heading">
    <div class="lineup-heading-row">
      <div>
        <p class="section-kicker">Player times for {{ match.participation.ownSide === 'home' ? match.homeTeam : match.awayTeam }}</p>
        <h2 id="match-lineup-heading">{{ lineupTitle }}</h2>
      </div>
      <span class="lineup-live-badge">{{ lineupStateBadge }}</span>
    </div>

    <p v-if="calculation && !calculation.valid" class="lineup-error" role="alert" aria-live="assertive">
      Lineup history needs attention: {{ calculation.conflict.reason }}
    </p>
    <div v-else class="lineup-groups" role="timer" aria-label="Player match times" aria-live="off">
      <LineupPlayerList title="On the pitch" :players="onPitchRows" empty-message="No players are currently on the pitch." />
      <LineupPlayerList title="On the bench" :players="benchRows" empty-message="No players are on the bench." />
    </div>
    <p v-if="match.clock.status === 'halftime'" class="halftime-note">Half-time changes apply to the second-half lineup; the break adds no playing time.</p>
  </section>
</template>

<style scoped>
.match-lineup { margin-top: 1rem; padding: 1.15rem; border: 1px solid #e4e9e1; border-radius: 0.75rem; background: #f8faf6; }
.lineup-heading-row { display: flex; align-items: end; justify-content: space-between; gap: 0.8rem; margin-bottom: 0.75rem; }
.section-kicker { margin: 0 0 0.35rem; color: #526156; font-size: 0.875rem; }
.lineup-heading-row h2 { margin: 0; color: #24382b; font-family: 'Space Grotesk', sans-serif; font-size: 1.25rem; letter-spacing: -0.04em; }
.lineup-live-badge { padding: 0.3rem 0.55rem; border-radius: 999px; background: #e8f1e3; color: #34533a; font-size: 0.875rem; font-weight: 700; white-space: nowrap; }
.lineup-groups { display: grid; grid-template-columns: 1fr 1fr; gap: 0.8rem; }
.lineup-error { margin: 0; padding: 0.6rem 0.7rem; border-radius: 0.3rem; background: #f8e9e6; color: #8a3d34; font-size: 0.72rem; }
.halftime-note { margin: 0.7rem 0 0; color: #526156; font-size: 0.9rem; line-height: 1.5; }

@media (max-width: 620px) {
  .match-lineup { padding: 1rem 0.75rem; }
  .lineup-groups { grid-template-columns: 1fr; }
}
</style>
