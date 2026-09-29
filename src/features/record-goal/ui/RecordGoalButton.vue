<script setup lang="ts">
import { computed } from 'vue'
import { useMatchStore, type MatchSide } from '../../../entities/match'
import { AppIcon } from '../../../shared/ui'
import { recordMatchGoal } from '../model/recordMatchGoal'
import type { CommittedGoalResult } from '../model/recordMatchGoal'

const props = defineProps<{
  matchId: string
  side: MatchSide
  teamName: string
}>()
const emit = defineEmits<{ recorded: [result: CommittedGoalResult] }>()
const store = useMatchStore()
const match = computed(() => store.matches.value.find((item) => item.id === props.matchId) ?? null)

async function recordGoal(): Promise<void> {
  if (!store.ready.value || store.saving.value) return
  const current = match.value
  if (!current) return
  const now = Date.now()
  try {
    emit('recorded', await recordMatchGoal(current, props.side, store, now))
  } catch {
    // The store exposes the failure and retains the last committed score.
  }
}
</script>

<template>
  <button
    class="goal-button"
    type="button"
    :disabled="!store.ready.value || store.saving.value"
    :aria-label="`Record goal for ${teamName}`"
    @click="recordGoal"
  >
    <span class="goal-button__action"><AppIcon name="plus" />Goal</span>
    <span class="goal-button__team">{{ teamName }}</span>
  </button>
</template>

<style scoped>
.goal-button {
  width: 100%;
  min-width: 0;
  min-height: 72px;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  justify-content: center;
  gap: 6px;
  padding: 10px 12px;
  border: 1px solid #cad7c7;
  border-radius: 10px;
  background: #edf3e8;
  color: #204d38;
  text-align: left;
  font-size: 0.75rem;
  font-weight: 700;
  transition: border-color 140ms ease, background 140ms ease, color 140ms ease;
}

.goal-button:not(:disabled):hover { border-color: #9fb69d; background: #e2edda; }
.goal-button:focus-visible { outline: 3px solid #5f8d2e; outline-offset: 2px; }
.goal-button:disabled { cursor: not-allowed; opacity: 0.55; }
.goal-button__action { display: inline-flex; align-items: center; gap: 8px; font-size: 0.9rem; }
.goal-button__team { display: block; max-width: 100%; overflow-wrap: anywhere; font-size: 0.875rem; line-height: 1.2; }
</style>
