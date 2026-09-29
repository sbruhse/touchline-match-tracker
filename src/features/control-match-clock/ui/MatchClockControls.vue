<script setup lang="ts">
import { computed } from 'vue'
import { useMatchStore } from '../../../entities/match'
import { AppIcon } from '../../../shared/ui'
import { applyMatchClockAction, type MatchClockAction } from '../model/controlMatchClock'

const props = defineProps<{ matchId: string }>()
const emit = defineEmits<{ updated: [now: number] }>()
const store = useMatchStore()
const match = computed(() => store.matches.value.find((item) => item.id === props.matchId) ?? null)

async function perform(action: MatchClockAction): Promise<void> {
  if (!store.ready.value || store.saving.value) return
  const current = match.value
  if (!current) return
  const now = Date.now()
  try {
    await applyMatchClockAction(current, action, store, now)
    emit('updated', now)
  } catch {
    // The store exposes the failure and keeps the last committed clock.
  }
}
</script>

<template>
  <div v-if="match" class="clock-actions" aria-label="Match clock controls">
    <button
      v-if="match.clock.status === 'not-started'"
      class="primary-button clock-primary"
      type="button"
      :disabled="!store.ready.value || store.saving.value"
      @click="perform('resume')"
    ><AppIcon name="play" />Start first half</button>
    <template v-else-if="match.clock.status === 'running'">
      <button class="primary-button clock-primary" type="button" :disabled="!store.ready.value || store.saving.value" @click="perform('pause')">
        <AppIcon name="pause" />Pause clock
      </button>
      <button
        v-if="match.clock.period === 1"
        class="secondary-button"
        type="button"
        :disabled="!store.ready.value || store.saving.value"
        @click="perform('end-first-half')"
      >Half-time</button>
      <button v-else class="secondary-button" type="button" :disabled="!store.ready.value || store.saving.value" @click="perform('finish')">Full-time</button>
    </template>
    <template v-else-if="match.clock.status === 'paused'">
      <button class="primary-button clock-primary" type="button" :disabled="!store.ready.value || store.saving.value" @click="perform('resume')">
        <AppIcon name="play" />Resume clock
      </button>
      <button
        v-if="match.clock.period === 1"
        class="secondary-button"
        type="button"
        :disabled="!store.ready.value || store.saving.value"
        @click="perform('end-first-half')"
      >Half-time</button>
      <button v-else class="secondary-button" type="button" :disabled="!store.ready.value || store.saving.value" @click="perform('finish')">Full-time</button>
    </template>
    <button
      v-else-if="match.clock.status === 'halftime'"
      class="primary-button clock-primary"
      type="button"
      :disabled="!store.ready.value || store.saving.value"
      @click="perform('start-second-half')"
    ><AppIcon name="play" />Start second half</button>
    <p v-else class="full-time-message">The final whistle. Match complete.</p>
  </div>
</template>

<style scoped>
.clock-actions { display: flex; align-items: center; justify-content: center; gap: 0.65rem; flex-wrap: wrap; }

.primary-button {
  width: 100%;
  min-height: 48px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 0 12px;
  border: 1px solid #cad7c7;
  border-radius: 10px;
  background: #edf3e8;
  color: #204d38;
  font-size: 0.85rem;
  font-weight: 600;
  transition: border-color 140ms ease, background 140ms ease, color 140ms ease;
}

.primary-button:not(:disabled):hover { border-color: #9fb69d; background: #e2edda; }
.primary-button:focus-visible, .secondary-button:focus-visible { outline: 3px solid #5f8d2e; outline-offset: 2px; }
.primary-button:disabled { cursor: not-allowed; opacity: 0.55; }
.clock-primary { width: auto; min-width: 0; }

.secondary-button {
  min-height: 48px;
  padding: 0 1rem;
  border: 1px solid #cad7c7;
  border-radius: 10px;
  background: #fff;
  color: #204d38;
  font-size: 0.8rem;
  font-weight: 600;
}

.secondary-button:not(:disabled):hover { border-color: #9fb69d; background: #f4f8f1; }
.secondary-button:disabled { cursor: not-allowed; opacity: 0.55; }
.full-time-message { margin: 0.7rem 0 0.2rem; color: #526156; font-size: 0.85rem; }

@media (max-width: 760px) {
  .clock-actions { flex-direction: column; }
  .clock-primary, .secondary-button { width: 100%; }
}
</style>
