import { LEARN_MODULES, learnProjectName, moduleLabel, moduleProjectFiles, parseManifest, LEARN_MANIFEST, type LearnModule, type LearnStatus, type LearnStorage } from '@klonk/learn'
import { CloudProject, openCloudProject, type CloudProjectMeta } from '~/utils/cloud-project'
import { createFolderProject, ensurePermission, listBrowserProjects, loadHandle, openBrowserProject, Project, storeHandle, supportsBrowserProjects, supportsFolders } from '~/utils/project-fs'

/** Lokal gespeichertes Modulprojekt (Browser bzw. Ordner) – der Server kennt es nicht, der Lernstand steht hier */
type LocalModule = { storage: 'browser' | 'folder', name: string, solved: string[], updatedAt: string }

/**
 * Lernmodule: jedes gestartete Modul ist ein eigenes Projekt (Programme je Aufgabe, Lernstand in `klonk.json`) – in der
 * Klonk Cloud (Lernstand für die Gruppenleitung), im Browser oder in einem Ordner auf dem Rechner. Welche Orte erlaubt sind,
 * legen Organisation und Gruppenleitung fest. Startbare Module und den Cloud-Lernstand liefert `/api/learn`; Lernende einer
 * Organisation sehen nur, was in einer ihrer Gruppen freigegeben ist.
 */
export function useLearn() {
  const { data: status, refresh, status: fetchState } = useFetch<LearnStatus | null>('/api/learn', {
    key: 'learn-status',
    server: false,
    headers: clientHostHeaders(),
    default: () => null,
  })
  const loading = computed(() => fetchState.value === 'pending' || fetchState.value === 'idle')
  const { user } = useAuth()

  // Lokale Modulprojekte je Konto (im Browser gemerkt, Ordner-Handles in IndexedDB)
  const localKey = computed(() => `klonk:learn-local:${user.value?.id ?? 'anonymous'}`)
  const locals = useState<Record<string, LocalModule>>('learn-local', () => ({}))
  watch(localKey, (key) => {
    try {
      locals.value = JSON.parse(localStorage.getItem(key) ?? '{}')
    }
    catch {
      locals.value = {}
    }
  }, { immediate: import.meta.client })
  function saveLocals() {
    try {
      localStorage.setItem(localKey.value, JSON.stringify(locals.value))
    }
    catch {
      // privater Modus
    }
  }
  const handleKey = (moduleId: string) => `learn:${user.value?.id ?? 'anonymous'}:${moduleId}`

  /** Module, die das Konto starten darf (in Kursreihenfolge) */
  const modules = computed(() => LEARN_MODULES.filter(m => status.value?.modules.includes(m.id)))

  /** Erlaubte Speicherorte beim Start; `supported` = dieser Browser kann es */
  function storages(moduleId: string): { value: LearnStorage, supported: boolean }[] {
    return (status.value?.storage[moduleId] ?? []).map(value => ({
      value,
      supported: value === 'cloud' || (value === 'browser' ? supportsBrowserProjects() : supportsFolders()),
    }))
  }
  const storageOf = (moduleId: string): LearnStorage | null => (status.value?.projects[moduleId] ? 'cloud' : locals.value[moduleId]?.storage ?? null)
  const canStart = (moduleId: string) => !!status.value?.modules.includes(moduleId)
    && (!!storageOf(moduleId) || storages(moduleId).some(s => s.supported))

  /** Lernstand: Cloud vom Server, lokal aus dem Browser (gelöste Aufgaben) */
  function progress(moduleId: string) {
    const cloud = status.value?.projects[moduleId]
    if (cloud) return cloud
    const local = locals.value[moduleId]
    return local ? { projectId: '', updatedAt: local.updatedAt, solved: local.solved, started: [] as string[] } : null
  }
  const isSolved = (moduleId: string, taskId: string) => !!progress(moduleId)?.solved.includes(taskId)
  const solvedCount = (module: LearnModule) => module.tasks.filter(t => isSolved(module.id, t.id)).length

  /** Gelöst merken (lokal dauerhaft, Cloud bis die Übersicht neu geladen ist) */
  function markSolved(moduleId: string, taskId: string) {
    const entry = status.value?.projects[moduleId]
    if (entry && !entry.solved.includes(taskId)) entry.solved.push(taskId)
    const local = locals.value[moduleId]
    if (local && !local.solved.includes(taskId)) {
      local.solved.push(taskId)
      local.updatedAt = new Date().toISOString()
      saveLocals()
    }
  }

  /** Erste ungelöste Aufgabe des Moduls (sonst die erste) */
  function nextTaskId(module: LearnModule) {
    return (module.tasks.find(t => !isSolved(module.id, t.id)) ?? module.tasks[0]!).id
  }

  /** Aufgabe nach dieser – auch ins nächste startbare Modul */
  function following(moduleId: string, taskId: string): { module: string, task: string } | null {
    const module = findModuleById(moduleId)
    if (!module) return null
    const t = module.tasks.findIndex(x => x.id === taskId)
    if (module.tasks[t + 1]) return { module: moduleId, task: module.tasks[t + 1]!.id }
    const list = modules.value
    const next = list[list.findIndex(m => m.id === moduleId) + 1]
    return next ? { module: next.id, task: next.tasks[0]!.id } : null
  }

  /**
   * Projekt öffnen – ist es in der IDE schon offen, dieselbe Instanz nutzen (bei der Cloud würden sich zwei Instanzen auf
   * derselben lokalen Kopie die Upload-Warteschlange überschreiben). `shared` ⇒ beim Verlassen nicht schließen.
   */
  const proj = useProject()
  async function open(meta: CloudProjectMeta) {
    const current = proj.project.value
    if (current instanceof CloudProject && current.meta.id === meta.id) return { project: current as Project, shared: true }
    return { project: await openCloudProject(meta) as Project, shared: false }
  }
  async function shareLocal(project: Project) {
    const current = proj.project.value
    const same = current && current.source === project.source && (current.source === 'browser'
      ? current.name === project.name
      : await current.handle.isSameEntry(project.handle))
    return same ? { project: current, shared: true } : { project, shared: false }
  }

  /** Lokales Modulprojekt öffnen (`null` = nicht mehr vorhanden); Ordner brauchen ggf. erneut die Freigabe */
  async function openLocal(moduleId: string, entry: LocalModule): Promise<Project | null> {
    if (entry.storage === 'browser') return openBrowserProject(entry.name).catch(() => null)
    const handle = await loadHandle(handleKey(moduleId))
    if (!handle) return null
    if (!(await ensurePermission(handle))) throw new Error('learn_permission')
    return new Project(handle, 'folder')
  }

  /**
   * Modul beginnen: Projekt am gewählten Ort mit Aufgabenordnern anlegen. Für `folder` muss das aus einer Nutzeraktion
   * kommen (Ordnerauswahl) – daher dort vor jedem anderen `await`.
   */
  async function start(moduleId: string, lang: 'de' | 'en', storage: LearnStorage) {
    const module = LEARN_MODULES.find(m => m.id === moduleId)
    if (!module) throw new Error('learn_not_found')
    if (storage === 'cloud') {
      await $fetch(`/api/learn/modules/${moduleId}/start` as string, { method: 'POST', headers: clientHostHeaders(), body: { lang } })
      await refresh()
      return
    }
    const base = learnProjectName(module, moduleLabel(module), lang)
    let project: Project | null
    if (storage === 'folder') {
      project = await createFolderProject(base)
      if (!project) throw new Error('cancelled')
      await storeHandle(handleKey(moduleId), project.handle)
    }
    else {
      // Gleichnamiges Browser-Projekt dieses Moduls (z. B. nach gelöschten Browserdaten) weiterverwenden
      const names = await listBrowserProjects()
      let name = base
      for (let i = 2; names.includes(name); i++) {
        const existing = await openBrowserProject(name)
        if (parseManifest(await existing.read(LEARN_MANIFEST).catch(() => null), moduleId).tasks[module.tasks[0]!.id]) break
        name = `${base} ${i}`
      }
      project = await openBrowserProject(name, true)
    }
    const language = status.value?.languages[moduleId]?.[0] ?? 'blocks'
    const { folders, files } = moduleProjectFiles(module, lang, language)
    if (!(await project.exists(LEARN_MANIFEST))) {
      for (const folder of folders) await project.createFolder(folder).catch(() => {})
      for (const file of files) await project.write(file.path, file.content)
    }
    const manifest = parseManifest(await project.read(LEARN_MANIFEST), moduleId)
    locals.value = {
      ...locals.value,
      [moduleId]: { storage, name: project.name, solved: Object.keys(manifest.solved), updatedAt: new Date().toISOString() },
    }
    saveLocals()
  }

  /** Lokal gemerktes Modul vergessen (Projekt gelöscht) */
  function forgetLocal(moduleId: string) {
    const { [moduleId]: _gone, ...rest } = locals.value
    locals.value = rest
    saveLocals()
  }

  /**
   * Eigenes Modulprojekt öffnen. Noch nicht begonnen ⇒ am ersten erlaubten Ort anlegen (Cloud vor Browser); ist nur ein
   * Ordner erlaubt, muss die Modulseite ihn wählen lassen (`learn_choose_storage`).
   */
  async function openOwn(moduleId: string, lang: 'de' | 'en'): Promise<{ project: Project, shared: boolean }> {
    // Direkt aufgerufene Aufgabe: Status (erlaubte Orte, Cloud-Projekte) ist evtl. noch nicht geladen
    if (!status.value) await refresh()
    const local = locals.value[moduleId]
    if (local) {
      const project = await openLocal(moduleId, local)
      if (project) return shareLocal(project)
      forgetLocal(moduleId)
    }
    if (!status.value?.projects[moduleId]) {
      const storage = storages(moduleId).find(s => s.supported && s.value !== 'folder')?.value
      if (!storage) throw new Error(storages(moduleId).some(s => s.supported) ? 'learn_choose_storage' : 'learn_no_storage')
      await start(moduleId, lang, storage)
      if (storage !== 'cloud') return openOwn(moduleId, lang)
    }
    const entry = status.value?.projects[moduleId]
    if (!entry) throw new Error('learn_not_found')
    return open({ id: entry.projectId, name: moduleId, kind: 'personal', writable: true })
  }

  /** Modulprojekt einer anderen Person (Gruppenleitung, nur lesen) öffnen */
  function openForeign(projectId: string, name: string) {
    return open({ id: projectId, name, kind: 'personal', writable: false })
  }

  return { status, refresh, loading, modules, storages, storageOf, canStart, progress, isSolved, solvedCount, markSolved, nextTaskId, following, start, openOwn, openForeign }
}

const findModuleById = (id: string) => LEARN_MODULES.find(m => m.id === id)
