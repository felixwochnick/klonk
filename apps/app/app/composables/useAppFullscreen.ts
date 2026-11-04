type FullscreenDocument = Document & { webkitFullscreenElement?: Element | null, webkitExitFullscreen?: () => void }
type FullscreenElement = HTMLElement & { webkitRequestFullscreen?: () => void }

/**
 * Vollbildmodus (optional): blendet die Kopfzeile aus und schaltet – wo der Browser es kann (auch iPad) –
 * echtes Vollbild ein. Ohne Fullscreen-API (z. B. iPhone) bleibt es beim Ausblenden der Kopfzeile.
 */
export function useAppFullscreen() {
  const active = useState('app-fullscreen', () => false)
  /** Browser-Vollbild ist an ⇒ Verlassen per Esc/Wischgeste beendet auch den Modus */
  const native = useState('app-fullscreen-native', () => false)

  const fullscreenElement = () => {
    const doc = document as FullscreenDocument
    return doc.fullscreenElement ?? doc.webkitFullscreenElement ?? null
  }

  async function enter() {
    active.value = true
    const root = document.documentElement as FullscreenElement
    try {
      if (root.requestFullscreen) await root.requestFullscreen({ navigationUI: 'hide' })
      else root.webkitRequestFullscreen?.()
    }
    catch {
      // nicht erlaubt ⇒ nur Kopfzeile ausblenden
    }
    native.value = !!fullscreenElement()
  }

  async function exit() {
    active.value = false
    native.value = false
    if (!fullscreenElement()) return
    const doc = document as FullscreenDocument
    if (doc.exitFullscreen) await doc.exitFullscreen().catch(() => {})
    else doc.webkitExitFullscreen?.()
  }

  const toggle = () => (active.value ? exit() : enter())

  /** Einmal im Layout: Browser-Vollbild von außen beendet ⇒ Kopfzeile wieder zeigen */
  function listen() {
    const onChange = () => {
      if (fullscreenElement()) native.value = true
      else if (native.value) {
        native.value = false
        active.value = false
      }
    }
    onMounted(() => {
      document.addEventListener('fullscreenchange', onChange)
      document.addEventListener('webkitfullscreenchange', onChange)
    })
    onBeforeUnmount(() => {
      document.removeEventListener('fullscreenchange', onChange)
      document.removeEventListener('webkitfullscreenchange', onChange)
    })
  }

  return { active, enter, exit, toggle, listen }
}
