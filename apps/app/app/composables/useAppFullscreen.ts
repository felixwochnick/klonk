type FullscreenDocument = Document & {
  webkitFullscreenElement?: Element | null
  webkitFullscreenEnabled?: boolean
  webkitExitFullscreen?: () => void
}
type FullscreenElement = HTMLElement & { webkitRequestFullscreen?: () => void }

/**
 * Optionales Browser-Vollbild (ohne Adressleiste/Tabs, auch iPad); die Kopfzeile der App bleibt.
 * Ohne Fullscreen-API (z. B. iPhone) ist `supported` false und der Knopf wird nicht angeboten.
 */
export function useAppFullscreen() {
  const supported = ref(false)
  const active = ref(false)

  const doc = () => document as FullscreenDocument
  const update = () => {
    active.value = !!(doc().fullscreenElement ?? doc().webkitFullscreenElement)
  }

  onMounted(() => {
    supported.value = !!(doc().fullscreenEnabled ?? doc().webkitFullscreenEnabled)
    update()
    document.addEventListener('fullscreenchange', update)
    document.addEventListener('webkitfullscreenchange', update)
  })
  onBeforeUnmount(() => {
    document.removeEventListener('fullscreenchange', update)
    document.removeEventListener('webkitfullscreenchange', update)
  })

  async function toggle() {
    if (active.value) {
      if (doc().exitFullscreen) await doc().exitFullscreen().catch(() => {})
      else doc().webkitExitFullscreen?.()
      return
    }
    const root = document.documentElement as FullscreenElement
    if (root.requestFullscreen) await root.requestFullscreen({ navigationUI: 'hide' }).catch(() => {})
    else root.webkitRequestFullscreen?.()
  }

  return { supported, active, toggle }
}
