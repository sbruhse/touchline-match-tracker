<script setup lang="ts">
import { normalizePlayerPositions, PLAYER_POSITIONS } from '../../../../entities/player'
import type { PlayerPosition, PlayerProfileInput } from '../../../../entities/player'

interface PositionGroup {
  name: string
  positions: typeof PLAYER_POSITIONS[number][]
}

const props = defineProps<{
  modelValue: PlayerProfileInput
  idPrefix: string
  mode: 'create' | 'edit'
  disabled: boolean
  nameInvalid?: boolean
}>()

const emit = defineEmits<{
  'update:modelValue': [draft: PlayerProfileInput]
  submit: []
  cancel: []
}>()

const positionGroups = PLAYER_POSITIONS.reduce<PositionGroup[]>((groups, position) => {
  const group = groups.find(({ name }) => name === position.group)
  if (group) group.positions.push(position)
  else groups.push({ name: position.group, positions: [position] })
  return groups
}, [])

function updateName(name: string): void {
  emit('update:modelValue', {
    name,
    positions: [...props.modelValue.positions],
    jerseySize: props.modelValue.jerseySize ?? '',
  })
}

function updateJerseySize(jerseySize: string): void {
  emit('update:modelValue', {
    name: props.modelValue.name,
    positions: [...props.modelValue.positions],
    jerseySize,
  })
}

function updatePosition(position: PlayerPosition, checked: boolean): void {
  const selected = new Set(props.modelValue.positions)
  if (checked) selected.add(position)
  else selected.delete(position)
  emit('update:modelValue', {
    name: props.modelValue.name,
    positions: normalizePlayerPositions([...selected]),
    jerseySize: props.modelValue.jerseySize ?? '',
  })
}

</script>

<template>
  <form class="player-profile-form" @submit.prevent="emit('submit')">
    <label class="profile-name-label" :for="`${idPrefix}-name`">Player name</label>
    <input
      :id="`${idPrefix}-name`"
      :value="modelValue.name"
      name="playerName"
      maxlength="60"
      autocomplete="off"
      placeholder="e.g. Alex Morgan"
      required
      :disabled="disabled"
      :aria-invalid="nameInvalid ? 'true' : undefined"
      @input="updateName(($event.target as HTMLInputElement).value)"
    />

    <label class="profile-size-label" :for="`${idPrefix}-jersey-size`">Jersey size (optional)</label>
    <input
      :id="`${idPrefix}-jersey-size`"
      :value="modelValue.jerseySize ?? ''"
      name="jerseySize"
      autocomplete="off"
      placeholder="e.g. 164 or S/M"
      :disabled="disabled"
      @input="updateJerseySize(($event.target as HTMLInputElement).value)"
    />

    <p class="position-help">Positions are optional. Choose every position this player can play.</p>
    <div class="position-groups">
      <fieldset v-for="group in positionGroups" :key="group.name" class="position-group">
        <legend lang="de">{{ group.name }}</legend>
        <label
          v-for="position in group.positions"
          :key="position.code"
          class="position-choice"
          :for="`${idPrefix}-position-${position.code}`"
          lang="de"
        >
          <input
            :id="`${idPrefix}-position-${position.code}`"
            type="checkbox"
            :checked="modelValue.positions.includes(position.code)"
            :disabled="disabled"
            @change="updatePosition(position.code, ($event.target as HTMLInputElement).checked)"
          />
          <span class="position-name">{{ position.name }}</span>
          <span class="position-code">{{ position.code }}</span>
        </label>
      </fieldset>
    </div>

    <div class="profile-form-actions">
      <button class="primary-button" type="submit" :disabled="disabled">
        {{ mode === 'create' ? 'Add player' : 'Save profile' }}
      </button>
      <button v-if="mode === 'edit'" class="cancel-button" type="button" :disabled="disabled" @click="emit('cancel')">
        Cancel
      </button>
    </div>
  </form>
</template>

<style scoped>
.player-profile-form { display: grid; gap: 0.7rem; padding: 1.25rem; border: 1px solid #e4e8e1; border-radius: 0.55rem; background: var(--paper); }
.profile-name-label, .profile-size-label { color: #49564d; font-size: 0.75rem; font-weight: 600; }
.player-profile-form > input { width: 100%; min-width: 0; min-height: 2.8rem; padding: 0 0.75rem; border: 1px solid #dfe5dc; border-radius: 0.35rem; background: #fbfcfa; color: var(--ink); }
.player-profile-form > input[aria-invalid='true'] { border-color: #a5473d; }
.position-help { margin: 0.2rem 0 0; color: #718075; font-size: 0.72rem; line-height: 1.45; }
.position-groups { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0.55rem; }
.position-group { min-width: 0; margin: 0; padding: 0.4rem; border: 1px solid #e4e8e1; border-radius: 0.35rem; }
.position-group legend { padding: 0 0.25rem; color: #526156; font-size: 0.7rem; font-weight: 700; }
.position-choice { min-height: 2.75rem; display: flex; align-items: center; gap: 0.55rem; padding: 0.35rem 0.4rem; border-radius: 0.25rem; color: #3f4f43; font-size: 0.74rem; cursor: pointer; }
.position-choice:hover { background: #f0f4ed; }
.position-choice input { width: 1.05rem; height: 1.05rem; flex: 0 0 auto; accent-color: var(--green); }
.position-name { min-width: 0; overflow-wrap: anywhere; }
.position-code { margin-left: auto; color: #708071; font-family: 'DM Mono', monospace; font-size: 0.65rem; }
.profile-form-actions { display: flex; flex-wrap: wrap; gap: 0.5rem; }
.primary-button, .cancel-button { min-height: 2.8rem; padding: 0 1rem; border: 0; border-radius: 0.35rem; font-size: 0.78rem; font-weight: 600; }
.primary-button { background: var(--green); color: #fff; }
.cancel-button { border: 1px solid #dfe5dc; background: transparent; color: #405748; }
.primary-button:disabled, .cancel-button:disabled { cursor: not-allowed; opacity: 0.5; }
@media (max-width: 560px) {
  .position-groups { grid-template-columns: minmax(0, 1fr); }
  .profile-form-actions > button { flex: 1 1 8rem; }
}
</style>
