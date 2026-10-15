<script setup lang="ts">
import type { MatchSide } from '../../../../entities/match'
import type { MatchSquadPlayerChoice } from '../../model/configureMatchSquad'
import MatchSquadPlayerList from './MatchSquadPlayerList.vue'

defineProps<{
  homeTeam: string
  awayTeam: string
  ownSide: MatchSide | ''
  squadPlayerIds: string[]
  starterIds: string[]
  choices: MatchSquadPlayerChoice[]
  disabled: boolean
  saving: boolean
  error: string | null
  saveLabel: string
  cancelLabel: string
}>()
const emit = defineEmits<{
  updateOwnSide: [side: MatchSide]
  toggleSquadPlayer: [payload: { playerId: string; checked: boolean }]
  toggleStarter: [payload: { playerId: string; checked: boolean }]
  save: []
  cancel: []
}>()
</script>

<template>
  <form class="squad-form" @submit.prevent="emit('save')">
    <fieldset class="side-choice">
      <legend>Which side is your team?</legend>
      <label>
        <input type="radio" name="own-side" value="home" :checked="ownSide === 'home'" :disabled="disabled" @change="emit('updateOwnSide', 'home')" />
        <span>Home · {{ homeTeam }}</span>
      </label>
      <label>
        <input type="radio" name="own-side" value="away" :checked="ownSide === 'away'" :disabled="disabled" @change="emit('updateOwnSide', 'away')" />
        <span>Away · {{ awayTeam }}</span>
      </label>
    </fieldset>

    <fieldset class="player-choice-list">
      <legend>Select match squad players and starters</legend>
      <p class="fieldset-help">Squad size is flexible. Every starter must also be in the squad.</p>
      <MatchSquadPlayerList
        :choices="choices"
        :squad-player-ids="squadPlayerIds"
        :starter-ids="starterIds"
        :disabled="disabled"
        @toggle-squad-player="emit('toggleSquadPlayer', $event)"
        @toggle-starter="emit('toggleStarter', $event)"
      />
    </fieldset>

    <p v-if="error" class="squad-error" role="alert" aria-live="assertive">{{ error }}</p>
    <div class="squad-form-actions">
      <button class="primary-button" type="submit" :disabled="disabled">{{ saveLabel }}</button>
      <button class="quiet-button" type="button" :disabled="disabled" @click="emit('cancel')">{{ cancelLabel }}</button>
    </div>
    <p v-if="saving" class="squad-state" role="status" aria-live="polite">Saving match squad…</p>
  </form>
</template>

<style scoped>
.squad-form { display: grid; gap: 1rem; }
.side-choice, .player-choice-list { min-width: 0; margin: 0; padding: 0; border: 0; }
.side-choice legend, .player-choice-list legend { margin-bottom: 0.45rem; color: #17251d; font-size: 0.95rem; font-weight: 700; }
.side-choice { display: flex; flex-wrap: wrap; gap: 0.55rem; }
.side-choice legend { flex-basis: 100%; }
.side-choice label { display: flex; align-items: center; gap: 0.5rem; min-height: 3rem; padding: 0.4rem 0.75rem; border: 1px solid #dfe8e0; border-radius: 0.35rem; background: #fff; color: #33483a; font-size: 0.92rem; }
.side-choice input { accent-color: var(--green); }
.fieldset-help { margin: -0.2rem 0 0.5rem; color: #526156; font-size: 0.9rem; line-height: 1.5; }
.squad-error { margin: 0; padding: 0.65rem 0.75rem; border-radius: 0.3rem; background: #f8e9e6; color: #78271f; font-size: 0.9rem; }
.squad-form-actions { display: flex; flex-wrap: wrap; gap: 0.5rem; margin-top: 0.7rem; }
.primary-button, .quiet-button { min-height: 3rem; padding: 0.45rem 0.8rem; border-radius: 0.35rem; font-size: 0.9rem; font-weight: 650; }
.primary-button { border: 0; background: var(--green); color: #fff; }
.quiet-button { border: 1px solid transparent; background: transparent; color: #718075; }
.primary-button:disabled, .quiet-button:disabled { cursor: not-allowed; opacity: 0.5; }
.squad-state { margin: 0.45rem 0 0; color: #69766c; font-size: 0.74rem; }

@media (max-width: 520px) {
  .squad-form-actions > button { flex: 1; }
}
</style>
