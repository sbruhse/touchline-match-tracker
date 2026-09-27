<script setup lang="ts">
import { useMatchStore } from '../../../entities/match'
import { CreateMatchForm } from '../../../features/create-match'

const emit = defineEmits<{ openMatch: [matchId: string] }>()
const { matches } = useMatchStore()

function formatDate(timestamp: number): string {
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(timestamp)
}

function openMatch(matchId: string): void {
  emit('openMatch', matchId)
}
</script>

<template>
  <div class="dashboard">
    <section class="welcome-panel" aria-labelledby="welcome-heading">
      <div class="welcome-copy">
        <p class="eyebrow"><span class="eyebrow-line"></span> FOR THE LOVE OF THE GAME</p>
        <h1 id="welcome-heading">Every moment,<br /><em>on the record.</em></h1>
        <p class="welcome-intro">
          Your sideline companion for capturing the moments that make the match.
        </p>
      </div>

      <CreateMatchForm @created="openMatch" />
    </section>

    <section class="archive-section" aria-labelledby="archive-heading">
      <div class="archive-heading-row">
        <div>
          <p class="section-kicker">YOUR TOUCHLINE</p>
          <h2 id="archive-heading">Match archive</h2>
        </div>
        <span class="match-count">{{ matches.length.toString().padStart(2, '0') }} MATCH{{ matches.length === 1 ? '' : 'ES' }}</span>
      </div>

      <div v-if="matches.length" class="match-list">
        <button
          v-for="match in matches"
          :key="match.id"
          class="match-list-item"
          type="button"
          :aria-label="`Open ${match.homeTeam} versus ${match.awayTeam}`"
          @click="openMatch(match.id)"
        >
          <span class="archive-ball" aria-hidden="true">●</span>
          <span class="archive-match-teams">
            <strong>{{ match.homeTeam }}</strong>
            <span>vs</span>
            <strong>{{ match.awayTeam }}</strong>
          </span>
          <span class="archive-date">{{ formatDate(match.updatedAt) }}</span>
          <span class="archive-arrow" aria-hidden="true">↗</span>
        </button>
      </div>

      <div v-else class="empty-archive">
        <span class="empty-ball" aria-hidden="true">✳</span>
        <div>
          <h3>No matches in the book yet.</h3>
          <p>Your match history will find a home here.</p>
        </div>
      </div>
      <p class="local-data-note">Matches stay in this browser profile. Clearing site data may remove them.</p>
    </section>
  </div>
</template>

<style scoped>
.dashboard { padding: 3.75rem 0 3.4rem; }

.welcome-panel {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(19rem, 0.76fr);
  align-items: center;
  gap: clamp(3rem, 8vw, 9rem);
  padding-bottom: 3.75rem;
}

.welcome-copy { padding-bottom: 0.5rem; }
.eyebrow { display: flex; align-items: center; gap: 0.6rem; margin: 0 0 1.75rem; color: #68756b; font-family: 'DM Mono', monospace; font-size: 0.64rem; letter-spacing: 0.1em; }
.eyebrow-line { width: 1.65rem; height: 1px; background: #8aa15e; }

.welcome-copy h1 {
  margin: 0;
  font-family: 'Space Grotesk', sans-serif;
  font-size: clamp(3.2rem, 6vw, 5.75rem);
  font-weight: 500;
  letter-spacing: -0.075em;
  line-height: 0.98;
}

.welcome-copy h1 em { color: var(--green); font-style: normal; }
.welcome-intro { max-width: 25rem; margin: 1.5rem 0 0; color: #6d786f; font-size: 1rem; line-height: 1.65; }
.section-kicker { margin: 0 0 0.55rem; color: #849087; font-family: 'DM Mono', monospace; font-size: 0.58rem; letter-spacing: 0.1em; }

.archive-heading-row { display: flex; align-items: end; justify-content: space-between; margin-bottom: 1.2rem; }
.archive-heading-row h2 { margin: 0; font-family: 'Space Grotesk', sans-serif; font-size: 1.6rem; font-weight: 600; letter-spacing: -0.045em; }
.archive-section { padding-top: 1.9rem; border-top: 1px solid #dfe4dc; }
.match-count { padding-bottom: 0.2rem; color: #8b958c; font-family: 'DM Mono', monospace; font-size: 0.59rem; letter-spacing: 0.1em; }
.match-list { display: grid; gap: 0.6rem; }

.match-list-item {
  min-height: 4.2rem;
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 0.75rem 1rem;
  border: 1px solid #e4e8e1;
  border-radius: 0.45rem;
  background: rgb(255 255 255 / 65%);
  color: var(--ink);
  text-align: left;
  transition: border-color 140ms ease, background 140ms ease, transform 140ms ease;
}

.match-list-item:hover { transform: translateY(-1px); border-color: #b9c7b5; background: #fff; }
.archive-ball { width: 2rem; height: 2rem; display: grid; flex: 0 0 auto; place-items: center; border-radius: 50%; background: #edf3e7; color: #60804b; font-size: 0.75rem; }
.archive-match-teams { display: flex; flex: 1; align-items: baseline; gap: 0.55rem; font-size: 0.84rem; }
.archive-match-teams > span { color: #9aa39b; font-family: 'DM Mono', monospace; font-size: 0.58rem; text-transform: uppercase; }
.archive-date { color: #838d84; font-size: 0.72rem; }
.archive-arrow { color: #66816d; font-size: 1rem; }
.empty-archive { min-height: 5rem; display: flex; align-items: center; gap: 0.85rem; padding: 0.7rem 0; }
.empty-ball { width: 2.25rem; height: 2.25rem; display: grid; flex: 0 0 auto; place-items: center; border: 1px solid #dfe5d9; border-radius: 50%; color: #82956d; font-size: 1.1rem; }
.empty-archive h3 { margin: 0 0 0.25rem; font-size: 0.85rem; font-weight: 600; }
.empty-archive p { margin: 0; color: #89928a; font-size: 0.75rem; }
.local-data-note { margin: 1rem 0 0; color: #89928a; font-size: 0.68rem; line-height: 1.5; }

@media (max-width: 760px) {
  .dashboard { padding-top: 2.6rem; }
  .welcome-panel { grid-template-columns: 1fr; gap: 2rem; padding-bottom: 2.5rem; }
  .welcome-copy h1 { font-size: clamp(3rem, 12vw, 4.6rem); }
}

@media (max-width: 520px) {
  .archive-heading-row h2 { font-size: 1.4rem; }
  .match-list-item { gap: 0.65rem; padding: 0.7rem; }
  .archive-match-teams { flex-wrap: wrap; gap: 0.3rem; font-size: 0.75rem; }
  .archive-date { font-size: 0.62rem; }
}
</style>
