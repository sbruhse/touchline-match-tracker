<script setup lang="ts">
import { computed } from 'vue'
import type { DeepReadonly } from 'vue'
import type { Match } from '../../../../entities/match'
import { createPlayerIdentityLabels } from '../../../../entities/player'

interface PlayerIdentityInput {
  id: string
  name: string
}

const props = defineProps<{
  match: DeepReadonly<Match>
  ownerPlayers: readonly PlayerIdentityInput[]
}>()

const participation = computed(() => props.match.participation)
const ownTeam = computed(() => {
  if (!participation.value) return null
  return participation.value.ownSide === 'home' ? props.match.homeTeam : props.match.awayTeam
})
const assignedCount = computed(() => props.match.jerseyAssignment?.rows.filter(({ jersey }) => jersey !== null).length ?? 0)
const squadLabels = computed(() => createPlayerIdentityLabels(
  (participation.value?.squad ?? []).map(({ playerId, nameSnapshot }) => ({ id: playerId, name: nameSnapshot })),
))
const ownerLabels = computed(() => {
  const knownIds = new Set(props.ownerPlayers.map(({ id }) => id))
  const unresolved = (props.match.jerseyAssignment?.rows ?? [])
    .flatMap(({ jersey }) => jersey?.ownerPlayerId ? [jersey.ownerPlayerId] : [])
    .filter((id) => !knownIds.has(id))
  return createPlayerIdentityLabels([
    ...props.ownerPlayers,
    ...[...new Set(unresolved)].map((id) => ({ id, name: 'Unavailable player' })),
  ])
})

function squadLabel(playerId: string): string {
  return squadLabels.value.get(playerId) ?? playerId
}

function ownerLabel(ownerPlayerId: string | null): string {
  if (ownerPlayerId === null) return 'Team'
  return ownerLabels.value.get(ownerPlayerId) ?? `Unavailable player · ${ownerPlayerId}`
}
</script>

<template>
  <section class="preparation-summary" aria-labelledby="preparation-summary-heading">
    <header class="summary-header">
      <div>
        <p class="summary-kicker">BEFORE KICKOFF</p>
        <h2 id="preparation-summary-heading">Preparation</h2>
      </div>
      <span class="optional-state">Optional</span>
    </header>

    <p class="summary-line">
      <strong>Squad</strong>
      <span v-if="participation">{{ ownTeam }} · {{ participation.starterIds.length }} starters / {{ participation.squad.length }} players</span>
      <span v-else>Not configured</span>
    </p>
    <p class="summary-line">
      <strong>Jerseys</strong>
      <span v-if="match.jerseyAssignment">
        Saved · {{ match.jerseyAssignment.setNameSnapshot }} · {{ assignedCount }} of {{ match.jerseyAssignment.rows.length }} assigned
      </span>
      <span v-else>Not prepared</span>
    </p>

    <details v-if="match.jerseyAssignment" class="accepted-snapshots">
      <summary>View saved jersey snapshots</summary>
      <ul>
        <li v-for="row in match.jerseyAssignment.rows" :key="row.playerId">
          <strong class="snapshot-player">
            <span v-if="row.jersey" class="assigned-number">#{{ row.jersey.number }}</span>
            <span>{{ squadLabel(row.playerId) }}</span>
          </strong>
          <span v-if="row.jersey">
            Size {{ row.jersey.size }} · Owned by {{ ownerLabel(row.jersey.ownerPlayerId) }}
          </span>
          <span v-else>No jersey assigned</span>
        </li>
      </ul>
    </details>
  </section>
</template>

<style scoped>
.preparation-summary { display: grid; gap: 0.65rem; min-width: 0; padding: 0.9rem 1rem; border: 1px solid #dfe5dc; border-radius: 0.5rem; background: #fbfcfa; }
.summary-header { display: flex; align-items: center; justify-content: space-between; gap: 0.8rem; }
.summary-kicker { margin: 0 0 0.2rem; color: #758176; font-family: 'DM Mono', monospace; font-size: 0.58rem; letter-spacing: 0.08em; }
.summary-header h2 { margin: 0; color: #20382a; font-family: 'Space Grotesk', sans-serif; font-size: 1rem; }
.optional-state { flex: 0 0 auto; color: #69766c; font-size: 0.75rem; }
.summary-line { display: grid; grid-template-columns: 5.5rem minmax(0, 1fr); gap: 0.45rem; margin: 0; color: #526156; font-size: 0.84rem; line-height: 1.45; overflow-wrap: anywhere; }
.summary-line strong { color: #33483a; }
.accepted-snapshots { border-top: 1px solid #e4e8e0; padding-top: 0.55rem; }
.accepted-snapshots summary { min-height: 2.5rem; display: flex; align-items: center; color: #315d38; font-size: 0.82rem; font-weight: 650; cursor: pointer; }
.accepted-snapshots ul { display: grid; gap: 0.4rem; margin: 0.5rem 0 0; padding: 0; list-style: none; }
.accepted-snapshots li { display: grid; gap: 0.1rem; color: #526156; font-size: 0.78rem; line-height: 1.4; overflow-wrap: anywhere; }
.accepted-snapshots li strong { color: #20382a; }
.snapshot-player { display: flex; flex-wrap: wrap; align-items: baseline; gap: 0.35rem; }
.assigned-number { color: #204d38; font-family: 'DM Mono', monospace; font-size: 1.08em; font-weight: 750; font-variant-numeric: tabular-nums; }
</style>
