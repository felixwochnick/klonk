import type { DropdownMenuItem } from '@nuxt/ui'
import { DEFAULT_DESIGNS, World } from '@klonk/world'
import type { SqlEngineName } from '@klonk/runtime'
import { databaseSample, sqlSample } from '~/utils/sql-samples'
import {
  DATABASE_EXTENSIONS, deleteBrowserProject, ensurePermission, forgetProject, listBrowserProjects, pickFolder, recentProjects,
  supportsBrowserProjects, supportsFolders, Project, type FileKind, type ProjectFile, type RecentProject,
} from '~/utils/project-fs'

export type ProjectDialog
  = | { mode: 'project' }
    /** Leerer Ordner geöffnet: Sprache wählen, Startdateien anlegen */
    | { mode: 'init' }
    | { mode: 'file', kind: Exclude<FileKind, 'other'>, folder?: string, engine?: SqlEngineName }
    | { mode: 'folder', parent?: string }
    /** Package (Java, Python) bzw. Namespace (C#): Ordner je Namensteil, Python mit __init__.py */
    | { mode: 'package', language: PackageLanguage, parent?: string }
    | { mode: 'rename', file: ProjectFile }
    | { mode: 'renameFolder', path: string }
    /** Klonk Cloud: neues Projekt bzw. geöffnetes lokales Projekt hochladen */
    | { mode: 'cloud' }
    | { mode: 'upload' }

/** Zeile der Baumansicht: Ordner (auf-/zuklappbar) oder Datei, mit Einrückung */
export type TreeRow
  = | { type: 'folder', path: string, name: string, depth: number, open: boolean }
    | { type: 'file', file: ProjectFile, depth: number }

const PROGRAM_KINDS = ['blocks', 'klonk', 'javascript', 'typescript', 'python', 'java', 'csharp'] as const
/** Sprachen, deren Ordner Packages bzw. Namespaces sind */
const PACKAGE_LANGUAGES = ['java', 'python', 'csharp'] as const
export type PackageLanguage = typeof PACKAGE_LANGUAGES[number]
/** Teile eines Package-/Namespace-Namens (`spiel.figuren`) – Bezeichner der Sprache */
const PACKAGE_PART: Record<PackageLanguage, RegExp> = { java: /^[a-z_$][\w$]*$/i, python: /^[a-z_]\w*$/i, csharp: /^[a-z_]\w*$/i }
const join = (folder: string | undefined, name: string) => (folder ? `${folder}/${name}` : name)
const baseName = (path: string) => path.slice(path.lastIndexOf('/') + 1)
const parentOf = (path: string) => (path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '')

// Zugeklappte Ordner (modulweit, bleibt beim Seitenwechsel erhalten)
const collapsed = ref(new Set<string>())

/** Gemeinsame Bedienlogik für Projekt-Seitenleiste und Vollbild-Explorer */
export function useProjectExplorer(options: { onOpenFile?: (file: ProjectFile) => void } = {}) {
  const { t, locale } = useI18n()
  const toast = useToast()
  const apiError = useApiError()
  const proj = useProject()
  const cloud = useCloud()
  const databases = useDatabases()
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
    if (picked) await proj.open(picked).then(offerSetup, fail)
  }

  /** Leerer Ordner ohne klonk.json ⇒ wie ein neues Projekt einrichten */
  function offerSetup() {
    if (proj.project.value && !files.value.length && !proj.folders.value.length && !proj.language.value) openDialog({ mode: 'init' })
  }

  /** Sprache festlegen und Startdateien anlegen (Programm + Welt) */
  async function createStarterFiles(language: ProgramLanguage) {
    const lang = locale.value === 'en' ? 'en' : 'de'
    await proj.setLanguage(language)
    await proj.create(t('project.defaultName.world'), 'world', `${JSON.stringify(start.value.toJSON(), null, 2)}\n`)
    await proj.create(language === 'java' ? 'src/Main' : t(`project.defaultName.${language}`), language, programSample(language, lang))
  }

  async function openRecent(item: RecentProject) {
    if (!(await ensurePermission(item.handle))) {
      toast.add({ title: t('project.errors.permission'), color: 'error' })
      return
    }
    await proj.open(new Project(item.handle, item.source)).then(offerSetup, async (error) => {
      await forgetProject(item.source, item.name)
      fail(error)
    })
  }

  const openBrowserProject = (name: string) => proj.openBrowserProject(name).then(offerSetup, fail)

  async function removeBrowserProject(name: string) {
    if (!confirm(t('project.confirmDeleteProject', { name }))) return
    if (proj.project.value?.source === 'browser' && proj.project.value.name === name) await proj.close()
    await deleteBrowserProject(name)
    await loadLists()
  }

  // Dialoge: neues Projekt, neue Datei, umbenennen
  const dialog = ref<ProjectDialog | null>(null)
  const dialogName = ref('')
  const dialogLanguage = ref<ProgramLanguage>('blocks')
  const dialogTitle = computed(() => {
    const mode = dialog.value?.mode
    if (mode === 'project') return t('project.newBrowserProject')
    if (mode === 'cloud') return t('cloud.newProject')
    if (mode === 'upload') return t('cloud.upload')
    if (mode === 'init') return t('project.setup')
    if (mode === 'folder') return t('project.newFolder')
    if (dialog.value?.mode === 'package') return t(`project.newPackage.${dialog.value.language}`)
    return mode === 'rename' || mode === 'renameFolder' ? t('project.rename') : t('project.newFile')
  })

  const program = useProgram()
  function openDialog(value: ProjectDialog) {
    dialog.value = value
    // Neues Projekt: zuletzt in der IDE genutzte Sprache vorschlagen
    if (value.mode === 'project' || value.mode === 'init' || value.mode === 'cloud') dialogLanguage.value = program.language.value
    dialogName.value = value.mode === 'upload'
      ? proj.project.value?.name ?? ''
      : value.mode === 'cloud'
        ? t('project.defaultProjectName')
        : value.mode === 'rename'
          ? value.file.path
          : value.mode === 'renameFolder'
            ? value.path
            : value.mode === 'project' || value.mode === 'init'
              ? (value.mode === 'init' ? proj.project.value?.name ?? '' : t('project.defaultProjectName'))
              : value.mode === 'folder'
                ? t('project.defaultName.folder')
                : value.mode === 'package' ? t(`project.defaultName.package.${value.language}`) : t(`project.defaultName.${value.kind}`)
  }

  async function submitDialog() {
    const d = dialog.value
    const name = dialogName.value.trim()
    if (!d || !name) return
    const lang = locale.value === 'en' ? 'en' : 'de'
    try {
      if (d.mode === 'project') {
        await proj.openBrowserProject(name, true)
        // Ein neues Projekt bekommt seine Sprache, gleich ein Programm und eine Welt
        if (!files.value.length) await createStarterFiles(dialogLanguage.value)
      }
      else if (d.mode === 'init') {
        await createStarterFiles(dialogLanguage.value)
      }
      else if (d.mode === 'cloud') {
        await cloud.create(name)
        await createStarterFiles(dialogLanguage.value)
      }
      else if (d.mode === 'upload') {
        await cloud.upload(name)
      }
      else if (d.mode === 'file' && (d.kind === 'database' || d.kind === 'sql')) {
        // Datenbank: Endung nach Engine (name.sqlite.sql / name.postgres.sql)
        const extension = d.kind === 'database' ? DATABASE_EXTENSIONS[d.engine ?? 'sqlite'] : '.sql'
        const file = name.toLowerCase().endsWith(extension) ? name : `${name}${extension}`
        await proj.create(join(d.folder, file), d.kind, d.kind === 'database' ? databaseSample(lang) : sqlSample(lang))
        if (d.folder) expand(d.folder)
      }
      else if (d.mode === 'file') {
        const initial = d.kind === 'world'
          ? `${JSON.stringify(World.empty().toJSON(), null, 2)}\n`
          : d.kind === 'design'
            ? `${JSON.stringify({ ...DEFAULT_DESIGNS.male, name }, null, 2)}\n`
            : d.kind === 'java'
              ? javaClassSource(name.replace(/\.java$/i, ''), javaPackage(d.folder ?? ''))
            // C#: weitere Dateien als Klasse im Namespace des Ordners (Anweisungen gibt es nur in einer Datei)
              : d.kind === 'csharp' && files.value.some(f => f.kind === 'csharp')
                ? csharpClassSource(name.replace(/\.cs$/i, ''), csharpNamespace(d.folder ?? ''))
                : programSample(d.kind as ProgramLanguage, lang)
        await proj.create(join(d.folder, name), d.kind, initial)
        if (d.folder) expand(d.folder)
      }
      else if (d.mode === 'folder') {
        await proj.createFolder(join(d.parent, name))
        if (d.parent) expand(d.parent)
      }
      else if (d.mode === 'package') {
        await createPackage(d.language, name, d.parent)
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
      // Server-Fehler (Cloud) mit Code, sonst Dateisystem
      if ((error as { data?: { message?: string } })?.data?.message) toast.add({ title: apiError(error), color: 'error' })
      else fail(error)
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

  /** Dateiarten für „Neue Datei“: Programme, Welt/Design, Datenbanken – optional in einem Ordner */
  function fileItemsIn(folder?: string): DropdownMenuItem[][] {
    return [
      // Im Projekt mit fester Sprache nur diese (plus Welten und Ordner)
      PROGRAM_KINDS.filter(kind => !proj.language.value || kind === proj.language.value).map(kind => ({
        label: t(`editor.languages.${kind}`), icon: KIND_ICON[kind], onSelect: () => openDialog({ mode: 'file', kind, folder }),
      })),
      [
        { label: t('project.world'), icon: KIND_ICON.world, onSelect: () => openDialog({ mode: 'file', kind: 'world', folder }) },
        { label: t('project.design'), icon: KIND_ICON.design, onSelect: () => openDialog({ mode: 'file', kind: 'design', folder }) },
      ],
      // Datenbanken (SQLite/PostgreSQL), Abfragen, vorhandene SQLite-Datei übernehmen
      [
        { label: t('database.newSqlite'), icon: KIND_ICON.database, onSelect: () => openDialog({ mode: 'file', kind: 'database', engine: 'sqlite', folder }) },
        { label: t('database.newPostgres'), icon: KIND_ICON.database, onSelect: () => openDialog({ mode: 'file', kind: 'database', engine: 'postgres', folder }) },
        { label: t('database.newQuery'), icon: KIND_ICON.sql, onSelect: () => openDialog({ mode: 'file', kind: 'sql', folder }) },
        { label: t('database.import'), icon: 'i-lucide-file-up', onSelect: () => importDatabase(folder) },
      ],
    ]
  }

  /** Packages/Namespaces: Projektsprache – im gemischten Projekt die Sprachen, die es darin gibt */
  const packageLanguages = computed(() => PACKAGE_LANGUAGES.filter(language => (proj.language.value
    ? proj.language.value === language
    : files.value.some(f => f.kind === language))))
  function packageItemsIn(folder?: string): DropdownMenuItem[] {
    return packageLanguages.value.map(language => ({
      label: t(`project.newPackage.${language}`),
      icon: language === 'csharp' ? 'i-lucide-braces' : 'i-lucide-package',
      onSelect: () => openDialog({ mode: 'package', language, parent: folder }),
    }))
  }

  /** Menü „Neu“ (Knopf): Dateiarten, Ordner und Packages */
  function newItemsIn(folder?: string): DropdownMenuItem[][] {
    const [programs, other, databases] = fileItemsIn(folder)
    return [
      programs!,
      [...other!, { label: t('project.folder'), icon: 'i-lucide-folder-plus', onSelect: () => openDialog({ mode: 'folder', parent: folder }) }, ...packageItemsIn(folder)],
      databases!,
    ]
  }
  const newItems = computed(() => newItemsIn())

  /** Anlegen im Kontextmenü: „Neue Datei ›“, „Neuer Ordner“, Packages/Namespaces */
  function createItemsIn(folder?: string): DropdownMenuItem[] {
    return [
      { label: t('project.newFile'), icon: 'i-lucide-file-plus', children: fileItemsIn(folder) },
      { label: t('project.newFolder'), icon: 'i-lucide-folder-plus', onSelect: () => openDialog({ mode: 'folder', parent: folder }) },
      ...packageItemsIn(folder),
    ]
  }

  /**
   * Package bzw. Namespace anlegen: `spiel.figuren` ⇒ Ordner `spiel/figuren`. Auf oberster Ebene liegen Java/C# unter `src`
   * (bzw. `src/main/java`), wie die Startdateien – `javaPackage()`/`csharpNamespace()` leiten den Namen daraus ab.
   * Python bekommt in jedem Ordner eine `__init__.py`.
   */
  async function createPackage(language: PackageLanguage, name: string, parent?: string) {
    const parts = name.split('.').map(p => p.trim())
    if (!parts.length || !parts.every(p => PACKAGE_PART[language].test(p))) throw new Error('invalid_name')
    let base = parent ?? ''
    if (!base && language !== 'python') {
      base = folders.value.includes('src/main/java') && language === 'java' ? 'src/main/java' : folders.value.includes('src') || language === 'java' ? 'src' : ''
    }
    const path = join(base || undefined, parts.join('/'))
    if (folders.value.includes(path)) throw new Error('exists')
    await proj.createFolder(path)
    if (language === 'python') {
      for (let i = 1; i <= parts.length; i++) {
        const init = `${join(base || undefined, parts.slice(0, i).join('/'))}/__init__.py`
        if (!files.value.some(f => f.path === init)) await proj.project.value!.write(init, '')
      }
      await proj.refresh()
    }
    expand(path)
  }

  /** SQLite-Datei (z. B. aus DB Browser for SQLite) als Datenbank ins Projekt übernehmen */
  function importDatabase(folder?: string) {
    const input = Object.assign(document.createElement('input'), { type: 'file', accept: '.db,.sqlite,.sqlite3,.db3' })
    input.onchange = async () => {
      const file = input.files?.[0]
      if (!file) return
      try {
        const path = await databases.importSqlite(file, folder)
        if (folder) expand(folder)
        toast.add({ title: t('database.imported', { name: path ?? file.name }), color: 'success' })
      }
      catch {
        toast.add({ title: t('database.importFailed'), color: 'error' })
      }
    }
    input.click()
  }

  function folderActions(path: string): DropdownMenuItem[][] {
    // Gemeinsamer Ordner einer Gruppe: Aufgaben verteilen bzw. bearbeiten
    const assignment = cloud.folderActions(path)
    if (proj.readOnly.value) return assignment.length ? [assignment] : []
    return [
      createItemsIn(path),
      [
        { label: t('project.rename'), icon: 'i-lucide-pencil', onSelect: () => openDialog({ mode: 'renameFolder', path }) },
        { label: t('project.delete'), icon: 'i-lucide-trash-2', color: 'error', onSelect: () => removeFolder(path) },
      ],
      ...(assignment.length ? [assignment] : []),
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
    if (proj.readOnly.value) return []
    const edit: DropdownMenuItem[] = file.kind === 'world'
      ? [{ label: t('project.editWorld'), icon: 'i-lucide-pencil-ruler', onSelect: () => editWorld(file) }]
      : []
    const manage: DropdownMenuItem[] = [
      { label: t('project.rename'), icon: 'i-lucide-pencil', onSelect: () => openDialog({ mode: 'rename', file }) },
      { label: t('project.delete'), icon: 'i-lucide-trash-2', color: 'error', onSelect: () => remove(file) },
    ]
    return edit.length ? [edit, manage] : [manage]
  }

  /** Rechtsklick auf eine Datei: Öffnen, Bearbeiten/Umbenennen/Löschen, daneben Neues anlegen */
  function fileContextItems(file: ProjectFile): DropdownMenuItem[][] {
    const open: DropdownMenuItem[] = file.kind === 'other' ? [] : [{ label: t(file.kind === 'world' ? 'project.useWorld' : 'project.open'), icon: 'i-lucide-file-input', onSelect: () => openFile(file) }]
    if (proj.readOnly.value) return open.length ? [open] : []
    return [...(open.length ? [open] : []), ...fileActions(file), createItemsIn(parentOf(file.path) || undefined)]
  }

  /** Rechtsklick auf freie Fläche (oberste Ebene bzw. geöffneter Ordner im Vollbild-Explorer) */
  function areaContextItems(folder?: string): DropdownMenuItem[][] {
    return proj.readOnly.value ? [] : [createItemsIn(folder)]
  }

  /** Welt wählen und im Welt-Editor öffnen (lädt sie dort automatisch) */
  async function editWorld(file: ProjectFile) {
    proj.selectWorld(file.path)
    await navigateTo({ path: '/world', query: { load: '1' } })
  }

  /** Bezeichnung der Dateiart */
  const kindLabel = (kind: FileKind) => (kind === 'world' || kind === 'design' || kind === 'database' || kind === 'sql'
    ? t(`project.${kind}`)
    : kind === 'other' ? t('project.otherFile') : t(`editor.languages.${kind}`))

  return {
    proj, cloud, canFolders, canBrowser, browserProjects, recent, loadLists, fail,
    openFolder, openRecent, openBrowserProject, removeBrowserProject,
    dialog, dialogName, dialogLanguage, dialogTitle, openDialog, submitDialog,
    remove, openFile, newItems, newItemsIn, fileActions, fileContextItems, areaContextItems, kindLabel,
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
  design: 'i-lucide-palette',
  database: 'i-lucide-database',
  sql: 'i-lucide-file-search',
  other: 'i-lucide-file',
}
