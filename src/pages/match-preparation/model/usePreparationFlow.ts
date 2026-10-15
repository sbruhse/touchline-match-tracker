import { computed, ref, type Ref } from 'vue'

export type PreparationStep = 'squad' | 'jerseys'

export type PreparationDestination = 'match' | 'archive' | 'players' | 'jersey-sets' | 'statistics'

export interface PreparationNavigationRequest {
  requestId: number
  destination: PreparationDestination
}

type PendingAction =
  | { type: 'step'; step: PreparationStep }
  | { type: 'navigate'; destination: PreparationDestination }

interface PendingConfirmation {
  action: PendingAction
  discardSteps: Array<'squad' | 'jerseys'>
}

export interface PreparationFlowOptions {
  hasSavedSquad: Readonly<Ref<boolean>>
  matchSaving: Readonly<Ref<boolean>>
  navigate: (destination: PreparationDestination) => void
}

export function usePreparationFlow(options: PreparationFlowOptions) {
  const activeStep = ref<PreparationStep>('squad')
  const hasVisitedJerseys = ref(false)
  const squadDirty = ref(false)
  const jerseysDirty = ref(false)
  const stepFeedback = ref<string | null>(null)
  const squadDiscardToken = ref(0)
  const jerseysDiscardToken = ref(0)
  const pendingAction = ref<PendingConfirmation | null>(null)
  const discardConfirmationOpen = computed(() => pendingAction.value !== null)
  const hasDirtyDrafts = computed(() => squadDirty.value || jerseysDirty.value)

  function canNavigate(): boolean {
    return !options.matchSaving.value && !discardConfirmationOpen.value
  }

  function enterStep(step: PreparationStep): boolean {
    if (!canNavigate()) return false
    if (step === 'jerseys' && !options.hasSavedSquad.value) return false
    activeStep.value = step
    if (step === 'jerseys') hasVisitedJerseys.value = true
    return true
  }

  function applyAction(action: PendingAction): void {
    if (action.type === 'step') {
      activeStep.value = action.step
      if (action.step === 'jerseys') hasVisitedJerseys.value = true
      return
    }
    options.navigate(action.destination)
  }

  function requestAction(action: PendingAction, dirtyDrafts: Array<'squad' | 'jerseys'>): boolean {
    if (!canNavigate()) return false
    const discardSteps = dirtyDrafts.filter((step) => step === 'squad' ? squadDirty.value : jerseysDirty.value)
    if (discardSteps.length > 0) {
      pendingAction.value = { action, discardSteps }
      return true
    }
    applyAction(action)
    return true
  }

  function finishToMatch(dirtySteps: Array<'squad' | 'jerseys'> = ['squad', 'jerseys']): boolean {
    return requestAction({ type: 'navigate', destination: 'match' }, dirtySteps)
  }

  function onSquadSaved(): boolean {
    if (!canNavigate()) return false
    stepFeedback.value = 'Match squad saved.'
    if (options.hasSavedSquad.value) return enterStep('jerseys')
    return finishToMatch()
  }

  function onSquadNavigationIntent(_intent: 'keep' | 'skip'): boolean {
    if (!canNavigate()) return false
    if (options.hasSavedSquad.value) {
      return requestAction({ type: 'step', step: 'jerseys' }, ['squad'])
    }
    return finishToMatch(['squad'])
  }

  function onJerseySaved(): boolean {
    stepFeedback.value = 'Jersey assignments saved.'
    return finishToMatch(['squad', 'jerseys'])
  }

  function onJerseyNavigationIntent(_intent: 'keep' | 'skip'): boolean {
    return finishToMatch(['squad', 'jerseys'])
  }

  function backToSquad(): boolean {
    return enterStep('squad')
  }

  function requestNavigation(destination: PreparationDestination): boolean {
    return requestAction({ type: 'navigate', destination }, ['squad', 'jerseys'])
  }

  function cancelDiscard(): void {
    pendingAction.value = null
  }

  function confirmDiscard(): boolean {
    if (!pendingAction.value || options.matchSaving.value) return false
    const { action, discardSteps } = pendingAction.value
    if (discardSteps.includes('squad')) {
      squadDiscardToken.value += 1
      squadDirty.value = false
    }
    if (discardSteps.includes('jerseys')) {
      jerseysDiscardToken.value += 1
      jerseysDirty.value = false
    }
    pendingAction.value = null
    applyAction(action)
    return true
  }

  return {
    activeStep,
    hasVisitedJerseys,
    squadDirty,
    jerseysDirty,
    stepFeedback,
    squadDiscardToken,
    jerseysDiscardToken,
    discardConfirmationOpen,
    hasDirtyDrafts,
    setSquadDirty: (dirty: boolean) => { squadDirty.value = dirty },
    setJerseysDirty: (dirty: boolean) => { jerseysDirty.value = dirty },
    enterStep,
    onSquadSaved,
    onSquadNavigationIntent,
    onJerseySaved,
    onJerseyNavigationIntent,
    backToSquad,
    requestNavigation,
    cancelDiscard,
    confirmDiscard,
  }
}
