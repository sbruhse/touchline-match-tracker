<script setup lang="ts">
import type { MatchSquadPlayerChoice } from '../../model/configureMatchSquad'

const props = defineProps<{
  choices: MatchSquadPlayerChoice[]
  squadPlayerIds: string[]
  starterIds: string[]
  disabled: boolean
}>()
const emit = defineEmits<{
  toggleSquadPlayer: [payload: { playerId: string; checked: boolean }]
  toggleStarter: [payload: { playerId: string; checked: boolean }]
}>()

function isSelected(playerId: string): boolean {
  return props.squadPlayerIds.includes(playerId)
}

function isStarter(playerId: string): boolean {
  return props.starterIds.includes(playerId)
}

function checked(event: Event): boolean {
  return (event.target as HTMLInputElement).checked
}
</script>

<template>
  <div v-if="choices.length" class="player-choice-items">
    <div v-for="player in choices" :key="player.id" class="player-choice" :data-player-choice="player.id">
      <label class="squad-player-label">
        <input
          type="checkbox"
          :checked="isSelected(player.id)"
          :disabled="disabled"
          :aria-label="`Include ${player.label} in match squad`"
          @change="emit('toggleSquadPlayer', { playerId: player.id, checked: checked($event) })"
        />
        <span>{{ player.label }}<small v-if="player.archived"> · Archived match member</small></span>
      </label>
      <label class="starter-choice">
        <input
          type="checkbox"
          :checked="isStarter(player.id)"
          :disabled="disabled || !isSelected(player.id)"
          :aria-label="`Select ${player.label} as a starter`"
          @change="emit('toggleStarter', { playerId: player.id, checked: checked($event) })"
        />
        <span>Starter</span>
      </label>
    </div>
  </div>
  <p v-else class="no-directory-players">No active players are available. Add players from My players first.</p>
</template>

<style scoped>
.player-choice-items { display: grid; gap: 0.4rem; }
.player-choice { display: flex; align-items: center; justify-content: space-between; gap: 0.8rem; min-height: 3rem; padding: 0.45rem 0.65rem; border: 1px solid #e4e8e0; border-radius: 0.35rem; background: #fff; }
.squad-player-label, .starter-choice { display: flex; align-items: center; gap: 0.5rem; color: #33483a; font-size: 0.92rem; }
.squad-player-label { min-width: 0; }
.squad-player-label input, .starter-choice input { accent-color: var(--green); }
.squad-player-label span { overflow-wrap: anywhere; }
.squad-player-label small { color: #6b5844; font-size: 0.78rem; }
.starter-choice { flex: 0 0 auto; color: #526156; }
.no-directory-players { color: #526156; font-size: 0.9rem; }

@media (max-width: 520px) {
  .player-choice { align-items: flex-start; }
  .starter-choice { padding-top: 0.15rem; }
}
</style>
