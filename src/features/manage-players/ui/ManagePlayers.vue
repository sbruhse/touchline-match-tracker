<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { createJerseySetIdentityLabels, useJerseySetStore } from '../../../entities/jersey-set'
import type { PlayerSetNumberInput } from '../../../entities/jersey-set'
import {
  archivePlayer,
  createPlayer,
  createPlayerIdentityLabels,
  restorePlayer,
  updatePlayerProfile,
  usePlayerStore,
} from '../../../entities/player'
import type { PlayerProfileInput } from '../../../entities/player'
import PlayerDirectoryFilters from './components/PlayerDirectoryFilters.vue'
import PlayerDirectoryList from './components/PlayerDirectoryList.vue'
import PlayerProfileForm from './components/PlayerProfileForm.vue'
import { parsePreferredNumberDraft } from '../lib/parsePreferredNumberDraft'
import type { PlayerJerseyPreferenceDraft, SavedPlayerPreferredNumber } from './types'

const store = usePlayerStore()
const jerseyStore = useJerseySetStore()
const emit = defineEmits<{ viewStatistics: [playerId: string] }>()
const newProfile = ref<PlayerProfileInput>({ name: '', positions: [], jerseySize: '' })
const localError = ref<string | null>(null)
const showArchived = ref(false)
const editingPlayerId = ref<string | null>(null)
const editingDraft = ref<PlayerProfileInput | null>(null)
const editingPreferredNumbersPlayerId = ref<string | null>(null)
const preferredNumberDraft = ref<PlayerJerseyPreferenceDraft[] | null>(null)
const preferredNumberError = ref<string | null>(null)
const preferredNumberErrorSetId = ref<string | null>(null)

watch(editingPlayerId, (playerId, previousPlayerId) => {
  if (playerId) {
    const nameInput = document.getElementById(`edit-player-${playerId}-name`) as HTMLInputElement | null
    nameInput?.focus({ preventScroll: true })
    nameInput?.setSelectionRange(0, 0)
    return
  }
  if (previousPlayerId) document.getElementById(`edit-profile-${previousPlayerId}`)?.focus()
}, { flush: 'post' })

watch(editingPreferredNumbersPlayerId, (playerId, previousPlayerId) => {
  if (playerId) {
    const firstSet = jerseyStore.sets.value[0]
    const target = firstSet
      ? document.getElementById(`preferred-player-${playerId}-${firstSet.id}`)
      : document.getElementById(`preferred-player-${playerId}-cancel`)
    target?.focus({ preventScroll: true })
    return
  }
  if (previousPlayerId) document.getElementById(`edit-preferred-numbers-${previousPlayerId}`)?.focus()
}, { flush: 'post' })

const visiblePlayers = computed(() => store.players.value.filter((player) => player.archived === showArchived.value))
const nameInvalid = computed(() => localError.value === 'A player name is required.')
const labels = computed(() => createPlayerIdentityLabels(store.players.value))
const preferredNumberSummaries = computed<ReadonlyMap<string, readonly SavedPlayerPreferredNumber[]>>(() => {
  const summaries = new Map<string, SavedPlayerPreferredNumber[]>()
  if (!jerseyStore.ready.value) return summaries
  const setLabels = createJerseySetIdentityLabels(jerseyStore.sets.value)
  for (const set of jerseyStore.sets.value) {
    const label = setLabels.get(set.id) ?? set.name
    for (const preference of set.preferredNumbers) {
      const saved = summaries.get(preference.playerId) ?? []
      saved.push({ setId: set.id, label, number: preference.number })
      summaries.set(preference.playerId, saved)
    }
  }
  return summaries
})

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Could not save changes.'
}

async function addPlayer(): Promise<void> {
  localError.value = null
  try {
    await store.persist(createPlayer(newProfile.value))
    newProfile.value = { name: '', positions: [], jerseySize: '' }
  } catch (error) {
    localError.value = errorMessage(error)
  }
}

function beginEdit(playerId: string): void {
  const player = store.players.value.find((item) => item.id === playerId)
  if (!player) return
  closePreferredNumbersEdit()
  editingPlayerId.value = player.id
  editingDraft.value = {
    name: player.name,
    positions: [...player.positions],
    jerseySize: player.jerseySize ?? '',
  }
  localError.value = null
}

function beginEditPreferredNumbers(playerId: string): void {
  const player = store.players.value.find((item) => item.id === playerId)
  if (!player || !jerseyStore.ready.value || jerseyStore.loading.value || jerseyStore.saving.value) return
  const setLabels = createJerseySetIdentityLabels(jerseyStore.sets.value)
  editingPreferredNumbersPlayerId.value = player.id
  editingPlayerId.value = null
  editingDraft.value = null
  preferredNumberDraft.value = jerseyStore.sets.value.map((set) => {
    const preference = set.preferredNumbers.find((item) => item.playerId === player.id)
    return {
      setId: set.id,
      label: setLabels.get(set.id) ?? set.name,
      value: preference === undefined ? '' : String(preference.number),
    }
  })
  preferredNumberError.value = null
  preferredNumberErrorSetId.value = null
  localError.value = null
}

function closePreferredNumbersEdit(): void {
  editingPreferredNumbersPlayerId.value = null
  preferredNumberDraft.value = null
  preferredNumberError.value = null
  preferredNumberErrorSetId.value = null
}

function cancelPreferredNumbersEdit(): void {
  if (!editingPreferredNumbersPlayerId.value) return
  closePreferredNumbersEdit()
}

function closeEdit(): void {
  editingPlayerId.value = null
  editingDraft.value = null
  localError.value = null
}

function cancelEdit(): void {
  if (!editingPlayerId.value) return
  closeEdit()
}

async function saveProfile(playerId: string): Promise<void> {
  const player = store.players.value.find((item) => item.id === playerId)
  const profile = editingDraft.value
  if (!player || !profile) return
  localError.value = null
  try {
    await store.persist(updatePlayerProfile(player, profile))
    closeEdit()
  } catch (error) {
    localError.value = errorMessage(error)
  }
}

async function savePreferredNumbers(playerId: string): Promise<void> {
  const player = store.players.value.find((item) => item.id === playerId)
  const draft = preferredNumberDraft.value
  if (!player || !draft || !jerseyStore.ready.value) return

  let errorSetId: string | null = null
  let updates: PlayerSetNumberInput[]
  try {
    updates = draft.map((row) => {
      errorSetId = row.setId
      return { setId: row.setId, number: parsePreferredNumberDraft(row.value) }
    })
    errorSetId = null
  } catch (error) {
    preferredNumberError.value = errorMessage(error)
    preferredNumberErrorSetId.value = errorSetId
    return
  }

  preferredNumberError.value = null
  preferredNumberErrorSetId.value = null
  try {
    await jerseyStore.updatePlayerNumbers(player.id, updates)
    closePreferredNumbersEdit()
  } catch (error) {
    preferredNumberError.value = errorMessage(error)
  }
}

async function changeArchived(playerId: string): Promise<void> {
  const player = store.players.value.find((item) => item.id === playerId)
  if (!player) return
  localError.value = null
  try {
    await store.persist(player.archived ? restorePlayer(player) : archivePlayer(player))
  } catch (error) {
    localError.value = errorMessage(error)
  }
}

async function retryLoad(): Promise<void> {
  localError.value = null
  try {
    await store.load()
  } catch {
    // The store retains the load error for the accessible retry state.
  }
}

async function retryPreferredNumberLoad(): Promise<void> {
  preferredNumberError.value = null
  try {
    await jerseyStore.load()
  } catch {
    // The directory remains usable; the unavailable preference state stays visible for retry.
  }
}
</script>

<template>
  <section class="player-directory" aria-labelledby="player-directory-heading">
    <header class="directory-heading">
      <div>
        <p class="section-kicker">YOUR SQUAD</p>
        <h2 id="player-directory-heading">My players</h2>
        <p class="directory-intro">Keep your own player list in this browser and reuse it across matches.</p>
      </div>
      <span class="player-count">{{ store.players.value.length }} PLAYER{{ store.players.value.length === 1 ? '' : 'S' }}</span>
    </header>

    <p v-if="store.loading.value || (!store.ready.value && !store.error.value)" class="player-storage-state" role="status" aria-live="polite">
      Loading your players…
    </p>
    <section v-else-if="!store.ready.value" class="player-storage-error" role="alert">
      <p>Your player directory could not be loaded.</p>
      <p>{{ store.error.value }}</p>
      <button class="secondary-button" type="button" @click="retryLoad">Try again</button>
    </section>
    <template v-else>
      <PlayerProfileForm
        :model-value="newProfile"
        id-prefix="create-player"
        mode="create"
        :disabled="store.saving.value"
        :name-invalid="nameInvalid"
        @update:model-value="newProfile = $event"
        @submit="addPlayer"
      />

      <PlayerDirectoryFilters
        :model-value="showArchived"
        :disabled="store.saving.value"
        @update:model-value="showArchived = $event"
      />

      <p v-if="localError || store.saveStatus.value === 'error'" class="player-error" role="alert" aria-live="assertive">
        {{ localError ?? store.error.value }}
      </p>
      <p v-else-if="store.saving.value" class="player-save-status" role="status" aria-live="polite">Saving player changes…</p>

      <p v-if="jerseyStore.loading.value || (!jerseyStore.ready.value && !jerseyStore.error.value)" class="preference-storage-state" role="status" aria-live="polite">
        Loading saved preferred numbers…
      </p>
      <section v-else-if="!jerseyStore.ready.value" class="preference-storage-error" role="alert">
        <p>Saved preferred numbers are unavailable until the jersey sets load.</p>
        <p>{{ jerseyStore.error.value }}</p>
        <button class="secondary-button" type="button" :disabled="jerseyStore.loading.value" @click="retryPreferredNumberLoad">Try again</button>
      </section>

      <PlayerDirectoryList
        :players="visiblePlayers"
        :identity-labels="labels"
        :preferred-number-summaries="preferredNumberSummaries"
        :preferred-numbers-ready="jerseyStore.ready.value"
        :has-preference-sets="jerseyStore.sets.value.length > 0"
        :show-archived="showArchived"
        :editing-player-id="editingPlayerId"
        :editing-draft="editingDraft"
        :editing-preferred-numbers-player-id="editingPreferredNumbersPlayerId"
        :preferred-number-draft="preferredNumberDraft"
        :preferred-number-disabled="jerseyStore.saving.value || jerseyStore.loading.value || !jerseyStore.ready.value"
        :preferred-number-saving="jerseyStore.saving.value"
        :preferred-number-error="preferredNumberError"
        :preferred-number-error-set-id="preferredNumberErrorSetId"
        :disabled="store.saving.value"
        :name-invalid="nameInvalid"
        @edit="beginEdit"
        @update-draft="editingDraft = $event"
        @save-profile="saveProfile"
        @cancel-edit="cancelEdit"
        @edit-preferred-numbers="beginEditPreferredNumbers"
        @update-preferred-number-draft="preferredNumberDraft = $event"
        @save-preferred-numbers="savePreferredNumbers"
        @cancel-preferred-numbers="cancelPreferredNumbersEdit"
        @change-archived="changeArchived"
        @view-statistics="emit('viewStatistics', $event)"
      />
      <p class="local-player-note">Player names and identities stay in this browser. Archiving keeps match history intact.</p>
    </template>
  </section>
</template>

<style scoped>
.player-directory { max-width: 54rem; margin: 0 auto; padding: 3rem 0 3.5rem; }
.directory-heading { display: flex; align-items: end; justify-content: space-between; gap: 1rem; margin-bottom: 1.5rem; }
.section-kicker { margin: 0 0 0.55rem; color: #849087; font-family: 'DM Mono', monospace; font-size: 0.58rem; letter-spacing: 0.1em; }
.directory-heading h2 { margin: 0; font-family: 'Space Grotesk', sans-serif; font-size: 2rem; letter-spacing: -0.05em; }
.directory-intro { margin: 0.6rem 0 0; color: #6d786f; font-size: 0.85rem; line-height: 1.55; }
.player-count { padding-bottom: 0.25rem; color: #8b958c; font-family: 'DM Mono', monospace; font-size: 0.6rem; letter-spacing: 0.1em; white-space: nowrap; }
.player-error, .player-storage-error, .preference-storage-error { padding: 0.75rem 0.9rem; border-radius: 0.35rem; background: #f8e9e6; color: #8a3d34; font-size: 0.78rem; }
.player-save-status, .player-storage-state, .preference-storage-state { color: #627267; font-size: 0.78rem; }
.player-storage-error p, .preference-storage-error p { margin: 0 0 0.6rem; }
.secondary-button { min-height: 2.3rem; padding: 0 0.8rem; border: 1px solid #d1b0aa; border-radius: 0.35rem; background: transparent; color: #8a3d34; }
.local-player-note { color: #89928a; font-size: 0.68rem; line-height: 1.5; }
.local-player-note { margin: 1rem 0 0; }

@media (max-width: 560px) {
  .player-directory { padding: 2.25rem 0 2.75rem; }
  .directory-heading { align-items: start; }
  .directory-heading h2 { font-size: 1.65rem; }
}
</style>
