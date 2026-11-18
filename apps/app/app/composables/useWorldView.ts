/** Darstellung der Welt: 3D-Szene oder Draufsicht (2D, wie der Bauplan im Unterrichtsmaterial) */
export type WorldViewMode = '3d' | '2d'

const STORAGE_KEY = 'klonk:world-view'

/** Gewählte Weltansicht – gilt für alle Weltansichten der App und wird im Browser gemerkt */
export function useWorldView() {
  const preferred = useState<WorldViewMode>('klonk-world-view', () => '3d')
  /** Ohne WebGL (alte Rechner, abgeschaltete Grafikbeschleunigung) bleibt nur die Draufsicht */
  const webgl = useState('klonk-world-webgl', () => true)
  const loaded = useState('klonk-world-view-loaded', () => false)
  const mode = computed<WorldViewMode>(() => (webgl.value ? preferred.value : '2d'))

  /** Gemerkte Wahl lesen – erst nach dem Hydrieren (onMounted), sonst passt das Server-HTML nicht */
  function load() {
    if (loaded.value) return
    loaded.value = true
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (stored === '2d' || stored === '3d') preferred.value = stored
    }
    catch {
      // Speicher gesperrt (privates Fenster) ⇒ Standard
    }
  }

  function set(next: WorldViewMode) {
    preferred.value = next
    try {
      localStorage.setItem(STORAGE_KEY, next)
    }
    catch {
      // nur für diese Sitzung
    }
  }

  return { mode, preferred, webgl, load, set }
}
