<script setup lang="ts">
import { onMounted } from 'vue'
import { useJerseySetStore } from '../../../entities/jersey-set'
import { usePlayerStore } from '../../../entities/player'
import { ManagePlayers } from '../../../features/manage-players'

const store = usePlayerStore()
const jerseyStore = useJerseySetStore()
const emit = defineEmits<{ viewStatistics: [playerId: string] }>()

onMounted(() => {
  if (!store.ready.value && !store.loading.value) {
    void store.load().catch(() => {
      // The page renders the store's accessible retry state below.
    })
  }
  if (!jerseyStore.ready.value && !jerseyStore.loading.value) {
    void jerseyStore.load().catch(() => {
      // The preferred-number area renders an independent retry state.
    })
  }
})
</script>

<template>
  <div class="my-players-page">
    <ManagePlayers @view-statistics="emit('viewStatistics', $event)" />
  </div>
</template>

<style scoped>
.my-players-page { min-height: 28rem; }
</style>
