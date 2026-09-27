<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import type { DeepReadonly } from 'vue'
import { RecordGoalButton, type CommittedGoalResult } from '../../../../features/record-goal'
import { RecordSubstitution } from '../../../../features/record-substitution'
import type { Match } from '../../../../entities/match'

const props = defineProps<{ match: DeepReadonly<Match>; canSubstitute: boolean }>()
const emit = defineEmits<{
  goalRecorded: [result: CommittedGoalResult]
  substitutionRecorded: []
  focusedEditorOpened: []
  focusedEditorClosed: []
  resize: [height: number]
}>()

const actionBar = ref<HTMLElement | null>(null)
let resizeObserver: ResizeObserver | null = null

function reportHeight(): void {
  if (actionBar.value) emit('resize', actionBar.value.getBoundingClientRect().height)
}

onMounted(() => {
  reportHeight()
  if (typeof ResizeObserver !== 'undefined' && actionBar.value) {
    resizeObserver = new ResizeObserver(reportHeight)
    resizeObserver.observe(actionBar.value)
  }
})

onBeforeUnmount(() => resizeObserver?.disconnect())
</script>

<template>
  <aside ref="actionBar" class="match-action-area" aria-label="Match recording actions">
    <div class="match-action-area__inner">
      <div class="match-action-area__goal" :title="match.homeTeam">
        <span class="match-action-area__team">{{ match.homeTeam }}</span>
        <RecordGoalButton :match-id="match.id" side="home" :team-name="match.homeTeam" @recorded="emit('goalRecorded', $event)" />
      </div>
      <div class="match-action-area__goal" :title="match.awayTeam">
        <span class="match-action-area__team">{{ match.awayTeam }}</span>
        <RecordGoalButton :match-id="match.id" side="away" :team-name="match.awayTeam" @recorded="emit('goalRecorded', $event)" />
      </div>
      <div v-if="canSubstitute" class="match-action-area__substitution">
        <RecordSubstitution
          :match-id="match.id"
          @recorded="emit('substitutionRecorded')"
          @editor-opened="emit('focusedEditorOpened')"
          @editor-closed="emit('focusedEditorClosed')"
        />
      </div>
    </div>
  </aside>
</template>

<style scoped>
.match-action-area {
  position: fixed;
  z-index: 50;
  right: 0;
  bottom: 0;
  left: 0;
  padding: 10px 12px calc(10px + env(safe-area-inset-bottom));
  background: rgb(255 255 255 / 97%);
  border-top: 1px solid #dfe5dc;
  box-shadow: 0 -8px 24px rgb(23 37 29 / 10%);
  backdrop-filter: blur(12px);
}

.match-action-area__inner { display: grid; grid-template-columns: 1fr 1fr; align-items: stretch; gap: 8px; width: min(100%, 760px); margin: 0 auto; }
.match-action-area__goal { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; gap: 8px; min-width: 0; }
.match-action-area__team { min-width: 0; overflow: hidden; color: #17251d; font-size: 0.875rem; font-weight: 700; text-overflow: ellipsis; white-space: nowrap; }
.match-action-area__goal :deep(.goal-button) { min-height: 48px; min-width: 76px; padding: 0 12px; color: #fff; background: #204d38; border: 0; border-radius: 10px; font-size: 0.9rem; }
.match-action-area__substitution { grid-column: 1 / -1; min-width: 0; }
.match-action-area__substitution :deep(.record-substitution) { margin: 0; overflow: visible; border: 0; background: transparent; }
.match-action-area__substitution :deep(.substitution-hint) { display: none; }

@media (min-width: 680px) {
  .match-action-area { padding-right: 24px; padding-left: 24px; }
  .match-action-area__inner { grid-template-columns: 1fr 1fr auto; align-items: center; }
  .match-action-area__substitution { grid-column: auto; min-width: 180px; }
  .match-action-area__substitution :deep(.start-substitution-button) { width: auto; padding: 0 20px; }
}
</style>
