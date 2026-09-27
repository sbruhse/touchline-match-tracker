<script setup lang="ts">
export interface LineupPlayerRow {
  playerId: string
  label: string
  elapsedMs: number
  playingTime: string
  liveContribution: boolean
}

defineProps<{
  title: string
  players: LineupPlayerRow[]
  emptyMessage: string
}>()
</script>

<template>
  <section class="lineup-group" :aria-label="title">
    <div class="lineup-group-heading">
      <h3>{{ title }}</h3>
      <span>{{ players.length.toString().padStart(2, '0') }}</span>
    </div>
    <ul v-if="players.length" class="lineup-player-list">
      <li v-for="player in players" :key="player.playerId" class="lineup-player" :data-player-id="player.playerId">
        <span class="player-name">{{ player.label }}<small v-if="player.liveContribution">LIVE</small></span>
        <time class="player-time" :aria-label="`${player.playingTime} elapsed playing time`">{{ player.playingTime }}</time>
      </li>
    </ul>
    <p v-else class="lineup-empty">{{ emptyMessage }}</p>
  </section>
</template>

<style scoped>
.lineup-group { min-width: 0; }
.lineup-group-heading { display: flex; align-items: center; justify-content: space-between; gap: 0.5rem; margin-bottom: 0.55rem; }
.lineup-group-heading h3 { margin: 0; color: #34483a; font-size: 1rem; font-weight: 700; }
.lineup-group-heading > span { color: #526156; font-size: 0.875rem; font-variant-numeric: tabular-nums; }
.lineup-player-list { display: grid; gap: 0.4rem; margin: 0; padding: 0; list-style: none; }
.lineup-player { min-height: 48px; display: flex; align-items: center; justify-content: space-between; gap: 0.7rem; padding: 0.5rem 0.7rem; border: 1px solid #dfe5dc; border-radius: 0.5rem; background: #fff; }
.player-name { display: flex; align-items: center; flex-wrap: wrap; gap: 0.4rem; min-width: 0; color: #26382b; font-size: 1rem; overflow-wrap: anywhere; }
.player-name small { padding: 0.15rem 0.3rem; border-radius: 999px; background: #e8f2e0; color: #34533a; font-size: 0.75rem; font-weight: 700; }
.player-time { flex: 0 0 auto; color: #204d38; font-family: 'DM Sans', sans-serif; font-size: 1rem; font-variant-numeric: tabular-nums; font-weight: 700; }
.lineup-empty { margin: 0; padding: 0.7rem 0; color: #526156; font-size: 0.9rem; }
</style>
