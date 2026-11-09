type FullscreenDocument = Document & {
  webkitFullscreenElement?: Element | null
  webkitFullscreenEnabled?: boolean
  webkitExitFullscreen?: () => void
}
type FullscreenElement = HTMLElement & { webkitRequestFullscreen?: () => void }

/**
 * Optionales Browser-Vollbild (ohne Adressleiste/Tabs, auch iPad); die Kopfzeile der App bleibt.
 * Manche Browser können es nicht oder ignorieren den Wunsch (z. B. Firefox auf dem iPad) ⇒ Hinweis auf den Home-Bildschirm.
 * Als installierte App (`standalone`) gibt es keine Browserleisten ⇒ `available` ist false, kein Knopf.
 */
export function useAppFullscreen() {
  const { t } = useI18n()
  const toast = useToast()
  const available = ref(false)
  const active = ref(false)

  const doc = () => document as FullscreenDocument
  const update = () => {
    active.value = !!(doc().fullscreenElement ?? doc().webkitFullscreenElement)
  }

  onMounted(() => {
    const standalone = window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true
    available.value = !standalone
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
    if (root.requestFullscreen) void root.requestFullscreen({ navigationUI: 'hide' }).catch(() => {})
    else root.webkitRequestFullscreen?.()
    // Nicht auf die Anfrage warten: Die WebKit-Variante meldet nichts, manche Browser antworten nie ⇒ kurz warten und nachsehen
    await new Promise(resolve => setTimeout(resolve, 1000))
    update()
    if (!active.value) toast.add({ title: t('fullscreen.unavailable'), description: t('fullscreen.unavailableHint'), icon: 'i-lucide-smartphone', color: 'warning' })
  }

  return { available, active, toggle }
}
