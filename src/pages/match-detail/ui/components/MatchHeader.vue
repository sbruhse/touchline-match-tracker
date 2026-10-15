<script setup lang="ts">
import type { DeepReadonly } from 'vue'
import type { Match } from '../../../../entities/match'
import { MatchClockControls } from '../../../../features/control-match-clock'
import { AppIcon } from '../../../../shared/ui'

defineProps<{
  match: DeepReadonly<Match>
  homeScore: number
  awayScore: number
  minute: string
  phase: string
  periodLabel: string
}>()

const emit = defineEmits<{
  back: []
  clockUpdated: [now: number]
}>()
</script>

<template>
  <div class="match-header">
    <div class="match-header__topline">
      <button class="match-header__back back-button" type="button" aria-label="Return to match archive" @click="emit('back')">
        <AppIcon name="arrow-left" />
        <slot name="back-label">Matches</slot>
      </button>
      <span class="match-header__phase clock-status">{{ phase }}</span>
    </div>
    <div class="match-header__scoreline" aria-label="Match score">
      <strong id="match-heading" class="match-header__team match-header__team--home" tabindex="-1" :title="match.homeTeam">{{ match.homeTeam }}</strong>
      <div class="match-header__score" aria-label="Score">
        <span data-testid="home-score">{{ homeScore }}</span>
        <span aria-hidden="true">–</span>
        <span data-testid="away-score">{{ awayScore }}</span>
      </div>
      <strong class="match-header__team match-header__team--away" :title="match.awayTeam">{{ match.awayTeam }}</strong>
    </div>
    <div class="match-header__clockline">
      <span class="match-header__minute clock-minute" data-testid="match-minute" role="timer" aria-label="Match time">{{ minute }}</span>
      <span class="match-header__period clock-period">{{ periodLabel }}</span>
      <MatchClockControls :match-id="match.id" @updated="emit('clockUpdated', $event)" />
    </div>
  </div>
</template>

<style scoped>
.match-header { padding: 10px 16px 12px; color: #17251d; background: #fff; }
.match-header__topline { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
.match-header__back { min-height: 48px; display: inline-flex; align-items: center; gap: 8px; padding: 0 8px; color: #526156; background: transparent; border: 0; font: inherit; font-weight: 700; }
.match-header__phase, .match-header__clock-state { color: #526156; font-size: 0.875rem; }
.match-header__scoreline { display: grid; grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr); align-items: center; gap: 12px; margin: 4px 0; }
.match-header__team { overflow-wrap: anywhere; font-size: clamp(1rem, 4vw, 1.3rem); line-height: 1.15; }
.match-header__team:focus { border-radius: 2px; outline: 3px solid #91b83c; outline-offset: 4px; }
.match-header__team--home { text-align: left; }
.match-header__team--away { text-align: right; }
.match-header__score { display: flex; align-items: center; gap: 8px; font-family: 'Space Grotesk', sans-serif; font-size: clamp(2rem, 8vw, 3rem); font-variant-numeric: tabular-nums; font-weight: 700; line-height: 1; }
.match-header__clockline { display: flex; align-items: center; justify-content: center; flex-wrap: wrap; gap: 10px; }
.match-header__minute { color: #204d38; font-family: 'Space Grotesk', sans-serif; font-size: 1.35rem; font-variant-numeric: tabular-nums; font-weight: 700; }
.match-header :deep(.clock-actions) { flex: 1 1 auto; flex-direction: row; flex-wrap: wrap; justify-content: flex-end; gap: 8px; }
.match-header :deep(.clock-primary), .match-header :deep(.secondary-button) { font-size: 0.9rem; }
.match-header :deep(.full-time-message) { margin: 0; font-size: 0.9rem; }

@media (min-width: 680px) {
  .match-header { padding: 12px 22px; }
  .match-header__clockline { justify-content: space-between; }
  .match-header :deep(.clock-actions) { flex: 0 1 auto; }
}

@media (min-width: 680px) and (max-height: 500px) {
  .match-header {
    display: grid;
    grid-template-columns: max-content minmax(0, 1fr);
    grid-template-areas: 'topline scoreline' 'clockline clockline';
    gap: 0 16px;
    align-items: center;
    padding: 4px 16px;
  }

  .match-header__topline { grid-area: topline; }
  .match-header__scoreline { grid-area: scoreline; gap: 8px; margin: 0; }
  .match-header__team { font-size: 0.9rem; line-height: 1.1; }
  .match-header__score { gap: 4px; font-size: 1.75rem; }
  .match-header__clockline { grid-area: clockline; flex-wrap: nowrap; gap: 10px; }
  .match-header__minute { font-size: 1.1rem; }
  .match-header :deep(.clock-actions) { flex: 0 1 auto; flex-wrap: nowrap; gap: 6px; }
  .match-header :deep(.clock-primary), .match-header :deep(.secondary-button) { padding-inline: 10px; font-size: 0.8rem; }
}
</style>
