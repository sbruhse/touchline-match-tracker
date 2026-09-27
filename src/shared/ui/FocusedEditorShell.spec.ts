import { mount } from '@vue/test-utils'
import { defineComponent, h, nextTick, ref } from 'vue'
import { describe, expect, it } from 'vitest'
import FocusedEditorShell from './FocusedEditorShell.vue'

describe('FocusedEditorShell', () => {
  it('opens as a modal dialog and focuses its first control', async () => {
    const open = ref(false)
    const Host = defineComponent({
      setup() {
        return () => h('div', [
          h('button', { id: 'launcher' }, 'Open'),
          h(FocusedEditorShell, { open: open.value, title: 'Edit event' }, {
            default: () => h('input', { 'aria-label': 'Event details' }),
            actions: () => h('button', 'Save'),
          }),
        ])
      },
    })
    const wrapper = mount(Host, { attachTo: document.body })
    try {
      open.value = true
      await nextTick()
      await nextTick()

      expect(document.querySelector('[role="dialog"]')?.getAttribute('aria-modal')).toBe('true')
      expect(document.activeElement).toBe(document.querySelector('.focused-editor__close'))
      document.querySelector<HTMLButtonElement>('.focused-editor__close')?.click()
      expect(wrapper.findComponent(FocusedEditorShell).emitted('close')).toHaveLength(1)
    } finally {
      wrapper.unmount()
    }
  })

  it('requests close with Escape, traps keyboard focus, and restores focus to a fallback if launcher disappears', async () => {
    const open = ref(false)
    const launcherExists = ref(true)
    const fallback = document.createElement('button')
    fallback.textContent = 'Match actions'
    document.body.append(fallback)

    const Host = defineComponent({
      setup() {
        return () => h('div', [
          launcherExists.value ? h('button', { id: 'launcher' }, 'Open') : null,
          h(FocusedEditorShell, {
            open: open.value,
            title: 'Edit event',
            fallbackFocus: () => fallback,
            onClose: () => {
              open.value = false
              launcherExists.value = false
            },
          }, {
            default: () => h('input', { 'aria-label': 'Event details' }),
            actions: () => h('button', { id: 'save' }, 'Save'),
          }),
        ])
      },
    })
    const wrapper = mount(Host, { attachTo: document.body })

    try {
      const launcher = wrapper.get('#launcher').element as HTMLElement
      launcher.focus()
      open.value = true
      await nextTick()
      await nextTick()
      expect(document.activeElement).toBe(document.querySelector('.focused-editor__close'))

      document.querySelector<HTMLButtonElement>('#save')?.focus()
      document.activeElement?.dispatchEvent(new KeyboardEvent('keydown', {
        key: 'Tab', bubbles: true, cancelable: true,
      }))
      await nextTick()
      expect(document.activeElement).toBe(document.querySelector('.focused-editor__close'))

      document.activeElement?.dispatchEvent(new KeyboardEvent('keydown', {
        key: 'Tab', shiftKey: true, bubbles: true, cancelable: true,
      }))
      await nextTick()
      expect(document.activeElement).toBe(document.querySelector('#save'))

      document.querySelector('#save')?.dispatchEvent(new KeyboardEvent('keydown', {
        key: 'Escape', bubbles: true, cancelable: true,
      }))
      await nextTick()
      await nextTick()
      await nextTick()
      expect(document.activeElement).toBe(fallback)
    } finally {
      wrapper.unmount()
      fallback.remove()
    }
  })

  it('restores focus to a meaningful fallback when an open editor is removed with its event', async () => {
    const open = ref(true)
    const fallback = document.createElement('button')
    fallback.textContent = 'Events panel'
    document.body.append(fallback)
    const Host = defineComponent({
      setup() {
        return () => h(FocusedEditorShell, {
          open: open.value,
          title: 'Correct substitution',
          fallbackFocus: () => fallback,
        }, {
          default: () => h('input', { 'aria-label': 'Elapsed time' }),
        })
      },
    })
    const wrapper = mount(Host, { attachTo: document.body })
    try {
      await nextTick()
      await nextTick()
      expect(document.activeElement).toBe(document.querySelector('.focused-editor__close'))
      wrapper.unmount()
      await nextTick()
      expect(document.activeElement).toBe(fallback)
    } finally {
      if (wrapper.exists()) wrapper.unmount()
      fallback.remove()
    }
  })
})
