import { parseCustomModule, type CustomModuleData, type CustomModuleEntry } from '@klonk/learn'

/** Kennung der Exportdatei (`*.klonkmodule.json`) – so lassen sich Module zwischen Schulen weitergeben */
const EXPORT_FORMAT = 'klonk-learn-module'

/**
 * Eigene Lernmodule anlegen, laden, speichern, löschen, exportieren und importieren (Unterricht → Eigene Lernmodule).
 * Die Liste der Module der Organisation steht in `useLearn().custom`.
 */
export function useCustomModules() {
  const learn = useLearn()
  const headers = clientHostHeaders()

  async function load(id: string) {
    const entry = await $fetch<CustomModuleEntry>(`/api/learn/custom/${id}` as string, { headers })
    rememberCustomModule(id, entry)
    return entry
  }

  async function create(data: CustomModuleData) {
    const entry = await $fetch<CustomModuleEntry>('/api/learn/custom', { method: 'POST', headers, body: { data } })
    rememberCustomModule(entry.id, entry)
    await learn.refresh()
    return entry
  }

  /** Speichern; `base` = Stand beim Laden (sonst wird ein neuerer Stand überschrieben) */
  async function save(id: string, data: CustomModuleData, base?: string) {
    const entry = await $fetch<CustomModuleEntry>(`/api/learn/custom/${id}` as string, { method: 'PUT', headers, body: { data, base } })
    rememberCustomModule(id, entry)
    await learn.refresh()
    return entry
  }

  async function remove(id: string) {
    await $fetch(`/api/learn/custom/${id}` as string, { method: 'DELETE', headers })
    rememberCustomModule(id, null)
    await learn.refresh()
  }

  function download(data: CustomModuleData) {
    const blob = new Blob([`${JSON.stringify({ format: EXPORT_FORMAT, version: 1, module: data }, null, 2)}\n`], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `${data.title.replace(/[\\/:*?"<>|]/g, '').trim() || 'modul'}.klonkmodule.json`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  /** Exportiertes Modul als neues eigenes Modul anlegen (ungültige Datei ⇒ Fehler `custom_module_invalid`) */
  async function importFile(file: File) {
    let data: CustomModuleData | null
    try {
      const parsed = JSON.parse(await file.text()) as { format?: string, module?: unknown }
      data = parseCustomModule(parsed?.format === EXPORT_FORMAT ? parsed.module : parsed)
    }
    catch {
      data = null
    }
    if (!data) throw new Error('custom_module_invalid')
    return create(data)
  }

  return { load, create, save, remove, download, importFile }
}
