<script setup lang="ts">
import { computed, nextTick, useTemplateRef, watch } from 'vue'
import { useMatchStore } from '../../../entities/match'
import { FocusedEditorShell } from '../../../shared/ui'
import { AssignMatchJerseys } from '../../../features/assign-match-jerseys'
import { ConfigureMatchSquad } from '../../../features/configure-match-squad'
import {
  usePreparationFlow,
  type PreparationDestination,
  type PreparationNavigationRequest,
} from '../model/usePreparationFlow'

const props = defineProps<{
  matchId: string
  navigationRequest?: PreparationNavigationRequest | null
}>()
const emit = defineEmits<{
  navigate: [destination: PreparationDestination]
}>()

const matchStore = useMatchStore()
const match = computed(() => matchStore.matches.value.find(({ id }) => id === props.matchId) ?? null)
const hasSavedSquad = computed(() => Boolean(match.value?.participation))
const flow = usePreparationFlow({
  hasSavedSquad,
  matchSaving: matchStore.saving,
  navigate: (destination) => emit('navigate', destination),
})
const { activeStep, hasVisitedJerseys } = flow
const preparationHeading = useTemplateRef<HTMLHeadingElement>('preparationHeading')

watch(() => props.navigationRequest?.requestId, (requestId) => {
  const request = props.navigationRequest
  if (requestId !== undefined && request) flow.requestNavigation(request.destination)
})

watch(activeStep, async () => {
  await nextTick()
  preparationHeading.value?.focus()
})

function enterJerseys(): void {
  flow.enterStep('jerseys')
}

function requestMatch(): void {
  flow.requestNavigation('match')
}

function fallbackPreparationHeading(): HTMLElement | null {
  return document.getElementById('preparation-heading')
}
</script>

<template>
  <main v-if="match" class="match-preparation" aria-labelledby="preparation-heading">
    <header class="preparation-header">
      <div class="preparation-navigation">
        <button v-if="activeStep === 'jerseys'" class="back-step" type="button" @click="flow.backToSquad">Back to squad</button>
        <button v-else class="go-to-match" type="button" :disabled="matchStore.saving.value" @click="requestMatch">Go to match</button>
        <button
          v-if="activeStep === 'squad' && hasSavedSquad"
          class="step-link"
          type="button"
          data-step="jerseys"
          @click="enterJerseys"
        >Jerseys</button>
      </div>
      <p class="team-context">{{ match.homeTeam }} <span aria-hidden="true">vs</span> {{ match.awayTeam }}</p>
      <h1 id="preparation-heading" ref="preparationHeading" tabindex="-1">{{ activeStep === 'squad' ? 'Match squad' : 'Jersey assignments' }}</h1>
      <p class="step-optional">{{ activeStep === 'squad' ? 'Optional · choose your side, squad, and starters' : 'Optional · review jerseys for the saved squad' }}</p>
      <p v-if="flow.stepFeedback.value" class="step-save-feedback" role="status" aria-live="polite">{{ flow.stepFeedback.value }}</p>
    </header>

    <section class="preparation-steps" aria-label="Preparation steps">
      <button
        class="preparation-step"
        type="button"
        data-step="squad"
        :aria-current="activeStep === 'squad' ? 'step' : undefined"
        @click="flow.enterStep('squad')"
      >1. Squad <span v-if="hasSavedSquad">· saved</span></button>
      <button
        v-if="hasSavedSquad"
        class="preparation-step"
        type="button"
        data-step="jerseys"
        :aria-current="activeStep === 'jerseys' ? 'step' : undefined"
        @click="enterJerseys"
      >2. Jerseys <span v-if="hasVisitedJerseys">· optional</span></button>
      <span v-else class="preparation-step preparation-step--unavailable">2. Jerseys · save a squad first</span>
    </section>

    <div class="preparation-content">
      <ConfigureMatchSquad
        :key="`squad-${matchId}`"
        v-show="activeStep === 'squad'"
        :match-id="matchId"
        presentation="workflow"
        :active-step="activeStep === 'squad'"
        :discard-draft-token="flow.squadDiscardToken.value"
        @saved="flow.onSquadSaved"
        @dirty-change="flow.setSquadDirty"
        @navigation-intent="flow.onSquadNavigationIntent"
      />
      <AssignMatchJerseys
        v-if="hasVisitedJerseys && hasSavedSquad"
        :key="`jerseys-${matchId}`"
        v-show="activeStep === 'jerseys'"
        :match-id="matchId"
        mode="prepare"
        presentation="workflow"
        :active-step="activeStep === 'jerseys'"
        :discard-draft-token="flow.jerseysDiscardToken.value"
        @saved="flow.onJerseySaved"
        @dirty-change="flow.setJerseysDirty"
        @navigation-intent="flow.onJerseyNavigationIntent"
      />
    </div>

    <FocusedEditorShell
      :open="flow.discardConfirmationOpen.value"
      title="Discard unsaved preparation changes?"
      :fallback-focus="fallbackPreparationHeading"
      @close="flow.cancelDiscard"
    >
      <p class="discard-guidance">Your last saved squad and jersey distribution will be kept. Only unsaved changes in this preparation session will be discarded.</p>
      <template #actions>
        <button class="keep-editing" type="button" @click="flow.cancelDiscard">Keep editing</button>
        <button class="discard-changes" type="button" @click="flow.confirmDiscard">Discard changes</button>
      </template>
    </FocusedEditorShell>
  </main>
  <main v-else class="match-preparation preparation-load-state" role="status" aria-live="polite">
    <p v-if="matchStore.loading.value">Loading match preparation…</p>
    <p v-else>This match is unavailable.</p>
  </main>
</template>

<style scoped>
.match-preparation { width: min(100% - 2rem, 54rem); min-width: 0; margin: 0 auto; padding: 1rem 0 2rem; color: #17251d; }
.preparation-header { display: grid; gap: 0.4rem; padding: 0.4rem 0 1rem; }
.preparation-navigation { display: flex; justify-content: space-between; gap: 0.75rem; }
.preparation-navigation button, .preparation-step { min-height: 3rem; padding: 0.45rem 0.75rem; border: 1px solid #cbd7ca; border-radius: 0.4rem; background: #fff; color: #204d38; font: inherit; font-weight: 700; }
.preparation-navigation button:focus-visible, .preparation-step:focus-visible { outline: 3px solid #91b83c; outline-offset: 2px; }
.preparation-navigation button:disabled { cursor: not-allowed; opacity: 0.55; }
.team-context { margin: 0; color: #526156; font-size: 0.95rem; font-weight: 600; overflow-wrap: anywhere; }
.team-context span { padding: 0 0.25rem; color: #849087; font-weight: 400; }
.preparation-header h1 { margin: 0; color: #20382a; font-family: 'Space Grotesk', sans-serif; font-size: clamp(1.45rem, 5vw, 2rem); letter-spacing: -0.035em; }
.preparation-header h1:focus { border-radius: 2px; outline: 3px solid #91b83c; outline-offset: 4px; }
.step-optional { margin: 0; color: #526156; font-size: 0.9rem; line-height: 1.45; }
.step-save-feedback { margin: 0.2rem 0 0; color: #315d38; font-size: 0.9rem; font-weight: 650; }
.preparation-steps { display: flex; flex-wrap: wrap; gap: 0.55rem; margin: 0 0 0.8rem; }
.preparation-step { color: #526156; }
.preparation-step[aria-current="step"] { border-color: #204d38; background: #edf3e8; color: #204d38; }
.preparation-step span { font-size: 0.78rem; font-weight: 500; }
.preparation-step--unavailable { display: inline-flex; align-items: center; color: #7a857c; }
.preparation-content { min-width: 0; }
.discard-guidance { color: #526156; font-size: 0.95rem; line-height: 1.5; }
.keep-editing, .discard-changes { min-height: 3rem; padding: 0.45rem 0.85rem; border: 1px solid #cbd7ca; border-radius: 0.4rem; background: #fff; color: #204d38; font: inherit; font-weight: 700; }
.discard-changes { border-color: #78271f; background: #78271f; color: #fff; }
.preparation-load-state { padding-top: 3rem; }
.preparation-load-state p { color: #526156; }
@media (min-width: 700px) {
  .match-preparation { padding-top: 1.5rem; }
  .preparation-header { padding-bottom: 1.4rem; }
}
</style>
