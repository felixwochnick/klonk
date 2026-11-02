const CACHE_KEY = 'klonk:license'

/** Wirksame Lizenz des angemeldeten Kontos (Funktionen, Grenzen) */
export function useLicense() {
  const { data, refresh, error } = useFetch<LicenseInfo>('/api/license', {
    key: 'license',
    headers: clientHostHeaders(),
    // Offline (PWA) gilt die zuletzt geladene Lizenz weiter – die Server-APIs prüfen ohnehin selbst
    default: () => cachedLicense() ?? FREE_LICENSE,
  })

  if (import.meta.client) {
    // Lokaler Testmodus braucht den Hostnamen des Browsers – beim Server-Rendering fehlt der ⇒ im Browser neu laden
    if (/(^localhost$|\.localhost$|^127\.0\.0\.1$)/.test(location.hostname) && data.value?.plan !== 'local') onMounted(() => void refresh())
    watch(data, (value) => {
      if (value && !error.value) storage(() => localStorage.setItem(CACHE_KEY, JSON.stringify(value)))
    })
  }

  const can = (feature: LicenseFeature) => hasFeature(data.value, feature)
  const maxCharacters = computed(() => (can('characters') ? Infinity : FREE_MAX_CHARACTERS))

  /** Lokaler Testmodus (localhost/*.localhost): alles frei */
  const isLocal = computed(() => data.value?.plan === 'local')

  return { license: data, refresh, can, maxCharacters, isLocal }
}

function cachedLicense(): LicenseInfo | undefined {
  if (!import.meta.client) return undefined
  const raw = storage(() => localStorage.getItem(CACHE_KEY))
  return raw ? JSON.parse(raw) as LicenseInfo : undefined
}

function storage<T>(fn: () => T): T | undefined {
  try {
    return fn()
  }
  catch {
    return undefined
  }
}
