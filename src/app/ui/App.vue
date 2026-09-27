<script setup lang="ts">
// App composition root: initialization, app-scoped state, and navigation only.
import { computed, onMounted, ref } from 'vue'
import { provideMatchStore } from '../../entities/match'
import { providePlayerStore } from '../../entities/player'
import { MatchArchivePage } from '../../pages/match-archive'
import { MatchDetailPage } from '../../pages/match-detail'
import { MyPlayersPage } from '../../pages/my-players'
import { PlayerStatisticsPage } from '../../pages/player-statistics'

const matchStore = provideMatchStore()
const playerStore = providePlayerStore()
const activePage = ref<'matches' | 'players' | 'statistics'>('matches')
const selectedMatchId = ref<string | null>(null)
const selectedPlayerId = ref<string | null>(null)
const activeMatchId = computed(() => {
  const id = selectedMatchId.value
  return id && matchStore.matches.value.some((match) => match.id === id) ? id : null
})

onMounted(() => {
  void loadMatches()
  void loadPlayers()
})

async function loadMatches(): Promise<void> {
  try {
    await matchStore.load()
  } catch {
    // The store retains the load error for the accessible retry state below.
  }
}

async function loadPlayers(): Promise<void> {
  try {
    await playerStore.load()
  } catch {
    // The My players page exposes the store's accessible retry state.
  }
}

function openMatch(matchId: string): void {
  resetViewportScroll()
  activePage.value = 'matches'
  selectedPlayerId.value = null
  selectedMatchId.value = matchId
}

function returnToArchive(): void {
  resetViewportScroll()
  activePage.value = 'matches'
  selectedMatchId.value = null
  selectedPlayerId.value = null
}

function openPlayers(): void {
  selectedMatchId.value = null
  selectedPlayerId.value = null
  activePage.value = 'players'
}

function openPlayerStatistics(playerId: string): void {
  selectedMatchId.value = null
  selectedPlayerId.value = playerId
  activePage.value = 'statistics'
}

function returnToPlayers(): void {
  resetViewportScroll()
  selectedPlayerId.value = null
  selectedMatchId.value = null
  activePage.value = 'players'
}

function resetViewportScroll(): void {
  if (document.scrollingElement) document.scrollingElement.scrollTop = 0
  document.body.scrollTop = 0
}
</script>

<template>
  <div class="app-shell" :class="{ 'app-shell--match': activeMatchId }">
    <header class="topbar" :class="{ 'topbar--match': activeMatchId }">
      <a class="brand" href="#" aria-label="Touchline match tracker home" @click.prevent="returnToArchive">
        <span class="brand-mark" aria-hidden="true"><span></span></span>
        <span>TOUCHLINE</span>
      </a>
      <span class="topbar-note">MATCH DAY, MADE SIMPLE</span>
      <nav class="app-nav" aria-label="Main navigation">
        <button type="button" data-nav="matches" :aria-current="activePage === 'matches' ? 'page' : undefined" @click="returnToArchive">Matches</button>
        <button type="button" data-nav="players" :aria-current="activePage === 'players' || activePage === 'statistics' ? 'page' : undefined" @click="openPlayers">My players</button>
      </nav>
    </header>

    <main>
      <section
        v-if="matchStore.loading.value || (!matchStore.ready.value && !matchStore.error.value)"
        class="storage-state"
        role="status"
        aria-live="polite"
      >Loading your matches…</section>
      <section v-else-if="!matchStore.ready.value" class="storage-state storage-error" role="alert">
        <p>Your match archive could not be loaded.</p>
        <p>{{ matchStore.error.value }}</p>
        <button class="primary-button storage-retry" type="button" @click="loadMatches">Try again</button>
      </section>
      <template v-else>
        <section
          v-if="!activeMatchId && matchStore.saving.value"
          class="save-feedback app-save-feedback saving-feedback"
          role="status"
          aria-live="polite"
        >Saving changes…</section>
        <section
          v-else-if="!activeMatchId && matchStore.saveStatus.value === 'error'"
          class="save-feedback app-save-feedback save-error"
          role="alert"
          aria-live="assertive"
        >Could not save changes. {{ matchStore.error.value }} Retry the action to try again.</section>
        <section
          v-else-if="!activeMatchId && matchStore.saveStatus.value === 'saved'"
          class="save-feedback app-save-feedback saved-feedback"
          role="status"
          aria-live="polite"
        >All changes saved.</section>
        <MyPlayersPage v-if="activePage === 'players'" @view-statistics="openPlayerStatistics" />
        <PlayerStatisticsPage
          v-else-if="activePage === 'statistics' && selectedPlayerId"
          :player-id="selectedPlayerId"
          @back="returnToPlayers"
          @open-match="openMatch"
        />
        <MatchDetailPage v-else-if="activeMatchId" :match-id="activeMatchId" @back="returnToArchive" />
        <MatchArchivePage v-else @open-match="openMatch" />
      </template>
    </main>

      <footer v-if="!activeMatchId" class="page-footer">
      <span>MADE FOR THE SIDELINE</span>
      <span>KEEP THE GAME CLOSE <span aria-hidden="true">✳</span></span>
    </footer>
  </div>
</template>

<style scoped>
.app-shell {
  width: min(100% - 5rem, 78rem);
  min-height: 100vh;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
}

.app-shell--match { width: min(100%, 78rem); }

.topbar {
  height: 5.5rem;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  border-bottom: 1px solid #dfe4dc;
}

.topbar--match { height: 3.5rem; }

.brand {
  display: inline-flex;
  align-items: center;
  gap: 0.65rem;
  color: var(--ink);
  font-family: 'Space Grotesk', sans-serif;
  font-size: 1rem;
  font-weight: 700;
  letter-spacing: 0.035em;
  text-decoration: none;
}

.brand-mark {
  position: relative;
  width: 1.7rem;
  height: 1.7rem;
  display: grid;
  place-items: center;
  overflow: hidden;
  border-radius: 50%;
  background: var(--green);
}

.brand-mark::before, .brand-mark::after, .brand-mark span { position: absolute; content: ''; }
.brand-mark span { width: 0.48rem; height: 0.48rem; border: 1px solid var(--lime); border-radius: 50%; }
.brand-mark::before { width: 1.1rem; height: 1.1rem; border: 1px solid rgb(210 239 112 / 68%); border-radius: 50%; }

.topbar-note, .page-footer {
  font-family: 'DM Mono', monospace;
  font-size: 0.64rem;
  letter-spacing: 0.1em;
}

.topbar-note { color: #818a82; }
.app-nav { display: flex; flex: 0 0 auto; gap: 0.35rem; }
.app-nav button { min-height: 2.25rem; padding: 0 0.7rem; border: 1px solid transparent; border-radius: 999px; background: transparent; color: #637066; font-size: 0.7rem; font-weight: 600; }
.app-nav button[aria-current='page'] { border-color: #dfe5dc; background: #fff; color: var(--green); }
main { flex: 1; }

.storage-state { padding: 5rem 0; color: #627267; text-align: center; }
.storage-error { color: #8a3d34; }
.storage-error p { margin: 0 0 0.75rem; }
.storage-retry { width: min(100%, 18rem); margin: 1.25rem auto 0; }
.save-feedback { margin: 0.75rem 0; padding: 0.65rem 0.85rem; border-radius: 0.35rem; font-size: 0.8rem; }
.saving-feedback { background: #eef1e8; color: #59664e; }
.saved-feedback { background: #e7f0e1; color: #435a3b; }
.save-error { background: #f8e9e6; color: #8a3d34; }

.page-footer {
  min-height: 3.8rem;
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-top: 1px solid #dfe4dc;
  color: #879188;
  font-size: 0.57rem;
}

.page-footer span span { color: #799446; }

@media (max-width: 760px) {
  .app-shell { width: min(100% - 2rem, 42rem); }
  .topbar { height: 4.5rem; }
  .topbar--match { height: 3.25rem; }
  .topbar-note { display: none; }
}

@media (max-width: 520px) {
  .topbar { gap: 0.45rem; }
  .brand { gap: 0.4rem; font-size: 0.78rem; }
  .brand-mark { width: 1.45rem; height: 1.45rem; }
  .app-nav { gap: 0.1rem; }
  .app-nav button { min-height: 2rem; padding: 0 0.45rem; font-size: 0.63rem; }
  .topbar--match .brand { font-size: 0.74rem; }
}
</style>
