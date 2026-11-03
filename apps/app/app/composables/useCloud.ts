import type { DropdownMenuItem } from '@nuxt/ui'
import { CloudProject, forgetCloudCopy, uploadToCloud, type CloudProjectMeta } from '~/utils/cloud-project'

type Submission = { projectId: string, name: string, userId: string, displayName: string, updatedAt: string }

/** Klonk Cloud im Explorer: Übersicht, Projekte öffnen/anlegen/hochladen, Gruppenordner und Aufgaben */
export function useCloud() {
  const { t } = useI18n()
  const toast = useToast()
  const apiError = useApiError()
  const proj = useProject()

  const { data: status, refresh } = useFetch<CloudStatus>('/api/cloud', {
    key: 'cloud-status',
    server: false,
    headers: clientHostHeaders(),
    default: () => null as unknown as CloudStatus,
  })

  const fail = (error: unknown) => toast.add({ title: apiError(error), color: 'error' })
  const current = computed(() => (proj.project.value instanceof CloudProject ? proj.project.value : null))
  const isOpen = (id: string | null) => !!id && current.value?.meta.id === id

  const open = (meta: CloudProjectMeta) => proj.openCloud(meta).catch(fail)

  function openProject(project: CloudProjectInfo) {
    return open({ id: project.id, name: project.name, kind: project.kind, writable: project.writable })
  }

  function openGroup(group: CloudGroupInfo) {
    if (!group.projectId) return
    return open({ id: group.projectId, name: group.name, kind: 'group', writable: !!status.value?.enabled && (group.leader || group.membersCanWrite) })
  }

  /** Neues, leeres Cloud-Projekt anlegen und öffnen */
  async function create(name: string) {
    const created = await $fetch<{ id: string, name: string }>('/api/cloud/projects', { method: 'POST', headers: clientHostHeaders(), body: { name } })
    await refresh()
    await open({ id: created.id, name: created.name, kind: 'personal', writable: true })
  }

  /** Geöffnetes lokales Projekt in die Cloud kopieren und die Cloud-Fassung öffnen */
  async function upload(name: string) {
    if (!proj.project.value) return
    await proj.flush()
    const created = await uploadToCloud(proj.project.value, name)
    await refresh()
    await open({ id: created.id, name: created.name, kind: 'personal', writable: true })
    toast.add({ title: t('cloud.uploaded', { name: created.name }), color: 'success' })
  }

  async function remove(project: CloudProjectInfo) {
    if (!confirm(t('cloud.confirmDelete', { name: project.name }))) return
    try {
      if (isOpen(project.id)) await proj.close()
      await $fetch(`/api/cloud/projects/${project.id}` as string, { method: 'DELETE', headers: clientHostHeaders() })
      await forgetCloudCopy(project.id)
      await refresh()
    }
    catch (error) {
      fail(error)
    }
  }

  // Aufgaben im gemeinsamen Ordner der geöffneten Gruppe
  const openGroupInfo = computed(() => (current.value?.meta.kind === 'group'
    ? status.value?.groups.find(g => g.projectId === current.value!.meta.id) ?? null
    : null))
  const assignmentAt = (path: string) => openGroupInfo.value?.assignments.find(a => a.path === path) ?? null

  async function assign(path: string) {
    try {
      await $fetch(`/api/cloud/groups/${openGroupInfo.value!.id}/assignments` as string, { method: 'POST', headers: clientHostHeaders(), body: { path } })
      await refresh()
      toast.add({ title: t('cloud.assigned', { path }), color: 'success' })
    }
    catch (error) {
      fail(error)
    }
  }

  async function unassign(id: string) {
    await $fetch(`/api/cloud/assignments/${id}` as string, { method: 'DELETE', headers: clientHostHeaders() }).catch(fail)
    await refresh()
  }

  /** Aufgabe bearbeiten: eigene Kopie anlegen bzw. öffnen */
  async function work(assignment: CloudAssignmentInfo) {
    try {
      const project = await $fetch<{ id: string, name: string }>(`/api/cloud/assignments/${assignment.id}/start` as string, { method: 'POST', headers: clientHostHeaders() })
      await refresh()
      await open({ id: project.id, name: project.name, kind: 'submission', writable: !!status.value?.enabled })
    }
    catch (error) {
      fail(error)
    }
  }

  // Abgaben (Gruppenleitung)
  const submissions = ref<{ path: string, items: Submission[] } | null>(null)
  async function showSubmissions(assignment: CloudAssignmentInfo) {
    try {
      const items = await $fetch<Submission[]>(`/api/cloud/assignments/${assignment.id}/submissions` as string, { headers: clientHostHeaders() })
      submissions.value = { path: assignment.path, items }
    }
    catch (error) {
      fail(error)
    }
  }
  async function openSubmission(item: Submission) {
    submissions.value = null
    await open({ id: item.projectId, name: `${item.displayName} – ${item.name}`, kind: 'submission', writable: false })
  }

  /** Zusätzliche Ordneraktionen im gemeinsamen Ordner: Aufgabe verteilen/ansehen bzw. bearbeiten */
  function folderActions(path: string): DropdownMenuItem[] {
    const group = openGroupInfo.value
    if (!group) return []
    const assignment = assignmentAt(path)
    if (group.leader) {
      return assignment
        ? [
            { label: t('cloud.submissions'), icon: 'i-lucide-inbox', onSelect: () => showSubmissions(assignment) },
            { label: t('cloud.unassign'), icon: 'i-lucide-undo-2', onSelect: () => unassign(assignment.id) },
          ]
        : [{ label: t('cloud.assign'), icon: 'i-lucide-send', onSelect: () => assign(path) }]
    }
    return assignment ? [{ label: t('cloud.work'), icon: 'i-lucide-pencil-line', onSelect: () => work(assignment) }] : []
  }

  const formatSize = (bytes: number) => `${(bytes / 1024 / 1024).toLocaleString(undefined, { maximumFractionDigits: 1 })} MB`

  return {
    status, refresh, current, isOpen, openProject, openGroup, create, upload, remove,
    openGroupInfo, assignmentAt, folderActions, work, submissions, openSubmission, formatSize,
  }
}
