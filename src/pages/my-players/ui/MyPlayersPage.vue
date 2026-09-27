<script setup lang="ts">
import { onMounted } from 'vue'
import { usePlayerStore } from '../../../entities/player'
import { ManagePlayers } from '../../../features/manage-players'

const store = usePlayerStore()
const emit = defineEmits<{ viewStatistics: [playerId: string] }>()

onMounted(() => {
  if (store.ready.value || store.loading.value) return
  void store.load().catch(() => {
    // The page renders the store's accessible retry state below.
  })
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
