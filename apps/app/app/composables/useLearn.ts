import { LEARN_MODULES, type LearnModule, type LearnStatus } from '@klonk/learn'
import { CloudProject, openCloudProject, type CloudProjectMeta } from '~/utils/cloud-project'

/**
 * Lernmodule: jedes gestartete Modul ist ein Cloud-Projekt des Kontos (Programme je Aufgabe, Lernstand in `klonk.json`).
 * Welche Module startbar sind und den Lernstand liefert `/api/learn`; Lernende einer Organisation sehen nur, was in einer
 * ihrer Gruppen freigegeben ist.
 */
export function useLearn() {
  const { data: status, refresh, status: fetchState } = useFetch<LearnStatus | null>('/api/learn', {
    key: 'learn-status',
    server: false,
    headers: clientHostHeaders(),
    default: () => null,
  })
  const loading = computed(() => fetchState.value === 'pending' || fetchState.value === 'idle')

  /** Module, die das Konto starten darf (in Kursreihenfolge) */
  const modules = computed(() => LEARN_MODULES.filter(m => status.value?.modules.includes(m.id)))
  const canStart = (moduleId: string) => !!status.value?.cloud && !!status.value.modules.includes(moduleId)

  const progress = (moduleId: string) => status.value?.projects[moduleId] ?? null
  const isSolved = (moduleId: string, taskId: string) => !!progress(moduleId)?.solved.includes(taskId)
  const solvedCount = (module: LearnModule) => module.tasks.filter(t => isSolved(module.id, t.id)).length

  /** Gelöst merken, bis die Übersicht neu geladen ist */
  function markSolved(moduleId: string, taskId: string) {
    const entry = status.value?.projects[moduleId]
    if (entry && !entry.solved.includes(taskId)) entry.solved.push(taskId)
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
   * Cloud-Projekt öffnen – ist es in der IDE schon offen, dieselbe Instanz nutzen (zwei Instanzen auf derselben lokalen
   * Kopie würden sich die Upload-Warteschlange überschreiben). `shared` ⇒ beim Verlassen nicht schließen.
   */
  const proj = useProject()
  async function open(meta: CloudProjectMeta) {
    const current = proj.project.value
    if (current instanceof CloudProject && current.meta.id === meta.id) return { project: current, shared: true }
    return { project: await openCloudProject(meta), shared: false }
  }

  /** Eigenes Modulprojekt (beim ersten Mal anlegen) öffnen */
  async function openOwn(moduleId: string, lang: 'de' | 'en') {
    let entry = progress(moduleId)
    if (!entry) {
      await $fetch(`/api/learn/modules/${moduleId}/start` as string, { method: 'POST', headers: clientHostHeaders(), body: { lang } })
      await refresh()
      entry = progress(moduleId)
      if (!entry) throw new Error('learn_not_found')
    }
    return open({ id: entry.projectId, name: moduleId, kind: 'personal', writable: true })
  }

  /** Modulprojekt einer anderen Person (Gruppenleitung, nur lesen) öffnen */
  function openForeign(projectId: string, name: string) {
    return open({ id: projectId, name, kind: 'personal', writable: false })
  }

  return { status, refresh, loading, modules, canStart, progress, isSolved, solvedCount, markSolved, nextTaskId, following, openOwn, openForeign }
}

const findModuleById = (id: string) => LEARN_MODULES.find(m => m.id === id)
