<script setup lang="ts">
import { formatPlayingTime } from '../../../../entities/match'

defineProps<{
  totalElapsedMs: number
  appearanceCount: number
}>()
</script>

<template>
  <section class="statistics-summary" aria-label="Player totals">
    <article class="summary-card time-summary">
      <span class="summary-label">TOTAL PLAYING TIME</span>
      <strong data-testid="total-playing-time">{{ formatPlayingTime(totalElapsedMs) }}</strong>
      <span class="summary-caption">elapsed minutes : seconds</span>
    </article>
    <article class="summary-card appearance-summary">
      <span class="summary-label">APPEARANCES</span>
      <strong data-testid="appearance-count">{{ appearanceCount }}</strong>
      <span class="summary-caption">matches with positive playing time</span>
    </article>
  </section>
  <p class="statistics-time-note">
    Elapsed on-pitch time includes stoppage time, excludes manual pauses and the half-time break, and updates live until the clock stops.
  </p>
</template>

<style scoped>
.statistics-summary { display: grid; grid-template-columns: 1.2fr 0.8fr; gap: 0.7rem; padding: 1.2rem 0 1.5rem; }
.summary-card { min-height: 8rem; display: flex; flex-direction: column; align-items: flex-start; justify-content: center; gap: 0.38rem; padding: 1rem 1.1rem; border: 1px solid #e2e8df; border-radius: 0.5rem; background: #fff; }
.time-summary { background: #183d2b; color: #fff; }
.summary-label { color: #829184; font-family: 'DM Mono', monospace; font-size: 0.53rem; letter-spacing: 0.09em; }
.time-summary .summary-label { color: #b1c3b5; }
.summary-card strong { color: #23382a; font-family: 'Space Grotesk', sans-serif; font-size: clamp(2rem, 5vw, 3rem); font-variant-numeric: tabular-nums; font-weight: 600; letter-spacing: -0.06em; line-height: 1; }
.time-summary strong { color: #f6f8f1; }
.summary-caption { color: #879188; font-size: 0.62rem; }
.time-summary .summary-caption { color: #b1c3b5; }
.statistics-time-note { margin: -0.7rem 0 1.1rem; color: #768278; font-size: 0.64rem; line-height: 1.5; }

@media (max-width: 600px) {
  .statistics-summary { grid-template-columns: 1fr; }
  .summary-card { min-height: 6.4rem; }
}
</style>
