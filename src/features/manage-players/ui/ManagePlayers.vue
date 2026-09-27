<script setup lang="ts">
import { computed, ref } from 'vue'
import { createPlayer, renamePlayer, archivePlayer, restorePlayer, usePlayerStore } from '../../../entities/player'

const store = usePlayerStore()
const emit = defineEmits<{ viewStatistics: [playerId: string] }>()
const newName = ref('')
const localError = ref<string | null>(null)
const showArchived = ref(false)
const editingPlayerId = ref<string | null>(null)
const editingName = ref('')

const visiblePlayers = computed(() => store.players.value.filter((player) => player.archived === showArchived.value))
const labels = computed(() => {
  const groups = new Map<string, typeof store.players.value>()
  for (const player of store.players.value) {
    const key = player.name.trim().toLocaleLowerCase()
    groups.set(key, [...(groups.get(key) ?? []), player])
  }

  const labelsById = new Map<string, string>()
  for (const group of groups.values()) {
    if (group.length === 1) {
      labelsById.set(group[0].id, group[0].name)
      continue
    }

    for (const player of group) {
      const stableId = player.id.replace(/[^a-z0-9]/gi, '') || player.id
      let length = Math.min(4, stableId.length)
      while (length < stableId.length && group.some((other) =>
        other.id !== player.id
        && (other.id.replace(/[^a-z0-9]/gi, '') || other.id).slice(0, length).toLowerCase() === stableId.slice(0, length).toLowerCase(),
      )) {
        length += 1
      }
      labelsById.set(player.id, `${player.name} · ${stableId.slice(0, length)}`)
    }
  }
  return labelsById
})

function labelFor(playerId: string): string {
  return labels.value.get(playerId) ?? ''
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Could not save player changes.'
}

async function addPlayer(): Promise<void> {
  localError.value = null
  try {
    await store.persist(createPlayer(newName.value))
    newName.value = ''
  } catch (error) {
    localError.value = errorMessage(error)
  }
}

function beginRename(playerId: string): void {
  const player = store.players.value.find((item) => item.id === playerId)
  if (!player) return
  editingPlayerId.value = player.id
  editingName.value = player.name
  localError.value = null
}

function cancelRename(): void {
  editingPlayerId.value = null
  editingName.value = ''
  localError.value = null
}

async function saveRename(playerId: string): Promise<void> {
  const player = store.players.value.find((item) => item.id === playerId)
  if (!player) return
  localError.value = null
  try {
    await store.persist(renamePlayer(player, editingName.value))
    cancelRename()
  } catch (error) {
    localError.value = errorMessage(error)
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
      <form class="player-create-form" @submit.prevent="addPlayer">
        <label for="new-player-name">Player name</label>
        <div class="create-player-row">
          <input
            id="new-player-name"
            v-model="newName"
            name="playerName"
            maxlength="60"
            autocomplete="off"
            placeholder="e.g. Alex Morgan"
            :disabled="store.saving.value"
            :aria-invalid="localError === 'A player name is required.'"
          />
          <button class="primary-button" type="submit" :disabled="store.saving.value">Add player</button>
        </div>
      </form>

      <div class="player-filter" role="group" aria-label="Filter players">
        <button type="button" :aria-pressed="!showArchived" @click="showArchived = false">Active</button>
        <button type="button" :aria-pressed="showArchived" @click="showArchived = true">Archived</button>
      </div>

      <p v-if="localError || store.saveStatus.value === 'error'" class="player-error" role="alert" aria-live="assertive">
        {{ localError ?? store.error.value }}
      </p>
      <p v-else-if="store.saving.value" class="player-save-status" role="status" aria-live="polite">Saving player changes…</p>

      <ul v-if="visiblePlayers.length" class="player-list" aria-label="Players">
        <li v-for="player in visiblePlayers" :key="player.id" class="player-card" data-testid="player-card" :data-player-id="player.id">
          <div v-if="editingPlayerId === player.id" class="player-edit-row">
            <label class="visually-hidden" :for="`edit-player-${player.id}`">New name for {{ labelFor(player.id) }}</label>
            <input
              :id="`edit-player-${player.id}`"
              v-model="editingName"
              :disabled="store.saving.value"
              maxlength="60"
              autocomplete="off"
            />
            <button type="button" :disabled="store.saving.value" @click="saveRename(player.id)">Save name</button>
            <button type="button" :disabled="store.saving.value" @click="cancelRename">Cancel</button>
          </div>
          <template v-else>
            <div class="player-card-name">
              <strong>{{ labelFor(player.id) }}</strong>
              <span v-if="player.archived" class="archived-badge">Archived</span>
            </div>
            <div class="player-card-actions">
              <button
                type="button"
                :disabled="store.saving.value"
                :aria-label="`Rename ${labelFor(player.id)}`"
                @click="beginRename(player.id)"
              >Rename</button>
              <button
                type="button"
                :disabled="store.saving.value"
                :aria-label="`${player.archived ? 'Restore' : 'Archive'} ${labelFor(player.id)}`"
                @click="changeArchived(player.id)"
              >{{ player.archived ? 'Restore' : 'Archive' }}</button>
              <button
                type="button"
                :aria-label="`View statistics for ${labelFor(player.id)}`"
                @click="emit('viewStatistics', player.id)"
              >Statistics</button>
            </div>
          </template>
        </li>
      </ul>
      <div v-else class="empty-players">
        <p>{{ showArchived ? 'No archived players.' : 'No players added yet.' }}</p>
        <span v-if="!showArchived">Add your squad once and select them when setting up a match.</span>
      </div>
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
.player-create-form { padding: 1.25rem; border: 1px solid #e4e8e1; border-radius: 0.55rem; background: var(--paper); }
.player-create-form label { display: block; margin-bottom: 0.45rem; color: #49564d; font-size: 0.75rem; font-weight: 600; }
.create-player-row { display: flex; gap: 0.65rem; }
.create-player-row input, .player-edit-row input { min-width: 0; min-height: 2.8rem; flex: 1; padding: 0 0.75rem; border: 1px solid #dfe5dc; border-radius: 0.35rem; background: #fbfcfa; color: var(--ink); }
.primary-button, .player-edit-row button { min-height: 2.8rem; padding: 0 1rem; border: 0; border-radius: 0.35rem; background: var(--green); color: #fff; font-size: 0.78rem; font-weight: 600; }
.primary-button:disabled, .player-edit-row button:disabled, .player-card-actions button:disabled { cursor: not-allowed; opacity: 0.5; }
.player-filter { display: flex; gap: 0.45rem; margin: 1.25rem 0 0.85rem; }
.player-filter button { min-height: 2.3rem; padding: 0 0.85rem; border: 1px solid #dfe5dc; border-radius: 999px; background: transparent; color: #627066; font-size: 0.72rem; }
.player-filter button[aria-pressed='true'] { border-color: var(--green); background: var(--green); color: #fff; }
.player-error, .player-storage-error { padding: 0.75rem 0.9rem; border-radius: 0.35rem; background: #f8e9e6; color: #8a3d34; font-size: 0.78rem; }
.player-save-status, .player-storage-state { color: #627267; font-size: 0.78rem; }
.player-storage-error p { margin: 0 0 0.6rem; }
.secondary-button { min-height: 2.3rem; padding: 0 0.8rem; border: 1px solid #d1b0aa; border-radius: 0.35rem; background: transparent; color: #8a3d34; }
.player-list { display: grid; gap: 0.55rem; margin: 0; padding: 0; list-style: none; }
.player-card { min-height: 4rem; display: flex; align-items: center; justify-content: space-between; gap: 1rem; padding: 0.65rem 0.85rem; border: 1px solid #e4e8e1; border-radius: 0.45rem; background: rgb(255 255 255 / 78%); }
.player-card-name { display: flex; align-items: center; gap: 0.6rem; min-width: 0; font-size: 0.85rem; }
.archived-badge { padding: 0.18rem 0.4rem; border-radius: 999px; background: #eff1ed; color: #768076; font-size: 0.59rem; }
.player-card-actions { display: flex; flex: 0 0 auto; gap: 0.4rem; }
.player-card-actions button { min-height: 2.25rem; padding: 0 0.65rem; border: 1px solid #dfe5dc; border-radius: 0.3rem; background: transparent; color: #405748; font-size: 0.69rem; }
.player-edit-row { width: 100%; display: flex; align-items: center; gap: 0.45rem; }
.player-edit-row button:last-child { border: 1px solid #dfe5dc; background: transparent; color: #405748; }
.empty-players { padding: 1.2rem 0; color: #69756b; font-size: 0.8rem; }
.empty-players p { margin: 0 0 0.3rem; color: var(--ink); font-weight: 600; }
.empty-players span, .local-player-note { color: #89928a; font-size: 0.68rem; line-height: 1.5; }
.local-player-note { margin: 1rem 0 0; }
.visually-hidden { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; clip-path: inset(50%); }

@media (max-width: 560px) {
  .player-directory { padding: 2.25rem 0 2.75rem; }
  .directory-heading { align-items: start; }
  .directory-heading h2 { font-size: 1.65rem; }
  .create-player-row { flex-direction: column; }
  .create-player-row .primary-button { width: 100%; }
  .player-card { align-items: flex-start; flex-direction: column; }
  .player-card-actions { width: 100%; }
  .player-card-actions button { flex: 1; }
  .player-edit-row { flex-wrap: wrap; }
  .player-edit-row input { flex-basis: 100%; }
}
</style>
