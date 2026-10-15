<script setup lang="ts">
import { computed } from 'vue'
import type { DeepReadonly } from 'vue'
import type { MatchJerseyAssignment, MatchSquadPlayer } from '../../../../entities/match'
import { createPlayerIdentityLabels } from '../../../../entities/player'
import type { PlayerIdentityInput } from '../types'

const props = defineProps<{
  assignment: DeepReadonly<MatchJerseyAssignment> | null
  squad: readonly Pick<DeepReadonly<MatchSquadPlayer>, 'playerId' | 'nameSnapshot'>[]
  ownerPlayers: readonly PlayerIdentityInput[]
}>()

const wearerLabels = computed(() => createPlayerIdentityLabels(
  props.squad.map(({ playerId, nameSnapshot }) => ({ id: playerId, name: nameSnapshot })),
))
const ownerLabels = computed(() => {
  const knownIds = new Set(props.ownerPlayers.map(({ id }) => id))
  const unresolved = (props.assignment?.rows ?? [])
    .flatMap(({ jersey }) => jersey?.ownerPlayerId ? [jersey.ownerPlayerId] : [])
    .filter((id) => !knownIds.has(id))
  const unresolvedIdentities = [...new Set(unresolved)].map((id) => ({ id, name: 'Unavailable player' }))
  const identities = [
    ...props.ownerPlayers,
    ...unresolvedIdentities,
  ]
  return createPlayerIdentityLabels(identities)
})

function wearerLabel(playerId: string): string {
  return wearerLabels.value.get(playerId) ?? playerId
}

function ownerLabel(ownerPlayerId: string | null): string {
  if (ownerPlayerId === null) return 'Team'
  return ownerLabels.value.get(ownerPlayerId) ?? `Unavailable player · ${ownerPlayerId}`
}
</script>

<template>
  <section class="jersey-summary" aria-labelledby="jersey-summary-heading">
    <header class="summary-heading">
      <div>
        <h2 id="jersey-summary-heading">Jersey assignments</h2>
        <p v-if="assignment" class="summary-set">{{ assignment.setNameSnapshot }}</p>
      </div>
       <span v-if="assignment" class="saved-state">Saved</span>
    </header>

    <p v-if="!assignment" class="no-saved-assignment">No jersey distribution was accepted for this match.</p>
    <ul v-else class="summary-rows" aria-label="Saved jersey assignments">
      <li v-for="row in assignment.rows" :key="row.playerId" class="summary-row">
        <strong class="wearer-name">
          <span v-if="row.jersey" class="assigned-number">#{{ row.jersey.number }}</span>
          <span>{{ wearerLabel(row.playerId) }}</span>
        </strong>
        <span v-if="row.jersey" class="jersey-details">
          Size {{ row.jersey.size }} · Owned by {{ ownerLabel(row.jersey.ownerPlayerId) }}
        </span>
        <span v-else class="unassigned-label">No jersey assigned</span>
      </li>
    </ul>
  </section>
</template>

<style scoped>
.jersey-summary { min-width: 0; display: grid; gap: 0.85rem; padding: 1rem; border: 1px solid #dfe5dc; border-radius: 0.6rem; background: #fff; }
.summary-heading { display: flex; align-items: flex-start; justify-content: space-between; gap: 0.8rem; }
.summary-heading h2 { margin: 0; color: #20382a; font-family: 'Space Grotesk', sans-serif; font-size: 1.2rem; letter-spacing: -0.025em; }
.summary-set { margin: 0.3rem 0 0; color: #66756a; font-size: 0.9rem; overflow-wrap: anywhere; }
.saved-state { flex: 0 0 auto; padding: 0.35rem 0.55rem; border-radius: 999px; background: #edf3e8; color: #204d38; font-size: 0.78rem; font-weight: 700; }
.summary-rows { display: grid; gap: 0.5rem; margin: 0; padding: 0; list-style: none; }
.summary-row { display: grid; min-width: 0; gap: 0.25rem; padding: 0.65rem 0.7rem; border-left: 3px solid #c8d8c3; background: #f7f9f5; }
.wearer-name { display: flex; flex-wrap: wrap; align-items: baseline; gap: 0.35rem 0.55rem; color: #263d2d; font-size: 0.95rem; line-height: 1.4; overflow-wrap: anywhere; }
.assigned-number { flex: 0 0 auto; color: #204d38; font-family: 'DM Mono', monospace; font-size: 1.08em; font-weight: 750; font-variant-numeric: tabular-nums; }
.jersey-details, .unassigned-label, .no-saved-assignment { color: #5b6a60; font-size: 0.88rem; line-height: 1.5; overflow-wrap: anywhere; }
.unassigned-label { color: #78271f; }
.no-saved-assignment { margin: 0; }
</style>
