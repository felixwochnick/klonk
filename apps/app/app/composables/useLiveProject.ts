import { CloudProject } from '~/utils/cloud-project'
import { LiveProjectSession, type LivePeer } from '~/utils/live/project-session'
import type { LiveStatus } from '~/utils/live/socket'

// Zustand außerhalb von Komponenten: eine Sitzung je geöffnetem gemeinsamen Projekt
const session = shallowRef<LiveProjectSession | null>(null)
const peers = shallowRef<LivePeer[]>([])
const status = ref<LiveStatus | null>(null)
let scope: ReturnType<typeof effectScope> | undefined

/**
 * Gemeinsames Projekt (gemeinsamer Ordner einer Gruppe, v. a. Untergruppen im Modus `project`): Ist es in der IDE
 * geöffnet, bearbeiten alle Anwesenden die Dateien live zusammen (Yjs), sehen die Cursor der anderen und bekommen
 * gespeicherte Stände sofort. Offline oder ohne Verbindung arbeitet die IDE wie gewohnt mit dem eigenen Stand.
 */
export function useLiveProject() {
  const proj = useProject()
  if (import.meta.client && !scope) {
    scope = effectScope(true)
    scope.run(() => {
      watch(proj.project, (project) => {
        const id = project instanceof CloudProject && project.meta.kind === 'group' ? project.meta.id : null
        if (session.value?.projectId === id) return
        session.value?.close()
        session.value = null
        peers.value = []
        status.value = null
        if (!id) return
        const live = new LiveProjectSession(id)
        live.onChange = () => {
          peers.value = live.peers()
          status.value = live.status
        }
        // Gespeichert bzw. Dateien geändert ⇒ Cloud sofort abgleichen (statt alle 15 s)
        live.onRemoteSave = () => void (project as CloudProject).sync()
        live.onRemoteFiles = () => void (project as CloudProject).sync()
        live.setPresence(proj.currentPath.value)
        session.value = live
      }, { immediate: true })

      watch(proj.currentPath, path => session.value?.setPresence(path))

      onProjectSaved(async (path) => {
        const project = proj.project.value
        const live = session.value
        if (!(project instanceof CloudProject) || !live) return
        // Erst hochladen, dann Bescheid geben – die anderen holen den Stand dann gleich ab
        await project.sync()
        live.saved(path)
      })
      onProjectFilesChanged(async (removed) => {
        const project = proj.project.value
        const live = session.value
        if (!(project instanceof CloudProject) || !live) return
        await project.sync()
        live.filesChanged(removed)
      })
    })
  }

  /** Wer gerade in welcher Datei ist (Farbpunkte an den Tabs) */
  const presence = computed(() => {
    const result: Record<string, LivePeer[]> = {}
    for (const peer of peers.value) if (peer.path) (result[peer.path] ??= []).push(peer)
    return result
  })

  return { session, peers, status, presence }
}
