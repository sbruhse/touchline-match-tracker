import { onMounted, onUnmounted, readonly, ref } from 'vue'

export function useMatchTime() {
  const now = ref(Date.now())
  let timer: number | undefined

  function refresh(): number {
    now.value = Date.now()
    return now.value
  }

  onMounted(() => {
    timer = window.setInterval(refresh, 1000)
  })

  onUnmounted(() => {
    if (timer !== undefined) window.clearInterval(timer)
  })

  return { now: readonly(now), refresh }
}
