<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, watch, type ComponentPublicInstance } from 'vue'

const props = defineProps<{
  open: boolean
  title: string
  fallbackFocus?: () => HTMLElement | null
}>()

const emit = defineEmits<{
  close: []
}>()

let dialogElement: HTMLElement | null = null
let previouslyFocused: HTMLElement | null = null
let mounted = false

function focusableElements(): HTMLElement[] {
  if (!dialogElement) return []
  return Array.from(dialogElement.querySelectorAll<HTMLElement>(
    'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
  )).filter((element) => !element.hasAttribute('hidden') && element.getAttribute('aria-hidden') !== 'true')
}

async function focusEditor() {
  await nextTick()
  if (!props.open || !dialogElement) return
  const target = focusableElements()[0] ?? dialogElement
  target.focus()
}

async function restoreFocus() {
  await nextTick()
  const target = previouslyFocused?.isConnected
    && previouslyFocused !== document.body
    && previouslyFocused !== document.documentElement
    ? previouslyFocused
    : props.fallbackFocus?.() ?? null
  if (target?.isConnected) {
    target.focus()
    return
  }

  document.body.setAttribute('tabindex', '-1')
  document.body.focus()
}

function onKeydown(event: KeyboardEvent) {
  if (!props.open || !dialogElement) return

  if (event.key === 'Escape') {
    event.preventDefault()
    emit('close')
    return
  }

  if (event.key !== 'Tab') return
  const focusable = focusableElements()
  if (focusable.length === 0) {
    event.preventDefault()
    dialogElement.focus()
    return
  }

  const first = focusable[0]
  const last = focusable[focusable.length - 1]
  if (event.shiftKey && (document.activeElement === first || !dialogElement.contains(document.activeElement))) {
    event.preventDefault()
    last.focus()
  } else if (!event.shiftKey && (document.activeElement === last || !dialogElement.contains(document.activeElement))) {
    event.preventDefault()
    first.focus()
  }
}

function bindDialog(element: Element | ComponentPublicInstance | null) {
  dialogElement = element instanceof HTMLElement ? element : null
}

watch(() => props.open, async (open, wasOpen) => {
  if (!mounted) return
  if (open) {
    previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null
    await focusEditor()
  } else if (wasOpen) {
    await restoreFocus()
  }
})

onMounted(() => {
  mounted = true
  document.addEventListener('keydown', onKeydown)
  if (props.open) {
    previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null
    void focusEditor()
  }
})

onBeforeUnmount(() => {
  document.removeEventListener('keydown', onKeydown)
  if (props.open && dialogElement?.contains(document.activeElement)) void restoreFocus()
})
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="focused-editor-backdrop">
      <section
        :ref="bindDialog"
        class="focused-editor"
        role="dialog"
        aria-modal="true"
        :aria-label="title"
        tabindex="-1"
      >
        <header class="focused-editor__header">
          <h2>{{ title }}</h2>
          <button class="focused-editor__close" type="button" aria-label="Close editor" @click="emit('close')">
            Close
          </button>
        </header>
        <div class="focused-editor__body">
          <slot />
        </div>
        <footer v-if="$slots.actions" class="focused-editor__actions">
          <slot name="actions" />
        </footer>
      </section>
    </div>
  </Teleport>
</template>

<style scoped>
.focused-editor-backdrop {
  position: fixed;
  z-index: 1000;
  inset: 0;
  display: grid;
  place-items: center;
  padding: 24px;
  background: rgb(16 27 20 / 58%);
}

.focused-editor {
  display: flex;
  flex-direction: column;
  width: min(100%, 560px);
  max-height: min(88dvh, 760px);
  min-height: 0;
  overflow: hidden;
  color: #17251d;
  background: #fff;
  border-radius: 20px;
  box-shadow: 0 24px 80px rgb(0 0 0 / 25%);
}

.focused-editor__header,
.focused-editor__actions {
  flex: none;
  padding: 16px 20px;
  background: #fff;
}

.focused-editor__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  border-bottom: 1px solid #e4e8e0;
}

.focused-editor__header h2 {
  min-width: 0;
  margin: 0;
  font-size: 1.125rem;
}

.focused-editor__close {
  min-height: 48px;
  padding: 0 14px;
  color: #204d38;
  background: transparent;
  border: 1px solid #cbd5cb;
  border-radius: 10px;
  font-weight: 700;
}

.focused-editor__body {
  min-height: 0;
  padding: 20px;
  overflow: auto;
  overscroll-behavior: contain;
  -webkit-overflow-scrolling: touch;
}

.focused-editor__actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 10px;
  padding-bottom: calc(16px + env(safe-area-inset-bottom));
  border-top: 1px solid #e4e8e0;
}

@media (max-width: 600px) {
  .focused-editor-backdrop {
    display: block;
    padding: 0;
    padding-top: env(safe-area-inset-top);
    background: #fff;
  }

  .focused-editor {
    width: 100%;
    height: 100%;
    max-height: none;
    border-radius: 0;
    box-shadow: none;
  }

  .focused-editor__header {
    padding-top: 12px;
  }

  .focused-editor__body {
    padding: 16px;
  }
}
</style>
