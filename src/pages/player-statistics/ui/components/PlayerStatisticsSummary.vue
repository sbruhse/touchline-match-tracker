<script setup lang="ts">
import { formatPlayingTime } from '../../../../entities/match'

defineProps<{
  totalElapsedMs: number
  appearanceCount: number
  goalCount: number
  assistCount: number
}>()
</script>

<template>
  <section class="statistics-summary" aria-label="Player totals">
    <article class="summary-card time-summary">
      <span class="summary-label">Playing time</span>
      <strong data-testid="total-playing-time">{{ formatPlayingTime(totalElapsedMs) }}</strong>
      <span class="summary-caption">elapsed minutes : seconds</span>
    </article>
    <article class="summary-card appearance-summary">
      <span class="summary-label">Appearances</span>
      <strong data-testid="appearance-count">{{ appearanceCount }}</strong>
      <span class="summary-caption">matches with positive playing time</span>
    </article>
    <article class="summary-card goal-summary">
      <span class="summary-label">Goals</span>
      <strong data-testid="goal-count">{{ goalCount }}</strong>
      <span class="summary-caption">linked scorer credits</span>
    </article>
    <article class="summary-card assist-summary">
      <span class="summary-label">Assists</span>
      <strong data-testid="assist-count">{{ assistCount }}</strong>
      <span class="summary-caption">linked assist credits</span>
    </article>
  </section>
  <p class="statistics-time-note">
    Elapsed on-pitch time includes stoppage time, excludes manual pauses and the half-time break, and updates live until the clock stops.
  </p>
  <p class="statistics-goal-note">
    Goals and assists count explicit player links in started, tracked matches. Name-only goals and unstarted matches are excluded.
  </p>
</template>

<style scoped>
.statistics-summary { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 0.7rem; padding: 1.2rem 0 1.5rem; }
.summary-card { min-width: 0; min-height: 8rem; display: flex; flex-direction: column; align-items: flex-start; justify-content: center; gap: 0.38rem; padding: 1rem; border: 1px solid #e2e8df; border-radius: 0.5rem; background: #fff; }
.time-summary { background: #183d2b; color: #fff; }
.goal-summary, .assist-summary { border-color: #d1dfd1; background: #f4f8f1; }
.summary-label { color: #647267; font-size: 0.78rem; font-weight: 650; line-height: 1.25; }
.summary-card strong { color: #23382a; font-family: 'Space Grotesk', sans-serif; font-size: clamp(1.8rem, 4vw, 2.7rem); font-variant-numeric: tabular-nums; font-weight: 600; letter-spacing: -0.06em; line-height: 1; }
.time-summary strong { color: #f6f8f1; }
.summary-caption { color: #738076; font-size: 0.68rem; line-height: 1.4; }
.summary-label, .summary-caption { max-width: 100%; overflow-wrap: anywhere; }
.time-summary .summary-label, .time-summary .summary-caption { color: #c2d0c4; }
.statistics-time-note, .statistics-goal-note { margin: -0.7rem 0 1.1rem; color: #68766b; font-size: 0.72rem; line-height: 1.55; }
.statistics-goal-note { margin-top: -0.8rem; }

@media (max-width: 600px) {
  .statistics-summary { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0.55rem; }
  .summary-card { min-height: 6.5rem; padding: 0.8rem; }
  .summary-card strong { font-size: clamp(1.8rem, 8vw, 2.5rem); }
}
</style>
