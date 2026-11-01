import type { DropdownMenuItem } from '@nuxt/ui'
import { World } from '@klonk/world'
import {
  deleteBrowserProject, ensurePermission, forgetProject, listBrowserProjects, pickFolder, recentProjects,
  supportsBrowserProjects, supportsFolders, Project, type FileKind, type ProjectFile, type RecentProject,
} from '~/utils/project-fs'

export type ProjectDialog
  = | { mode: 'project' }
    | { mode: 'file', kind: Exclude<FileKind, 'other'>, folder?: string }
    | { mode: 'folder', parent?: string }
    | { mode: 'rename', file: ProjectFile }
    | { mode: 'renameFolder', path: string }

/** Zeile der Baumansicht: Ordner (auf-/zuklappbar) oder Datei, mit Einrückung */
export type TreeRow
  = | { type: 'folder', path: string, name: string, depth: number, open: boolean }
    | { type: 'file', file: ProjectFile, depth: number }

const PROGRAM_KINDS = ['blocks', 'klonk', 'javascript', 'typescript', 'python', 'java', 'csharp'] as const
const join = (folder: string | undefined, name: string) => (folder ? `${folder}/${name}` : name)
const baseName = (path: string) => path.slice(path.lastIndexOf('/') + 1)
const parentOf = (path: string) => (path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '')

// Zugeklappte Ordner (modulweit, bleibt beim Seitenwechsel erhalten)
const collapsed = ref(new Set<string>())

/** Gemeinsame Bedienlogik für Projekt-Seitenleiste und Vollbild-Explorer */
export function useProjectExplorer(options: { onOpenFile?: (file: ProjectFile) => void } = {}) {
  const { t, locale } = useI18n()
  const toast = useToast()
  const proj = useProject()
  const { start } = useWorldEditor()
  const { files, folders } = proj

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
    if (mode === 'project') return t('project.newBrowserProject')
    if (mode === 'folder') return t('project.newFolder')
    return mode === 'rename' || mode === 'renameFolder' ? t('project.rename') : t('project.newFile')
  })

  function openDialog(value: ProjectDialog) {
    dialog.value = value
    dialogName.value = value.mode === 'rename'
      ? value.file.path
      : value.mode === 'renameFolder'
        ? value.path
        : value.mode === 'project'
          ? t('project.defaultProjectName')
          : value.mode === 'folder' ? t('project.defaultName.folder') : t(`project.defaultName.${value.kind}`)
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
        await proj.create(join(d.folder, name), d.kind, initial)
        if (d.folder) expand(d.folder)
      }
      else if (d.mode === 'folder') {
        await proj.createFolder(join(d.parent, name))
        if (d.parent) expand(d.parent)
      }
      else if (d.mode === 'renameFolder') {
        if (name !== d.path) await proj.renameFolder(d.path, name)
      }
      else if (name !== d.file.path) {
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

  async function removeFolder(path: string) {
    if (!confirm(t('project.confirmDeleteFolder', { name: path }))) return
    await proj.removeFolder(path).catch(fail)
  }

  /** Datei oder Ordner in einen anderen Ordner verschieben (`''` = oberste Ebene), z. B. per Ziehen */
  async function move(path: string, folder: string, isFolder = false) {
    const target = join(folder || undefined, baseName(path))
    if (target === path || (isFolder && (folder === path || folder.startsWith(`${path}/`)))) return
    try {
      if (isFolder) await proj.renameFolder(path, target)
      else await proj.rename(path, target)
      if (folder) expand(folder)
    }
    catch (error) {
      fail(error)
    }
  }

  // Ziehen und Ablegen: Dateien/Ordner auf einen Ordner ziehen (`''` = oberste Ebene)
  const DRAG_TYPE = 'application/x-klonk-entry'
  const dropTarget = ref<string | null>(null)
  function onDragStart(event: DragEvent, path: string, isFolder: boolean) {
    event.dataTransfer?.setData(DRAG_TYPE, JSON.stringify({ path, isFolder }))
    if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move'
  }
  function onDragOver(event: DragEvent, folder: string) {
    if (!event.dataTransfer?.types.includes(DRAG_TYPE)) return
    event.preventDefault()
    event.stopPropagation()
    dropTarget.value = folder
  }
  function onDrop(event: DragEvent, folder: string) {
    const data = event.dataTransfer?.getData(DRAG_TYPE)
    dropTarget.value = null
    if (!data) return
    event.preventDefault()
    event.stopPropagation()
    const { path, isFolder } = JSON.parse(data) as { path: string, isFolder: boolean }
    if (parentOf(path) !== folder) void move(path, folder, isFolder)
  }

  /** Menü „Neu“: Programme, Welt, Ordner – optional in einem Ordner */
  function newItemsIn(folder?: string): DropdownMenuItem[][] {
    return [
      PROGRAM_KINDS.map(kind => ({
        label: t(`editor.languages.${kind}`), icon: KIND_ICON[kind], onSelect: () => openDialog({ mode: 'file', kind, folder }),
      })),
      [
        { label: t('project.world'), icon: KIND_ICON.world, onSelect: () => openDialog({ mode: 'file', kind: 'world', folder }) },
        { label: t('project.folder'), icon: 'i-lucide-folder-plus', onSelect: () => openDialog({ mode: 'folder', parent: folder }) },
      ],
    ]
  }
  const newItems = computed(() => newItemsIn())

  function folderActions(path: string): DropdownMenuItem[][] {
    return [
      [{ label: t('project.newFile'), icon: 'i-lucide-plus', children: newItemsIn(path) }],
      [
        { label: t('project.rename'), icon: 'i-lucide-pencil', onSelect: () => openDialog({ mode: 'renameFolder', path }) },
        { label: t('project.delete'), icon: 'i-lucide-trash-2', color: 'error', onSelect: () => removeFolder(path) },
      ],
    ]
  }

  // Baumansicht: Ordner zuerst, dann Dateien; zugeklappte Ordner verbergen ihren Inhalt
  function expand(path: string) {
    const next = new Set(collapsed.value)
    for (let p = path; p; p = parentOf(p)) next.delete(p)
    collapsed.value = next
  }
  function toggleFolder(path: string) {
    const next = new Set(collapsed.value)
    if (next.has(path)) next.delete(path)
    else next.add(path)
    collapsed.value = next
  }
  const tree = computed<TreeRow[]>(() => {
    const rows: TreeRow[] = []
    const add = (folder: string, depth: number) => {
      for (const path of folders.value.filter(f => parentOf(f) === folder)) {
        const open = !collapsed.value.has(path)
        rows.push({ type: 'folder', path, name: baseName(path), depth, open })
        if (open) add(path, depth + 1)
      }
      for (const file of files.value.filter(f => parentOf(f.path) === folder)) rows.push({ type: 'file', file, depth })
    }
    add('', 0)
    return rows
  })

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
    remove, openFile, newItems, newItemsIn, fileActions, kindLabel,
    folders, tree, toggleFolder, expand, folderActions, removeFolder, move, parentOf, baseName,
    dropTarget, onDragStart, onDragOver, onDrop,
  }
}

/** Symbole für Menüs (die Dateiliste nutzt `FileIcon`) */
const KIND_ICON: Record<FileKind, string> = {
  blocks: 'i-lucide-puzzle',
  klonk: 'i-lucide-file-code',
  javascript: 'i-simple-icons-javascript',
  typescript: 'i-simple-icons-typescript',
  python: 'i-simple-icons-python',
  java: 'i-simple-icons-openjdk',
  csharp: 'i-simple-icons-dotnet',
  world: 'i-lucide-boxes',
  other: 'i-lucide-file',
}
