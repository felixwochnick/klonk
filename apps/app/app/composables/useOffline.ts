/** Ist der Browser offline? (für Hinweise in der UI) */
export function useOffline() {
  const offline = useState('klonk-offline', () => false)
  if (import.meta.client) {
    onMounted(() => {
      const update = () => (offline.value = !navigator.onLine)
      update()
      window.addEventListener('online', update)
      window.addEventListener('offline', update)
      onBeforeUnmount(() => {
        window.removeEventListener('online', update)
        window.removeEventListener('offline', update)
      })
    })
  }
  return offline
}
