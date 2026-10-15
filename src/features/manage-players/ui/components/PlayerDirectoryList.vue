<script setup lang="ts">
import { PLAYER_POSITIONS } from '../../../../entities/player'
import type { ReadonlyPlayer, PlayerPosition, PlayerProfileInput } from '../../../../entities/player'
import PlayerJerseyPreferencesForm from './PlayerJerseyPreferencesForm.vue'
import PlayerProfileForm from './PlayerProfileForm.vue'
import type { PlayerJerseyPreferenceDraft, SavedPlayerPreferredNumber } from '../types'

const props = defineProps<{
  players: readonly ReadonlyPlayer[]
  identityLabels: ReadonlyMap<string, string>
  preferredNumberSummaries: ReadonlyMap<string, readonly SavedPlayerPreferredNumber[]>
  preferredNumbersReady: boolean
  hasPreferenceSets: boolean
  showArchived: boolean
  editingPlayerId: string | null
  editingDraft: PlayerProfileInput | null
  editingPreferredNumbersPlayerId: string | null
  preferredNumberDraft: readonly PlayerJerseyPreferenceDraft[] | null
  preferredNumberDisabled: boolean
  preferredNumberSaving: boolean
  preferredNumberError: string | null
  preferredNumberErrorSetId: string | null
  disabled: boolean
  nameInvalid: boolean
}>()

const emit = defineEmits<{
  edit: [playerId: string]
  updateDraft: [draft: PlayerProfileInput]
  saveProfile: [playerId: string]
  cancelEdit: []
  editPreferredNumbers: [playerId: string]
  updatePreferredNumberDraft: [draft: PlayerJerseyPreferenceDraft[]]
  savePreferredNumbers: [playerId: string]
  cancelPreferredNumbers: []
  changeArchived: [playerId: string]
  viewStatistics: [playerId: string]
}>()

function labelFor(playerId: string): string {
  return props.identityLabels.get(playerId) ?? ''
}

function positionsFor(player: ReadonlyPlayer): typeof PLAYER_POSITIONS[number][] {
  const selected = new Set<PlayerPosition>(player.positions)
  return PLAYER_POSITIONS.filter(({ code }) => selected.has(code))
}

function positionNamesFor(player: ReadonlyPlayer): string {
  return positionsFor(player).map(({ name }) => name).join(', ')
}

</script>

<template>
  <ul v-if="players.length" class="player-list" aria-label="Players">
    <li v-for="player in players" :key="player.id" class="player-card" data-testid="player-card" :data-player-id="player.id">
      <div class="player-card-info">
        <div class="player-card-name">
          <strong>{{ labelFor(player.id) }}</strong>
          <span v-if="player.archived" class="archived-badge">Archived</span>
        </div>
        <p v-if="player.jerseySize" class="player-size-summary" :aria-label="`Jersey size: ${player.jerseySize}`">
          Jersey size <strong>{{ player.jerseySize }}</strong>
        </p>
        <div class="player-preference-summary" aria-label="Saved preferred numbers">
          <span class="preference-summary-label">Preferred numbers</span>
          <ul v-if="preferredNumbersReady && preferredNumberSummaries.get(player.id)?.length" class="preferred-number-list">
            <li v-for="preference in preferredNumberSummaries.get(player.id)" :key="preference.setId">
              <span>{{ preference.label }}</span> <strong>{{ preference.number }}</strong>
            </li>
          </ul>
          <span v-else-if="!preferredNumbersReady" class="preference-summary-unavailable">Unavailable until jersey sets load.</span>
          <span v-else-if="hasPreferenceSets" class="preference-summary-empty">None saved</span>
          <span v-else class="preference-summary-empty">No jersey sets yet</span>
        </div>
        <div
          v-if="player.positions.length"
          class="player-position-summary"
          role="group"
          :aria-label="`Positions: ${positionNamesFor(player)}`"
          lang="de"
        >
          <span
            v-for="position in positionsFor(player)"
            :key="position.code"
            class="player-position-badge"
            :aria-label="`${position.name} (${position.code})`"
            :title="position.name"
          >{{ position.code }}</span>
        </div>
      </div>
      <PlayerProfileForm
        v-if="editingPlayerId === player.id && editingDraft"
        :model-value="editingDraft"
        :id-prefix="`edit-player-${player.id}`"
        mode="edit"
        :disabled="disabled"
        :name-invalid="nameInvalid"
        @update:model-value="emit('updateDraft', $event)"
        @submit="emit('saveProfile', player.id)"
        @cancel="emit('cancelEdit')"
      />
      <PlayerJerseyPreferencesForm
        v-else-if="editingPreferredNumbersPlayerId === player.id && preferredNumberDraft"
        :model-value="preferredNumberDraft"
        :id-prefix="`preferred-player-${player.id}`"
        :disabled="disabled || preferredNumberDisabled"
        :saving="preferredNumberSaving"
        :error="preferredNumberError"
        :error-set-id="preferredNumberErrorSetId"
        @update:model-value="emit('updatePreferredNumberDraft', $event)"
        @submit="emit('savePreferredNumbers', player.id)"
        @cancel="emit('cancelPreferredNumbers')"
      />
      <template v-else>
        <div class="player-card-actions">
          <button
            :id="`edit-profile-${player.id}`"
            type="button"
            :disabled="disabled"
            :data-edit-player-id="player.id"
            :aria-label="`Edit profile for ${labelFor(player.id)}`"
            @click="emit('edit', player.id)"
          >Edit profile</button>
          <button
            :id="`edit-preferred-numbers-${player.id}`"
            type="button"
            :disabled="disabled || preferredNumberDisabled"
            :aria-label="`Edit preferred numbers for ${labelFor(player.id)}`"
            @click="emit('editPreferredNumbers', player.id)"
          >Edit preferred numbers</button>
          <button
            type="button"
            :disabled="disabled"
            :aria-label="`${player.archived ? 'Restore' : 'Archive'} ${labelFor(player.id)}`"
            @click="emit('changeArchived', player.id)"
          >{{ player.archived ? 'Restore' : 'Archive' }}</button>
          <button
            type="button"
            :disabled="disabled"
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
</template>

<style scoped>
.player-list { display: grid; gap: 0.55rem; margin: 0; padding: 0; list-style: none; }
.player-card { min-width: 0; min-height: 4rem; display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; gap: 0.6rem 1rem; padding: 0.65rem 0.85rem; border: 1px solid #e4e8e1; border-radius: 0.45rem; background: rgb(255 255 255 / 78%); }
.player-card-info { min-width: 0; grid-column: 1; }
.player-card-name { display: flex; align-items: center; flex-wrap: wrap; gap: 0.6rem; min-width: 0; overflow-wrap: anywhere; font-size: 0.85rem; }
.player-size-summary { margin: 0.35rem 0 0; color: #637066; font-size: 0.68rem; }
.player-size-summary strong { color: #405748; font-weight: 700; }
.player-preference-summary { display: grid; justify-items: start; gap: 0.2rem; margin-top: 0.35rem; color: #637066; font-size: 0.68rem; }
.preference-summary-label { color: #637066; }
.preferred-number-list { display: flex; flex-wrap: wrap; gap: 0.25rem 0.6rem; margin: 0; padding: 0; list-style: none; }
.preferred-number-list li { overflow-wrap: anywhere; }
.preferred-number-list strong { color: #405748; }
.preference-summary-unavailable { color: #8a3d34; }
.preference-summary-empty { color: #89928a; }
.player-position-summary { display: flex; flex-wrap: wrap; gap: 0.28rem; margin-top: 0.45rem; }
.player-position-badge { min-width: 2.1rem; min-height: 1.65rem; display: inline-flex; align-items: center; justify-content: center; padding: 0 0.35rem; border: 1px solid #d7e2d2; border-radius: 0.25rem; background: #edf3e9; color: #496343; font-family: 'DM Mono', monospace; font-size: 0.65rem; font-weight: 600; }
.archived-badge { padding: 0.18rem 0.4rem; border-radius: 999px; background: #eff1ed; color: #768076; font-size: 0.59rem; }
.player-card-actions { display: flex; flex: 0 0 auto; flex-wrap: wrap; grid-column: 2; gap: 0.4rem; }
.player-card-actions button { min-height: 2.75rem; padding: 0 0.65rem; border: 1px solid #dfe5dc; border-radius: 0.3rem; background: transparent; color: #405748; font-size: 0.69rem; }
.player-card-actions button:disabled { cursor: not-allowed; opacity: 0.5; }
.player-card > .player-profile-form, .player-card > .preferred-number-form { width: 100%; min-width: 0; grid-column: 1 / -1; }
.empty-players { padding: 1.2rem 0; color: #69756b; font-size: 0.8rem; }
.empty-players p { margin: 0 0 0.3rem; color: var(--ink); font-weight: 600; }
.empty-players span { color: #89928a; font-size: 0.68rem; line-height: 1.5; }
@media (max-width: 560px) {
  .player-card { grid-template-columns: minmax(0, 1fr); align-items: stretch; }
  .player-card-actions { width: 100%; grid-column: 1; }
  .player-card-actions button { flex: 1; }
}
</style>
