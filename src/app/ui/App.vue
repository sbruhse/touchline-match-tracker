<script setup lang="ts">
// App composition root: initialization, app-scoped state, and navigation only.
import { computed, onMounted, ref } from 'vue'
import { provideJerseySetStore } from '../../entities/jersey-set'
import { provideMatchStore } from '../../entities/match'
import { providePlayerStore } from '../../entities/player'
import { usePwa } from '../model/usePwa'
import PwaStatus from './PwaStatus.vue'
import { JerseySetsPage } from '../../pages/jersey-sets'
import { MatchArchivePage } from '../../pages/match-archive'
import { MatchDetailPage } from '../../pages/match-detail'
import {
  MatchPreparationPage,
  type PreparationDestination,
  type PreparationNavigationRequest,
} from '../../pages/match-preparation'
import { MyPlayersPage } from '../../pages/my-players'
import { PlayerStatisticsPage } from '../../pages/player-statistics'

const matchStore = provideMatchStore()
const playerStore = providePlayerStore()
const jerseySetStore = provideJerseySetStore()
const activePage = ref<'matches' | 'players' | 'jersey-sets' | 'statistics'>('matches')
const selectedMatchId = ref<string | null>(null)
const activeMatchView = ref<'match' | 'preparation'>('match')
const preparationNavigationRequest = ref<PreparationNavigationRequest | null>(null)
let preparationNavigationRequestId = 0
const selectedPlayerId = ref<string | null>(null)
const hasCreationDraft = ref(false)
const activeMatchId = computed(() => {
  const id = selectedMatchId.value
  return id && matchStore.matches.value.some((match) => match.id === id) ? id : null
})
const isPreparationSaveOwner = computed(() => Boolean(activeMatchId.value
  && activePage.value === 'matches' && activeMatchView.value === 'preparation'))
const showAppSaveFeedback = computed(() => !activeMatchId.value && !isPreparationSaveOwner.value)
const canReloadPwa = computed(() => activePage.value === 'matches'
  && selectedMatchId.value === null
  && activeMatchView.value === 'match'
  && selectedPlayerId.value === null
  && !hasCreationDraft.value
  && !matchStore.loading.value
  && !matchStore.saving.value
  && !playerStore.loading.value
  && !playerStore.saving.value
  && !jerseySetStore.loading.value
  && !jerseySetStore.saving.value)

const pwa = usePwa(() => canReloadPwa.value)

onMounted(() => {
  void loadMatches()
  void loadPlayers()
  void loadJerseySets()
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

async function loadJerseySets(): Promise<void> {
  try {
    await jerseySetStore.load()
  } catch {
    // The inventory page exposes its own retry state without blocking other pages.
  }
}

function openMatch(matchId: string): void {
  resetViewportScroll()
  activePage.value = 'matches'
  activeMatchView.value = 'match'
  preparationNavigationRequest.value = null
  selectedPlayerId.value = null
  selectedMatchId.value = matchId
}

function matchCreated(matchId: string): void {
  resetViewportScroll()
  activePage.value = 'matches'
  activeMatchView.value = 'preparation'
  preparationNavigationRequest.value = null
  selectedPlayerId.value = null
  selectedMatchId.value = matchId
}

function creationDraftChanged(hasDraft: boolean): void {
  hasCreationDraft.value = hasDraft
}

function prepareMatch(matchId: string): void {
  resetViewportScroll()
  activePage.value = 'matches'
  activeMatchView.value = 'preparation'
  preparationNavigationRequest.value = null
  selectedPlayerId.value = null
  selectedMatchId.value = matchId
}

function returnToArchive(): void {
  resetViewportScroll()
  activePage.value = 'matches'
  selectedMatchId.value = null
  activeMatchView.value = 'match'
  preparationNavigationRequest.value = null
  selectedPlayerId.value = null
}

function openPlayers(): void {
  selectedMatchId.value = null
  activeMatchView.value = 'match'
  selectedPlayerId.value = null
  activePage.value = 'players'
}

function openJerseySets(): void {
  selectedMatchId.value = null
  activeMatchView.value = 'match'
  selectedPlayerId.value = null
  activePage.value = 'jersey-sets'
}

function openPlayerStatistics(playerId: string): void {
  selectedMatchId.value = null
  activeMatchView.value = 'match'
  selectedPlayerId.value = playerId
  activePage.value = 'statistics'
}

function returnToPlayers(): void {
  resetViewportScroll()
  selectedPlayerId.value = null
  selectedMatchId.value = null
  activeMatchView.value = 'match'
  activePage.value = 'players'
}

function handlePreparationNavigation(destination: PreparationDestination): void {
  preparationNavigationRequest.value = null
  switch (destination) {
    case 'match':
      resetViewportScroll()
      activePage.value = 'matches'
      activeMatchView.value = 'match'
      selectedPlayerId.value = null
      return
    case 'archive':
      returnToArchive()
      return
    case 'players':
      openPlayers()
      return
    case 'jersey-sets':
      openJerseySets()
      return
    case 'statistics':
      if (selectedPlayerId.value) activePage.value = 'statistics'
      else openPlayers()
  }
}

function requestAppNavigation(destination: PreparationDestination): void {
  if (isPreparationSaveOwner.value) {
    preparationNavigationRequestId += 1
    preparationNavigationRequest.value = { destination, requestId: preparationNavigationRequestId }
    return
  }
  handlePreparationNavigation(destination)
}

function resetViewportScroll(): void {
  if (document.scrollingElement) document.scrollingElement.scrollTop = 0
  document.body.scrollTop = 0
}
</script>

<template>
  <div class="app-shell" :class="{ 'app-shell--match': activeMatchId }">
    <header class="topbar" :class="{ 'topbar--match': activeMatchId }">
      <a class="brand" href="#" aria-label="Touchline match tracker home" @click.prevent="requestAppNavigation('archive')">
        <span class="brand-mark" aria-hidden="true"><span></span></span>
        <span>TOUCHLINE</span>
      </a>
      <span class="topbar-note">MATCH DAY, MADE SIMPLE</span>
      <nav class="app-nav" aria-label="Main navigation">
        <button type="button" data-nav="matches" :aria-current="activePage === 'matches' ? 'page' : undefined" @click="requestAppNavigation('archive')">Matches</button>
        <button type="button" data-nav="players" :aria-current="activePage === 'players' || activePage === 'statistics' ? 'page' : undefined" @click="requestAppNavigation('players')">My players</button>
        <button type="button" data-nav="jersey-sets" :aria-current="activePage === 'jersey-sets' ? 'page' : undefined" @click="requestAppNavigation('jersey-sets')">Jersey sets</button>
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
          v-if="showAppSaveFeedback && matchStore.saving.value"
          class="save-feedback app-save-feedback saving-feedback"
          role="status"
          aria-live="polite"
        >Saving changes…</section>
        <section
          v-else-if="showAppSaveFeedback && matchStore.saveStatus.value === 'error'"
          class="save-feedback app-save-feedback save-error"
          role="alert"
          aria-live="assertive"
        >Could not save changes. {{ matchStore.error.value }} Retry the action to try again.</section>
        <section
          v-else-if="showAppSaveFeedback && matchStore.saveStatus.value === 'saved'"
          class="save-feedback app-save-feedback saved-feedback"
          role="status"
          aria-live="polite"
        >All changes saved.</section>
        <PwaStatus
          v-if="activePage === 'matches' && selectedMatchId === null && activeMatchView === 'match'"
          :phase="pwa.state.value.phase"
          :ready="pwa.state.value.ready"
          :update-available="pwa.state.value.updateAvailable"
          :reload-available="pwa.state.value.reloadAvailable"
          :applying-update="pwa.state.value.applyingUpdate"
          :recovery-available="pwa.state.value.recoveryAvailable"
          :can-reload="canReloadPwa"
          :error="pwa.state.value.error"
          @update="pwa.tryReload"
          @defer="pwa.cancelUpdateRequest"
          @recover="pwa.recover()"
          @retry="pwa.retry()"
        />
        <MyPlayersPage v-if="activePage === 'players'" @view-statistics="openPlayerStatistics" />
        <JerseySetsPage v-else-if="activePage === 'jersey-sets'" />
        <PlayerStatisticsPage
          v-else-if="activePage === 'statistics' && selectedPlayerId"
          :player-id="selectedPlayerId"
          @back="returnToPlayers"
          @open-match="openMatch"
        />
        <MatchPreparationPage
          v-else-if="activeMatchId && activeMatchView === 'preparation'"
          :match-id="activeMatchId"
          :navigation-request="preparationNavigationRequest"
          @navigate="handlePreparationNavigation"
        />
        <MatchDetailPage v-else-if="activeMatchId" :match-id="activeMatchId" @back="returnToArchive" @prepare="prepareMatch" />
        <MatchArchivePage
          v-else
          @open-match="openMatch"
          @match-created="matchCreated"
          @creation-draft-changed="creationDraftChanged"
        />
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

@media (display-mode: standalone) {
  .app-shell { padding-top: env(safe-area-inset-top); }
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
  .topbar { height: auto; min-height: 4.5rem; display: grid; grid-template-columns: minmax(0, 1fr); justify-content: stretch; gap: 0.4rem; padding: 0.55rem 0; }
  .brand { gap: 0.4rem; font-size: 0.78rem; }
  .brand-mark { width: 1.45rem; height: 1.45rem; }
  .app-nav { width: 100%; display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 0.2rem; }
  .app-nav button { min-width: 0; min-height: 2.75rem; padding: 0.3rem 0.25rem; font-size: 0.65rem; line-height: 1.2; white-space: normal; }
  .topbar--match .brand { font-size: 0.74rem; }
  .topbar--match { height: 3.25rem; min-height: 3.25rem; display: flex; justify-content: space-between; gap: 0.25rem; padding: 0; }
  .topbar--match .brand > span:last-child { display: none; }
  .topbar--match .app-nav { width: auto; display: flex; flex-wrap: nowrap; gap: 0; }
  .topbar--match .app-nav button { min-height: 2.75rem; padding: 0 0.18rem; font-size: 0.57rem; white-space: nowrap; }
}
</style>
