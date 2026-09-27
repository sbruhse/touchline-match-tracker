<script setup lang="ts">
import { computed } from 'vue'
import { useMatchStore } from '../../../entities/match'
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
    >Start first half <span aria-hidden="true">▶</span></button>
    <template v-else-if="match.clock.status === 'running'">
      <button class="primary-button clock-primary" type="button" :disabled="!store.ready.value || store.saving.value" @click="perform('pause')">
        Pause clock <span aria-hidden="true">Ⅱ</span>
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
        Resume clock <span aria-hidden="true">▶</span>
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
    >Start second half <span aria-hidden="true">▶</span></button>
    <p v-else class="full-time-message">The final whistle. Match complete.</p>
  </div>
</template>

<style scoped>
.clock-actions { display: flex; align-items: center; justify-content: center; gap: 0.65rem; flex-wrap: wrap; }

.primary-button {
  width: 100%;
  min-height: 3rem;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 1rem;
  border: 0;
  border-radius: 0.35rem;
  background: var(--green);
  color: #fff;
  font-size: 0.85rem;
  font-weight: 600;
  transition: background 140ms ease, transform 140ms ease;
}

.primary-button:not(:disabled):hover { transform: translateY(-1px); background: var(--green-dark); }
.primary-button:disabled { cursor: not-allowed; opacity: 0.48; }
.clock-primary { width: auto; min-width: 13rem; padding: 0 1.1rem; background: var(--lime); color: #1d3826; }
.clock-primary:not(:disabled):hover { background: #e0f79a; }

.secondary-button {
  min-height: 3rem;
  padding: 0 1rem;
  border: 1px solid rgb(255 255 255 / 26%);
  border-radius: 0.35rem;
  background: transparent;
  color: #f3f6ef;
  font-size: 0.8rem;
  font-weight: 600;
}

.secondary-button:hover { border-color: rgb(255 255 255 / 58%); background: rgb(255 255 255 / 7%); }
.secondary-button:disabled { cursor: not-allowed; opacity: 0.55; }
.full-time-message { margin: 0.7rem 0 0.2rem; color: #e4eadf; font-size: 0.85rem; }

@media (max-width: 760px) {
  .clock-actions { flex-direction: column; }
  .clock-primary, .secondary-button { width: 100%; }
}
</style>
