<script setup lang="ts">
import { onMounted } from 'vue'
import { useJerseySetStore } from '../../../entities/jersey-set'
import { usePlayerStore } from '../../../entities/player'
import { ManageJerseySets } from '../../../features/manage-jersey-sets'

const jerseySetStore = useJerseySetStore()
const playerStore = usePlayerStore()

onMounted(() => {
  if (!jerseySetStore.ready.value && !jerseySetStore.loading.value) {
    void jerseySetStore.load().catch(() => {
      // The inventory feature exposes a retryable load error.
    })
  }
  if (!playerStore.ready.value && !playerStore.loading.value) {
    void playerStore.load().catch(() => {
      // Inventory remains usable with unresolved owner references.
    })
  }
})
</script>

<template>
  <div class="jersey-sets-page">
    <ManageJerseySets />
  </div>
</template>

<style scoped>
.jersey-sets-page { min-height: 28rem; }
</style>
