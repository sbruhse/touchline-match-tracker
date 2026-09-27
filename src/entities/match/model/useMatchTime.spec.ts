import { mount } from '@vue/test-utils'
import { defineComponent, h } from 'vue'
import { describe, expect, it, vi } from 'vitest'
import { useMatchTime } from './useMatchTime'

describe('useMatchTime', () => {
  it('updates reactively and clears its interval when its owner unmounts', async () => {
    vi.useFakeTimers()
    const clearInterval = vi.spyOn(window, 'clearInterval')
    const TimeDisplay = defineComponent({
      setup() {
        const { now } = useMatchTime()
        return () => h('span', now.value)
      },
    })

    try {
      const wrapper = mount(TimeDisplay)
      const initialTime = wrapper.text()
      await vi.advanceTimersByTimeAsync(1000)
      expect(wrapper.text()).not.toBe(initialTime)
      wrapper.unmount()
      expect(clearInterval).toHaveBeenCalledTimes(1)
    } finally {
      clearInterval.mockRestore()
      vi.useRealTimers()
    }
  })
})
