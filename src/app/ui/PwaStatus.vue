<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, shallowRef, watch } from 'vue'
import type { PwaLifecycleState } from '../model/usePwa'

interface Props {
  phase: PwaLifecycleState['phase']
  ready: boolean
  updateAvailable: boolean
  reloadAvailable: boolean
  applyingUpdate: boolean
  recoveryAvailable: boolean
  canReload: boolean
  error: string | null
}

interface Emits {
  update: []
  defer: []
  recover: []
  retry: []
}

const props = defineProps<Props>()
const emit = defineEmits<Emits>()

const isOnline = shallowRef(typeof navigator !== 'undefined' && navigator.onLine)
const updateDeferred = shallowRef(false)
const canRecover = computed(() => props.canReload && isOnline.value)
const hasUpdate = computed(() => props.updateAvailable || props.reloadAvailable || props.applyingUpdate)
const isVisible = computed(() => props.phase !== 'idle')

const statusMessage = computed(() => {
  if (props.recoveryAvailable) {
    if (props.phase === 'recovering') return 'Recovering offline access…'
    if (props.error) return `Offline access could not be recovered. ${props.error}`
    if (!isOnline.value) return 'Offline app files need repair. Connect to the internet to recover them.'
    if (!props.canReload) return 'Finish or clear the match form and wait for local saves before recovery.'
    return 'Offline app files need repair. Recover them online; saved match data stays separate.'
  }

  if (props.applyingUpdate) return 'Preparing the app update. This tab will reload only if the archive remains safe.'
  if (hasUpdate.value) {
    if (updateDeferred.value) return 'Update left for later. It will stay available from the match archive.'
    if (props.reloadAvailable && !props.updateAvailable) return 'A newer app release is active. Reload from the archive when you are ready.'
    if (props.error) return `Could not start the app update. ${props.error}`
    if (!props.canReload) return 'Finish or clear the match form and wait for local saves before updating.'
    return 'An app update is ready to apply from the match archive.'
  }

  if (props.ready && props.error) return `App update failed. ${props.error}`

  if (props.phase === 'unsupported') return 'Offline launch is not supported here. Touchline remains available in this browser.'
  if (props.phase === 'error') return `Offline access could not be prepared. ${props.error ?? 'Try again when you are online.'}`
  if (props.ready) return 'Ready to open offline in this browser.'
  if (props.phase === 'registering' || props.phase === 'preparing') return 'Preparing offline access…'
  return 'Offline access is not ready yet.'
})

const isBusy = computed(() => props.phase === 'registering' || props.phase === 'preparing'
  || props.phase === 'recovering' || props.applyingUpdate)

function handleOnlineChange(): void {
  isOnline.value = navigator.onLine
}

function deferUpdate(): void {
  updateDeferred.value = true
  emit('defer')
}

function reviewUpdate(): void {
  updateDeferred.value = false
}

watch(hasUpdate, (available) => {
  if (!available) updateDeferred.value = false
})

onMounted(() => {
  window.addEventListener('online', handleOnlineChange)
  window.addEventListener('offline', handleOnlineChange)
})

onBeforeUnmount(() => {
  window.removeEventListener('online', handleOnlineChange)
  window.removeEventListener('offline', handleOnlineChange)
})
</script>

<template>
  <section
    v-if="isVisible"
    class="pwa-status"
    role="status"
    aria-live="polite"
    aria-atomic="true"
    :aria-busy="isBusy ? 'true' : undefined"
  >
    <div class="pwa-status-copy">
      <h2 class="pwa-status-title">Offline access</h2>
      <p class="pwa-status-message">{{ statusMessage }}</p>
    </div>

    <div v-if="recoveryAvailable" class="pwa-status-actions">
      <button class="pwa-status-primary" type="button" :disabled="!canRecover" @click="emit('recover')">
        Recover offline access
      </button>
    </div>
    <div v-else-if="hasUpdate" class="pwa-status-actions">
      <button v-if="!updateDeferred && !applyingUpdate" class="pwa-status-primary" type="button" :disabled="!canReload" @click="emit('update')">
        {{ reloadAvailable && !updateAvailable ? 'Reload app' : 'Update app' }}
      </button>
      <button
        class="pwa-status-secondary"
        type="button"
        @click="updateDeferred ? reviewUpdate() : deferUpdate()"
      >{{ updateDeferred ? 'Review update' : 'Later' }}</button>
    </div>
    <div v-else-if="phase === 'error'" class="pwa-status-actions">
      <button class="pwa-status-primary" type="button" @click="emit('retry')">Try again</button>
    </div>
  </section>
</template>

<style scoped>
.pwa-status {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  margin: 1rem auto 1.4rem;
  padding: 0.85rem 1rem;
  border: 1px solid var(--line);
  border-left: 3px solid var(--green);
  border-radius: 0.45rem;
  background: var(--paper);
}

.pwa-status-copy { min-width: 0; }
.pwa-status-title { margin: 0 0 0.2rem; color: var(--green); font-family: 'Space Grotesk', sans-serif; font-size: 0.95rem; font-weight: 700; }
.pwa-status-message { margin: 0; color: var(--ink); font-size: 0.85rem; line-height: 1.45; overflow-wrap: anywhere; }
.pwa-status-actions { display: flex; flex: 0 0 auto; flex-wrap: wrap; gap: 0.5rem; }
.pwa-status-actions button { min-height: 48px; padding: 0.45rem 0.85rem; border: 1px solid var(--green); border-radius: 0.35rem; font: inherit; font-size: 0.85rem; font-weight: 700; }
.pwa-status-actions button:focus-visible { outline: 3px solid #91b83c; outline-offset: 3px; }
.pwa-status-primary { background: var(--green); color: #fff; }
.pwa-status-secondary { background: var(--paper); color: var(--green); }
.pwa-status-actions button:disabled { cursor: not-allowed; opacity: 0.55; }

@media (max-width: 520px) {
  .pwa-status { align-items: stretch; flex-direction: column; gap: 0.75rem; padding: 0.8rem; }
  .pwa-status-actions { display: grid; grid-template-columns: repeat(auto-fit, minmax(7rem, 1fr)); }
  .pwa-status-actions button { min-width: 0; padding-inline: 0.5rem; overflow-wrap: anywhere; }
}
</style>
