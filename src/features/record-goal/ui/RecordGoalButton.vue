<script setup lang="ts">
import { computed } from 'vue'
import { useMatchStore, type MatchSide } from '../../../entities/match'
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
  ><span aria-hidden="true">＋</span> Goal</button>
</template>

<style scoped>
.goal-button {
  min-width: 6.5rem;
  min-height: 2.35rem;
  padding: 0 0.75rem;
  border: 1px solid #dbe4d8;
  border-radius: 0.35rem;
  background: #f5f8f2;
  color: var(--green);
  font-size: 0.75rem;
  font-weight: 700;
  transition: border-color 140ms ease, background 140ms ease, transform 140ms ease;
}

.goal-button:hover { transform: translateY(-1px); border-color: #a9bea7; background: #ebf2e6; }
.goal-button:disabled { cursor: not-allowed; opacity: 0.55; }
.goal-button span { margin-right: 0.15rem; font-size: 0.9rem; }
</style>
