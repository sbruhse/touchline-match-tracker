<script setup lang="ts">
import { formatPlayingTime, type MatchStatus, type PlayerMatchBreakdown as PlayerMatchBreakdownData } from '../../../../entities/match'

interface UntrackedMatchRow {
  id: string
  teams: string
  createdAt: number
}

defineProps<{
  breakdowns: readonly PlayerMatchBreakdownData[]
  untrackedMatches: readonly UntrackedMatchRow[]
}>()

const emit = defineEmits<{
  openMatch: [matchId: string]
}>()

function formattedDate(timestamp: number): string {
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(timestamp)
}

function statusLabel(status: MatchStatus): string {
  switch (status) {
    case 'not-started': return 'Not started'
    case 'running': return 'Running'
    case 'paused': return 'Paused'
    case 'halftime': return 'Half-time'
    case 'full-time': return 'Full time'
  }
}
</script>

<template>
  <section class="match-breakdown" aria-labelledby="breakdown-heading">
    <div class="breakdown-heading-row">
      <div>
        <p class="section-kicker">TRACKED MATCHES</p>
        <h2 id="breakdown-heading">Match breakdown</h2>
      </div>
      <span class="breakdown-count">{{ breakdowns.length.toString().padStart(2, '0') }} MATCH{{ breakdowns.length === 1 ? '' : 'ES' }}</span>
    </div>

    <ul v-if="breakdowns.length" class="breakdown-list" aria-label="Tracked match contributions">
      <li
        v-for="breakdown in breakdowns"
        :key="breakdown.matchId"
        class="breakdown-row"
        :data-match-id="breakdown.matchId"
      >
        <button
          class="breakdown-match-link"
          type="button"
          :aria-label="`Open ${breakdown.opponent} match from ${formattedDate(breakdown.date)}`"
          @click="emit('openMatch', breakdown.matchId)"
        >
          <span class="breakdown-opponent">vs {{ breakdown.opponent }}</span>
          <span class="breakdown-meta">
            <span class="side-tag">{{ breakdown.ownSide === 'home' ? 'HOME' : 'AWAY' }}</span>
            <time>{{ formattedDate(breakdown.date) }}</time>
            <span class="match-status" :data-status="breakdown.status">{{ statusLabel(breakdown.status) }}</span>
          </span>
        </button>
        <div class="breakdown-contribution">
          <strong class="breakdown-time">{{ formatPlayingTime(breakdown.elapsedMs) }}</strong>
          <span
            v-if="breakdown.liveContribution"
            class="live-contribution"
            :aria-label="`${breakdown.status === 'running' ? 'Live' : 'Ongoing'} match contribution`"
          >{{ breakdown.status === 'running' ? 'LIVE' : 'ONGOING' }}</span>
          <span v-else-if="!breakdown.appearance" class="unused-label">Unused squad member</span>
        </div>
      </li>
    </ul>
    <div v-else class="empty-breakdown" data-testid="empty-player-history">
      <span aria-hidden="true">○</span>
      <div>
        <h3>No recorded playing time yet.</h3>
        <p>Appearances count only when a player has spent positive time on the pitch.</p>
      </div>
    </div>
  </section>

  <aside v-if="untrackedMatches.length" class="untracked-note" aria-label="Matches without participation data">
    <span class="untracked-symbol" aria-hidden="true">i</span>
    <div>
      <strong>{{ untrackedMatches.length }} match{{ untrackedMatches.length === 1 ? '' : 'es' }} without player tracking</strong>
      <p>These matches are excluded because no lineup was saved. Goal names are not used to infer player history.</p>
      <ul class="untracked-match-list">
        <li v-for="match in untrackedMatches" :key="match.id">{{ match.teams }} · {{ formattedDate(match.createdAt) }}</li>
      </ul>
    </div>
  </aside>
</template>

<style scoped>
.section-kicker { margin: 0 0 0.4rem; color: #849087; font-family: 'DM Mono', monospace; font-size: 0.55rem; letter-spacing: 0.1em; }
.match-breakdown { padding-top: 0.5rem; }
.breakdown-heading-row { display: flex; align-items: end; justify-content: space-between; gap: 0.8rem; margin-bottom: 0.75rem; }
.breakdown-heading-row h2 { margin: 0; color: #293d30; font-family: 'Space Grotesk', sans-serif; font-size: 1.2rem; letter-spacing: -0.04em; }
.breakdown-count { color: #89938a; font-family: 'DM Mono', monospace; font-size: 0.53rem; letter-spacing: 0.08em; }
.breakdown-list { display: grid; gap: 0.5rem; margin: 0; padding: 0; list-style: none; }
.breakdown-row { display: flex; align-items: center; justify-content: space-between; gap: 1rem; min-height: 4.4rem; padding: 0.7rem 0.85rem; border: 1px solid #e4e9e1; border-radius: 0.4rem; background: rgb(255 255 255 / 75%); }
.breakdown-match-link { min-width: 0; display: grid; gap: 0.4rem; padding: 0; border: 0; background: transparent; color: inherit; text-align: left; cursor: pointer; }
.breakdown-match-link:hover .breakdown-opponent { color: var(--green); }
.breakdown-opponent { color: #304235; font-size: 0.8rem; font-weight: 650; overflow-wrap: anywhere; }
.breakdown-meta { display: flex; flex-wrap: wrap; align-items: center; gap: 0.45rem; color: #808b81; font-size: 0.63rem; }
.side-tag { color: #647b5e; font-family: 'DM Mono', monospace; font-size: 0.49rem; letter-spacing: 0.05em; }
.match-status { padding: 0.13rem 0.32rem; border-radius: 999px; background: #eff1ed; color: #6e796f; font-size: 0.56rem; }
.match-status[data-status='running'], .match-status[data-status='halftime'] { background: #e8f2e0; color: #557047; }
.breakdown-contribution { display: flex; flex: 0 0 auto; flex-direction: column; align-items: flex-end; gap: 0.3rem; }
.breakdown-time { color: #254933; font-family: 'DM Mono', monospace; font-size: 0.86rem; font-variant-numeric: tabular-nums; }
.live-contribution { padding: 0.13rem 0.3rem; border-radius: 999px; background: #e8f2e0; color: #577348; font-family: 'DM Mono', monospace; font-size: 0.45rem; letter-spacing: 0.06em; }
.unused-label { color: #8a9189; font-size: 0.54rem; text-align: right; }
.empty-breakdown { min-height: 5rem; display: flex; align-items: center; gap: 0.75rem; padding: 0.8rem; border: 1px dashed #dce3d8; border-radius: 0.4rem; color: #849087; }
.empty-breakdown > span { color: #82956d; font-size: 1.4rem; }
.empty-breakdown h3 { margin: 0 0 0.25rem; color: #48594c; font-size: 0.76rem; }
.empty-breakdown p { margin: 0; font-size: 0.65rem; line-height: 1.45; }
.untracked-note { display: flex; gap: 0.65rem; margin-top: 1rem; padding: 0.8rem; border: 1px solid #e3e7df; border-radius: 0.4rem; background: #f5f6f2; color: #67746a; }
.untracked-symbol { width: 1.15rem; height: 1.15rem; display: grid; flex: 0 0 auto; place-items: center; border: 1px solid #adb8a9; border-radius: 50%; font-family: 'DM Mono', monospace; font-size: 0.65rem; }
.untracked-note strong { color: #4f5f53; font-size: 0.67rem; }
.untracked-note p { margin: 0.25rem 0 0; font-size: 0.63rem; line-height: 1.5; }
.untracked-match-list { display: grid; gap: 0.2rem; margin: 0.4rem 0 0; padding-left: 1rem; font-size: 0.61rem; }
</style>
