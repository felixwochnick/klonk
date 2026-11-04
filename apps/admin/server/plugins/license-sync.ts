// Lizenzen regelmäßig mit klonk.* abgleichen (nur in der Verwaltung, damit es pro Installation einmal läuft)
const INTERVAL_MS = 6 * 60 * 60 * 1000
const FIRST_RUN_MS = 60 * 1000

export default defineNitroPlugin((nitro) => {
  if (import.meta.prerender) return
  const config = useRuntimeConfig()
  const serverUrl = config.licenseServerUrl || (config.public.shopUrl ? new URL(config.public.shopUrl).origin : '')
  if (!serverUrl) return

  async function run() {
    const deps = { db: useSystemDb(), serverUrl, verify: verifyForInstance }
    try {
      if (config.licenseAutoRefresh && await refreshInstanceLicense(deps, await getInstanceLicenseToken())) {
        clearLicenseCache()
        console.info('[klonk] Lizenz-Token automatisch verlängert')
      }
      // Gehostete Plattform: Instanz-Lizenz selbst vom Shop beziehen (ohne fest eingetragenes Token)
      if (config.licenseServerApiKey && !config.licenseToken && await syncPlatformInstanceLicense({ ...deps, apiKey: config.licenseServerApiKey })) {
        clearLicenseCache()
        console.info('[klonk] Instanz-Lizenz vom Shop übernommen')
      }
      if (config.licenseServerApiKey && hasFeature(await getInstanceLicense(), 'hosted')) {
        const changed = await syncHostedLicenses({ ...deps, apiKey: config.licenseServerApiKey })
        if (changed) console.info(`[klonk] ${changed} Lizenz(en) vom Shop übernommen`)
        // Klonk-KI: Modelle/Preise und nachgekaufte Credits holen, Verbrauch melden
        await syncPlatformAi({ db: deps.db, serverUrl, apiKey: config.licenseServerApiKey })
          .catch(error => console.warn('[klonk] Abgleich der Klonk-KI fehlgeschlagen', error))
      }
    }
    catch (error) {
      console.warn('[klonk] Lizenzabgleich fehlgeschlagen', error)
    }
  }

  const first = setTimeout(run, FIRST_RUN_MS)
  const timer = setInterval(run, INTERVAL_MS)
  nitro.hooks.hook('close', () => {
    clearTimeout(first)
    clearInterval(timer)
  })
})
