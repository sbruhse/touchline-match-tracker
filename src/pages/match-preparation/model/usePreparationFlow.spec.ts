import { ref } from 'vue'
import { describe, expect, it, vi } from 'vitest'
import { usePreparationFlow } from './usePreparationFlow'

describe('usePreparationFlow', () => {
  it('bypasses jerseys when no squad exists and skip does not write match data', () => {
    const navigate = vi.fn()
    const persist = vi.fn()
    const flow = usePreparationFlow({ hasSavedSquad: ref(false), matchSaving: ref(false), navigate })

    expect(flow.enterStep('jerseys')).toBe(false)
    expect(flow.activeStep.value).toBe('squad')
    expect(flow.onSquadNavigationIntent('skip')).toBe(true)
    expect(navigate).toHaveBeenCalledWith('match')
    expect(persist).not.toHaveBeenCalled()
  })

  it('continues a saved squad to jerseys without issuing another write for keep', () => {
    const navigate = vi.fn()
    const persist = vi.fn()
    const flow = usePreparationFlow({ hasSavedSquad: ref(true), matchSaving: ref(false), navigate })

    expect(flow.onSquadNavigationIntent('keep')).toBe(true)
    expect(flow.activeStep.value).toBe('jerseys')
    expect(flow.hasVisitedJerseys.value).toBe(true)
    expect(navigate).not.toHaveBeenCalled()
    expect(persist).not.toHaveBeenCalled()
  })

  it('advances after successful save events only and blocks movement while a write is pending', async () => {
    const navigate = vi.fn()
    const matchSaving = ref(false)
    const flow = usePreparationFlow({ hasSavedSquad: ref(true), matchSaving, navigate })
    const save = vi.fn()
      .mockRejectedValueOnce(new Error('temporary match write failure'))
      .mockResolvedValueOnce(undefined)

    matchSaving.value = true
    expect(flow.onSquadNavigationIntent('keep')).toBe(false)
    expect(flow.activeStep.value).toBe('squad')
    matchSaving.value = false

    await expect(save()).rejects.toThrow('temporary match write failure')
    expect(flow.activeStep.value).toBe('squad')
    await save()
    expect(flow.onSquadSaved()).toBe(true)
    expect(flow.activeStep.value).toBe('jerseys')

    matchSaving.value = true
    expect(flow.onJerseySaved()).toBe(false)
    expect(navigate).not.toHaveBeenCalled()
    matchSaving.value = false
    expect(flow.onJerseySaved()).toBe(true)
    expect(navigate).toHaveBeenCalledWith('match')
  })

  it('returns from jerseys to squad while retaining the visited step', () => {
    const flow = usePreparationFlow({ hasSavedSquad: ref(true), matchSaving: ref(false), navigate: vi.fn() })
    flow.enterStep('jerseys')

    expect(flow.backToSquad()).toBe(true)
    expect(flow.activeStep.value).toBe('squad')
    expect(flow.hasVisitedJerseys.value).toBe(true)
  })
})
