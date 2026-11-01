import type { DropdownMenuItem } from '@nuxt/ui'
import { World } from '@klonk/world'
import {
  deleteBrowserProject, ensurePermission, forgetProject, listBrowserProjects, pickFolder, recentProjects,
  supportsBrowserProjects, supportsFolders, Project, type FileKind, type ProjectFile, type RecentProject,
} from '~/utils/project-fs'

export type ProjectDialog = { mode: 'project' } | { mode: 'file', kind: Exclude<FileKind, 'other'> } | { mode: 'rename', file: ProjectFile }

/** Gemeinsame Bedienlogik für Projekt-Seitenleiste und Vollbild-Explorer */
export function useProjectExplorer(options: { onOpenFile?: (file: ProjectFile) => void } = {}) {
  const { t, locale } = useI18n()
  const toast = useToast()
  const proj = useProject()
  const { start } = useWorldEditor()
  const { files } = proj

  const canFolders = ref(false)
  const canBrowser = ref(false)
  const browserProjects = ref<string[]>([])
  const recent = ref<RecentProject[]>([])

  async function loadLists() {
    canFolders.value = supportsFolders()
    canBrowser.value = supportsBrowserProjects()
    if (canBrowser.value) browserProjects.value = await listBrowserProjects().catch(() => [])
    recent.value = (await recentProjects()).filter(r => r.source === 'folder')
  }
  onMounted(loadLists)
  watch(proj.project, loadLists)

  function fail(error: unknown) {
    const code = (error as Error)?.message
    toast.add({ title: t(code === 'exists' ? 'project.errors.exists' : code === 'invalid_name' ? 'project.errors.invalidName' : 'project.errors.generic'), color: 'error' })
  }

  async function openFolder() {
    const picked = await pickFolder()
    if (picked) await proj.open(picked).catch(fail)
  }

  async function openRecent(item: RecentProject) {
    if (!(await ensurePermission(item.handle))) {
      toast.add({ title: t('project.errors.permission'), color: 'error' })
      return
    }
    await proj.open(new Project(item.handle, item.source)).catch(async (error) => {
      await forgetProject(item.source, item.name)
      fail(error)
    })
  }

  const openBrowserProject = (name: string) => proj.openBrowserProject(name).catch(fail)

  async function removeBrowserProject(name: string) {
    if (!confirm(t('project.confirmDeleteProject', { name }))) return
    if (proj.project.value?.source === 'browser' && proj.project.value.name === name) await proj.close()
    await deleteBrowserProject(name)
    await loadLists()
  }

  // Dialoge: neues Projekt, neue Datei, umbenennen
  const dialog = ref<ProjectDialog | null>(null)
  const dialogName = ref('')
  const dialogTitle = computed(() => {
    const mode = dialog.value?.mode
    return mode === 'project' ? t('project.newBrowserProject') : mode === 'rename' ? t('project.rename') : t('project.newFile')
  })

  function openDialog(value: ProjectDialog) {
    dialog.value = value
    dialogName.value = value.mode === 'rename' ? value.file.path : value.mode === 'project' ? t('project.defaultProjectName') : t(`project.defaultName.${value.kind}`)
  }

  async function submitDialog() {
    const d = dialog.value
    const name = dialogName.value.trim()
    if (!d || !name) return
    const lang = locale.value === 'en' ? 'en' : 'de'
    try {
      if (d.mode === 'project') {
        await proj.openBrowserProject(name, true)
        // Ein neues Projekt bekommt gleich ein Programm und eine Welt
        if (!files.value.length) {
          await proj.create(t('project.defaultName.world'), 'world', `${JSON.stringify(start.value.toJSON(), null, 2)}\n`)
          await proj.create(t('project.defaultName.blocks'), 'blocks', programSample('blocks', lang))
        }
      }
      else if (d.mode === 'file') {
        const initial = d.kind === 'world' ? `${JSON.stringify(World.empty().toJSON(), null, 2)}\n` : programSample(d.kind, lang)
        await proj.create(name, d.kind, initial)
      }
      else {
        await proj.rename(d.file.path, name)
      }
      dialog.value = null
    }
    catch (error) {
      fail(error)
    }
  }

  async function remove(file: ProjectFile) {
    if (!confirm(t('project.confirmDelete', { name: file.path }))) return
    await proj.remove(file.path).catch(fail)
  }

  /** Programm öffnen bzw. Welt als Projektwelt wählen */
  async function openFile(file: ProjectFile) {
    if (file.kind === 'other') return
    if (file.kind === 'world') proj.selectWorld(file.path)
    else await proj.select(file.path).catch(fail)
    options.onOpenFile?.(file)
  }

  const newItems = computed<DropdownMenuItem[][]>(() => [
    (['blocks', 'klonk', 'javascript', 'typescript', 'python'] as const).map(kind => ({
      label: t(`editor.languages.${kind}`), icon: KIND_ICON[kind], onSelect: () => openDialog({ mode: 'file', kind }),
    })),
    [{ label: t('project.world'), icon: KIND_ICON.world, onSelect: () => openDialog({ mode: 'file', kind: 'world' }) }],
  ])

  function fileActions(file: ProjectFile): DropdownMenuItem[][] {
    const edit: DropdownMenuItem[] = file.kind === 'world'
      ? [{ label: t('project.editWorld'), icon: 'i-lucide-pencil-ruler', onSelect: () => editWorld(file) }]
      : []
    const manage: DropdownMenuItem[] = [
      { label: t('project.rename'), icon: 'i-lucide-pencil', onSelect: () => openDialog({ mode: 'rename', file }) },
      { label: t('project.delete'), icon: 'i-lucide-trash-2', color: 'error', onSelect: () => remove(file) },
    ]
    return edit.length ? [edit, manage] : [manage]
  }

  /** Welt wählen und im Welt-Editor öffnen (lädt sie dort automatisch) */
  async function editWorld(file: ProjectFile) {
    proj.selectWorld(file.path)
    await navigateTo({ path: '/world', query: { load: '1' } })
  }

  /** Bezeichnung der Dateiart */
  const kindLabel = (kind: FileKind) => (kind === 'world' ? t('project.world') : kind === 'other' ? t('project.otherFile') : t(`editor.languages.${kind}`))

  return {
    proj, canFolders, canBrowser, browserProjects, recent, loadLists, fail,
    openFolder, openRecent, openBrowserProject, removeBrowserProject,
    dialog, dialogName, dialogTitle, openDialog, submitDialog,
    remove, openFile, newItems, fileActions, kindLabel,
  }
}

/** Symbole für Menüs (die Dateiliste nutzt `FileIcon`) */
const KIND_ICON: Record<FileKind, string> = {
  blocks: 'i-lucide-puzzle',
  klonk: 'i-lucide-file-code',
  javascript: 'i-simple-icons-javascript',
  typescript: 'i-simple-icons-typescript',
  python: 'i-simple-icons-python',
  world: 'i-lucide-boxes',
  other: 'i-lucide-file',
}
