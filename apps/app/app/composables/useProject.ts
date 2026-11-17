import { parseDesign, parseWorld, type RobotDesign, type WorldData } from '@klonk/world'
import { KIND_EXTENSION, MANIFEST, fileKind, isValidName, openBrowserProject, rememberProject } from '~/utils/project-fs'
import type { FileKind, Project, ProjectFile } from '~/utils/project-fs'
import { CloudProject, openCloudProject, type CloudProjectMeta } from '~/utils/cloud-project'
import UnsavedChangesDialog from '~/components/UnsavedChangesDialog.vue'

// Zustand außerhalb von Komponenten: Datei-Handles sind nicht serialisierbar (kein useState)
const project = shallowRef<Project | null>(null)
const files = ref<ProjectFile[]>([])
const folders = ref<string[]>([])
/** Sprache des Projekts aus klonk.json (`null` = gemischt, z. B. ältere Projekte oder fremde Ordner) */
const language = ref<ProgramLanguage | null>(null)
/** Aktive Programmdatei der IDE – Designs öffnet immer der Kleiderschrank (`designPath`), SQL/Datenbanken die Seite Datenbanken (`dbPath`) */
const currentPath = ref<string | null>(null)
/** Offene Dateien der IDE (Tabs), in Reihenfolge */
const tabs = ref<string[]>([])
/** Aktive Datei und Tabs der Seite Datenbanken (Abfragen `.sql`, Datenbanken `*.sqlite.sql`/`*.postgres.sql`) */
const dbPath = ref<string | null>(null)
const dbTabs = ref<string[]>([])
/** Im Kleiderschrank geöffnetes Design */
const designPath = ref<string | null>(null)
const worldPath = ref<string | null>(null)
/** Laufende Schreibvorgänge und Fehler beim letzten Speichern */
const writing = ref(0)
const saveFailed = ref(false)
const breakpointsByFile = ref<Record<string, number[]>>({})
/** Inhalte geöffneter Dateien: `text` = im Editor, `saved` = zuletzt gespeichert */
const buffers = ref<Record<string, { text: string, saved: string }>>({})
/** Nur Designs (Kleiderschrank) speichern sich selbst – Programme erst beim Ausführen oder mit Strg+S */
const saveTimers = new Map<string, ReturnType<typeof setTimeout>>()
const autosaves = (path: string) => fileKind(path) === 'design'
const isDirty = (path: string) => {
  const buffer = buffers.value[path]
  return !!buffer && buffer.text !== buffer.saved
}
/** Geöffnete Dateien mit ungespeicherten Änderungen */
const unsaved = computed(() => Object.keys(buffers.value).filter(isDirty))
const status = computed<'saved' | 'saving' | 'error' | 'unsaved'>(() => {
  if (writing.value) return 'saving'
  if (saveFailed.value) return 'error'
  return unsaved.value.some(path => !autosaves(path)) ? 'unsaved' : 'saved'
})

// Seite verlassen mit Ungespeichertem ⇒ Rückfrage des Browsers
if (import.meta.client) {
  window.addEventListener('beforeunload', (event) => {
    if (unsaved.value.length) event.preventDefault()
  })
}

const createUnsavedDialog = (overlay: ReturnType<typeof useOverlay>) => overlay.create(UnsavedChangesDialog)
let unsavedDialog: ReturnType<typeof createUnsavedDialog> | null = null

/** Dateien, die keine importierbaren Programme sind */
const NOT_IMPORTABLE = new Set<FileKind>(['world', 'design', 'other', 'blocks', 'database', 'sql'])

/** Dateiarten, die die IDE als Tab öffnet */
const EDITOR_KINDS = new Set<FileKind>(['blocks', 'klonk', 'javascript', 'typescript', 'python', 'java', 'csharp'])
export const opensInEditor = (path: string) => EDITOR_KINDS.has(fileKind(path))
/** Dateiarten der Seite Datenbanken (eigene Tabs) */
export const opensInDatabases = (path: string) => fileKind(path) === 'sql' || fileKind(path) === 'database'
/** Tab-Gruppe einer Datei: IDE oder Datenbanken */
const tabGroup = (path: string) => (opensInDatabases(path) ? { tabs: dbTabs, active: dbPath } : { tabs, active: currentPath })
/** Datei ist irgendwo geöffnet (Tab, Kleiderschrank) ⇒ Puffer behalten */
const isOpen = (path: string) => path === currentPath.value || path === dbPath.value || path === designPath.value || tabs.value.includes(path) || dbTabs.value.includes(path)

const LAST_FILE_KEY = (p: Project) => `klonk:project:${p.source}:${p instanceof CloudProject ? p.meta.id : p.name}`

/**
 * Geöffnetes Projekt (Ordner, Browser- oder Cloud-Projekt) für IDE, Kleiderschrank und Welt-Editor:
 * Dateiliste, offene Dateien (Tabs) mit automatischem Speichern, Design im Kleiderschrank, ausgewählte Welt.
 */
export function useProject() {
  const { t } = useI18n()
  const toast = useToast()
  const overlay = useOverlay()
  const kind = computed<FileKind | null>(() => (currentPath.value ? fileKind(currentPath.value) : null))
  const content = computed(() => (currentPath.value ? buffers.value[currentPath.value]?.text ?? '' : ''))
  const dbKind = computed<FileKind | null>(() => (dbPath.value ? fileKind(dbPath.value) : null))
  const dbContent = computed(() => (dbPath.value ? buffers.value[dbPath.value]?.text ?? '' : ''))
  const designContent = computed(() => (designPath.value ? buffers.value[designPath.value]?.text ?? '' : ''))
  const programFiles = computed(() => files.value.filter(f => opensInEditor(f.path)))
  const databaseFiles = computed(() => files.value.filter(f => f.kind === 'database'))
  const sqlFiles = computed(() => files.value.filter(f => f.kind === 'sql'))
  const designFiles = computed(() => files.value.filter(f => f.kind === 'design'))
  const worldFiles = computed(() => files.value.filter(f => f.kind === 'world'))

  async function refresh() {
    if (!project.value) return
    const scanned = await project.value.scan()
    files.value = scanned.files
    folders.value = scanned.folders
  }

  /** Projekt öffnen; `false`, wenn das Wechseln wegen ungespeicherter Änderungen abgebrochen wurde */
  async function open(next: Project) {
    if (!await confirmUnsaved()) return false
    if (project.value instanceof CloudProject && project.value !== next) project.value.stop()
    project.value = next
    reset()
    language.value = await readManifest(next)
    await refresh()
    if (!(next instanceof CloudProject)) void rememberProject(next).catch(() => {})

    const last = safeStorage(() => JSON.parse(localStorage.getItem(LAST_FILE_KEY(next)) ?? 'null')) as Remembered | null
    const exists = (path: unknown): path is string => typeof path === 'string' && files.value.some(f => f.path === path)
    // Zuletzt offene Tabs; ältere Einträge kannten nur eine Datei (ggf. ein Design ⇒ Kleiderschrank) und SQL in den IDE-Tabs
    const remembered = [...new Set([...(Array.isArray(last?.tabs) ? last.tabs : []), last?.file, ...(Array.isArray(last?.dbTabs) ? last.dbTabs : []), last?.dbFile])].filter(exists)
    tabs.value = remembered.filter(opensInEditor)
    dbTabs.value = remembered.filter(opensInDatabases)
    const first = programFiles.value[0]?.path ?? null
    const target = exists(last?.file) && opensInEditor(last.file) ? last.file : tabs.value[0] ?? first
    const dbTarget = exists(last?.dbFile) && opensInDatabases(last.dbFile) ? last.dbFile : dbTabs.value[0] ?? null
    worldPath.value = exists(last?.world) ? last.world : worldFiles.value[0]?.path ?? null
    const design = exists(last?.design) ? last.design : exists(last?.file) && fileKind(last.file) === 'design' ? last.file : null
    if (design) await selectDesign(design).catch(() => {})
    if (dbTarget) await select(dbTarget)
    if (target) await select(target)
    return true
  }

  function reset() {
    for (const timer of saveTimers.values()) clearTimeout(timer)
    saveTimers.clear()
    buffers.value = {}
    tabs.value = []
    currentPath.value = null
    dbTabs.value = []
    dbPath.value = null
    designPath.value = null
    breakpointsByFile.value = {}
    saveFailed.value = false
  }

  /** Cloud-Projekt öffnen (lokale Kopie + Abgleich); Änderungen anderer laden die Dateiliste/offene Datei neu */
  async function openCloud(meta: CloudProjectMeta) {
    const next = await openCloudProject(meta, (cloud) => {
      cloud.conflictLabel = t('cloud.conflictSuffix')
      cloud.onConflict = (path, copy) => toast.add({ title: t('cloud.conflict', { path, copy }), color: 'warning' })
      cloud.onRemoteChange = paths => void remoteChanged(cloud, paths)
    })
    return open(next)
  }

  async function remoteChanged(cloud: CloudProject, paths: string[]) {
    if (project.value !== cloud) return
    await refresh()
    if (paths.includes(MANIFEST)) language.value = await readManifest(cloud)
    // Offene Dateien nur neu laden, wenn hier nichts Ungespeichertes ist
    for (const path of paths) {
      const buffer = buffers.value[path]
      if (!buffer || isDirty(path) || saveTimers.has(path)) continue
      if (!files.value.some(f => f.path === path)) {
        forget(path)
        continue
      }
      const text = await cloud.read(path)
      buffers.value[path] = { text, saved: text }
    }
  }

  /** Nur lesen: gemeinsamer Ordner ohne Schreibrecht, Abgaben anderer */
  const readOnly = computed(() => project.value instanceof CloudProject && !project.value.writable.value)
  const sync = computed(() => (project.value instanceof CloudProject ? project.value.status.value : null))

  /** Projekt schließen; `false`, wenn abgebrochen (ungespeicherte Änderungen). `discard` = ohne Rückfrage (Projekt wird gelöscht) */
  async function close(discard = false) {
    if (!discard && !await confirmUnsaved()) return false
    if (project.value instanceof CloudProject) project.value.stop()
    project.value = null
    files.value = []
    folders.value = []
    language.value = null
    reset()
    worldPath.value = null
    return true
  }

  /** Inhalt einer Datei in den Puffer laden (falls noch nicht offen) */
  async function load(path: string) {
    if (!project.value || buffers.value[path]) return
    const text = await project.value.read(path)
    buffers.value[path] ??= { text, saved: text }
  }

  function dropBuffer(path: string) {
    const { [path]: _dropped, ...rest } = buffers.value
    buffers.value = rest
  }

  /** Puffer einer Datei verwerfen (geschlossen, gelöscht) – Tab und Auswahl ziehen mit */
  function forget(path: string) {
    clearTimeout(saveTimers.get(path))
    saveTimers.delete(path)
    const group = tabGroup(path)
    const index = group.tabs.value.indexOf(path)
    if (index >= 0) group.tabs.value = group.tabs.value.filter(p => p !== path)
    if (group.active.value === path) group.active.value = group.tabs.value[Math.min(index, group.tabs.value.length - 1)] ?? null
    if (designPath.value === path) designPath.value = null
    if (!isOpen(path)) dropBuffer(path)
    // Nächster Tab ist evtl. noch nicht geladen
    if (group.active.value && !buffers.value[group.active.value]) {
      const next = group.active.value
      group.active.value = null
      void select(next)
    }
  }

  /**
   * Datei öffnen (neuer Tab neben dem aktiven bzw. vorhandenen Tab wählen): Programme in der IDE, SQL/Datenbanken auf der
   * Seite Datenbanken, Designs im Kleiderschrank. Welten sind keine Dokumente.
   */
  async function select(path: string) {
    if (!project.value) return
    if (fileKind(path) === 'design') return selectDesign(path)
    const group = tabGroup(path)
    if (path === group.active.value) return
    await load(path)
    if (!group.tabs.value.includes(path)) {
      const list = group.tabs.value
      const at = group.active.value ? list.indexOf(group.active.value) + 1 : list.length
      group.tabs.value = [...list.slice(0, at), path, ...list.slice(at)]
    }
    group.active.value = path
    // Programm in einem Ordner mit eigener Welt (z. B. Aufgabe eines Lernmoduls) ⇒ diese Welt laden
    const folder = path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : null
    const local = folder ? worldFiles.value.filter(f => f.path.startsWith(`${folder}/`) && !f.path.slice(folder.length + 1).includes('/')) : []
    if (local.length && !local.some(f => f.path === worldPath.value)) worldPath.value = local[0]!.path
    rememberSelection()
  }

  /** Tab schließen (bei ungespeicherten Änderungen mit Rückfrage) */
  async function closeTab(path: string) {
    if (!await confirmUnsaved([path])) return
    forget(path)
    rememberSelection()
  }

  /** Mehrere Tabs schließen: alle, alle außer `keep` bzw. alle rechts von `rightOf` (`databases` = Tabs der Seite Datenbanken) */
  async function closeTabs(options: { keep?: string, rightOf?: string, databases?: boolean } = {}) {
    const group = options.databases ? { tabs: dbTabs, active: dbPath } : { tabs, active: currentPath }
    const from = options.rightOf ? group.tabs.value.indexOf(options.rightOf) + 1 : 0
    const closing = group.tabs.value.slice(from).filter(p => p !== options.keep)
    if (options.keep && !group.tabs.value.includes(options.keep)) return
    if (!await confirmUnsaved(closing)) return
    const active = group.active.value
    if (options.keep && active !== options.keep) await select(options.keep)
    else if (options.rightOf && active && closing.includes(active)) await select(options.rightOf)
    for (const path of closing) forget(path)
    rememberSelection()
  }

  /** Tab verschieben (Ziehen in der Tab-Leiste) */
  function moveTab(path: string, before: string | null) {
    const group = tabGroup(path)
    const rest = group.tabs.value.filter(p => p !== path)
    const at = before ? rest.indexOf(before) : rest.length
    group.tabs.value = [...rest.slice(0, at < 0 ? rest.length : at), path, ...rest.slice(at < 0 ? rest.length : at)]
    rememberSelection()
  }

  /** Design im Kleiderschrank öffnen */
  async function selectDesign(path: string | null) {
    if (!project.value || path === designPath.value) return
    const previous = designPath.value
    if (path) await load(path)
    designPath.value = path
    if (previous && !isOpen(previous)) {
      await savePath(previous)
      dropBuffer(previous)
    }
    rememberSelection()
  }

  /** Neue Datei anlegen (Endung je nach Art) und öffnen */
  async function create(baseName: string, targetKind: Exclude<FileKind, 'other'>, initial = '') {
    if (!project.value) return null
    const name = baseName.trim()
    // Endung schon passend (z. B. `x.postgres.sql` als Datenbank) ⇒ so lassen
    const path = fileKind(name) === targetKind ? name : `${name}${KIND_EXTENSION[targetKind]}`
    if (!path.split('/').every(isValidName)) throw new Error('invalid_name')
    if (await project.value.exists(path)) throw new Error('exists')
    await project.value.write(path, initial)
    await refresh()
    if (targetKind === 'world') {
      worldPath.value ??= path
      rememberSelection()
    }
    else if (targetKind === 'design') await selectDesign(path)
    else await select(path)
    return path
  }

  async function rename(from: string, to: string) {
    if (!project.value) return
    if (!to.split('/').every(isValidName)) throw new Error('invalid_name')
    // Ungespeichertes wandert mit dem Puffer mit – außer die Datei wechselt die Ansicht (z. B. umbenannt in ein Design)
    const sameView = (opensInEditor(from) && opensInEditor(to)) || (opensInDatabases(from) && opensInDatabases(to))
    if (autosaves(from) || !sameView) await savePath(from)
    await project.value.rename(from, to)
    // Tab bleibt nur in derselben Ansicht offen
    if (!sameView && (tabs.value.includes(from) || dbTabs.value.includes(from))) forget(from)
    movePaths(p => (p === from ? to : p))
    await refresh()
    // Umbenannt in ein Design ⇒ im Kleiderschrank öffnen
    if (!sameView && fileKind(to) === 'design') await selectDesign(to)
    rememberSelection()
  }

  /** Pfade in allen Zuständen umschreiben (Umbenennen/Verschieben) */
  function movePaths(moved: (path: string) => string) {
    const map = (path: string | null) => (path ? moved(path) : path)
    buffers.value = Object.fromEntries(Object.entries(buffers.value).map(([path, buffer]) => [moved(path), buffer]))
    breakpointsByFile.value = Object.fromEntries(Object.entries(breakpointsByFile.value).map(([path, lines]) => [moved(path), lines]))
    tabs.value = tabs.value.map(moved)
    currentPath.value = map(currentPath.value)
    dbTabs.value = dbTabs.value.map(moved)
    dbPath.value = map(dbPath.value)
    designPath.value = map(designPath.value)
    worldPath.value = map(worldPath.value)
  }

  /** Projektsprache festlegen (neues Projekt) */
  async function setLanguage(value: ProgramLanguage | null) {
    if (!project.value) return
    language.value = value && projectLanguage(value)
    await project.value.write(MANIFEST, `${JSON.stringify({ language: language.value }, null, 2)}\n`)
  }

  /** Neuer Ordner (Pfad mit `/` für Unterordner) */
  async function createFolder(path: string) {
    if (!project.value) return
    if (!path.split('/').every(isValidName)) throw new Error('invalid_name')
    await project.value.createFolder(path)
    await refresh()
  }

  /** Ordner umbenennen/verschieben – geöffnete Datei, Projektwelt und Haltepunkte ziehen mit */
  async function renameFolder(from: string, to: string) {
    if (!project.value) return
    if (!to.split('/').every(isValidName)) throw new Error('invalid_name')
    await saveAutosaved()
    await project.value.renameFolder(from, to)
    movePaths(path => (path.startsWith(`${from}/`) ? `${to}${path.slice(from.length)}` : path))
    await refresh()
    rememberSelection()
  }

  async function removeFolder(path: string) {
    if (!project.value) return
    await project.value.removeFolder(path)
    const inside = (p: string | null) => !!p && p.startsWith(`${path}/`)
    for (const open of [...new Set([...Object.keys(buffers.value), ...tabs.value, ...dbTabs.value])].filter(inside)) forget(open)
    if (inside(worldPath.value)) worldPath.value = null
    await refresh()
    await selectFallback()
    rememberSelection()
  }

  async function remove(path: string) {
    if (!project.value) return
    await project.value.remove(path)
    forget(path)
    if (worldPath.value === path) worldPath.value = null
    await refresh()
    await selectFallback()
    rememberSelection()
  }

  /** Keine Datei mehr offen ⇒ erstes Programm öffnen */
  async function selectFallback() {
    const first = programFiles.value[0]
    if (!currentPath.value && first) await select(first.path)
  }

  /** Inhalt einer offenen Datei ändern – Designs speichern sich kurz danach selbst, alles andere bleibt ungespeichert */
  function updateFile(path: string, text: string) {
    const buffer = buffers.value[path]
    if (!project.value || !buffer) return
    buffer.text = text
    if (!autosaves(path) || text === buffer.saved || readOnly.value) return
    clearTimeout(saveTimers.get(path))
    saveTimers.set(path, setTimeout(() => void savePath(path), 400))
  }

  /** Aktive Datei der IDE, der Seite Datenbanken bzw. Design im Kleiderschrank ändern */
  const update = (text: string) => currentPath.value && updateFile(currentPath.value, text)
  const updateDb = (text: string) => dbPath.value && updateFile(dbPath.value, text)
  const updateDesign = (text: string) => designPath.value && updateFile(designPath.value, text)

  /** Eine offene Datei speichern (Strg+S); `false` bei Fehler */
  async function savePath(path: string) {
    clearTimeout(saveTimers.get(path))
    saveTimers.delete(path)
    const buffer = buffers.value[path]
    if (!project.value || !buffer || buffer.text === buffer.saved || readOnly.value) return true
    const text = buffer.text
    writing.value++
    try {
      await project.value.write(path, text)
      buffer.saved = text
      saveFailed.value = false
      return true
    }
    catch {
      saveFailed.value = true
      return false
    }
    finally {
      writing.value--
    }
  }

  /** Alle offenen Dateien speichern (vor dem Ausführen) */
  async function saveAll() {
    let ok = true
    for (const path of unsaved.value) ok = await savePath(path) && ok
    return ok
  }

  /** Nur ausstehende automatische Speicherungen (Designs) sofort ausführen */
  async function saveAutosaved() {
    for (const path of [...saveTimers.keys()]) await savePath(path)
  }

  /**
   * Vor dem Schließen von Dateien bzw. des Projekts: bei ungespeicherten Änderungen nachfragen
   * (Speichern / Nicht speichern / Abbrechen). `true` = weitermachen.
   */
  async function confirmUnsaved(paths?: string[]) {
    await saveAutosaved()
    const dirty = (paths ?? unsaved.value).filter(path => isDirty(path) && !readOnly.value)
    if (!dirty.length) return true
    unsavedDialog ??= createUnsavedDialog(overlay)
    const choice = await unsavedDialog.open({ files: dirty }).result
    if (choice === 'save') {
      for (const path of dirty) if (!await savePath(path)) return false
      return true
    }
    if (choice !== 'discard') return false
    // Verwerfen: Puffer auf den gespeicherten Stand zurücksetzen
    for (const path of dirty) buffers.value[path]!.text = buffers.value[path]!.saved
    return true
  }

  async function readWorld(): Promise<WorldData | null> {
    if (!project.value || !worldPath.value) return null
    return parseWorld(JSON.parse(await project.value.read(worldPath.value)))
  }

  async function writeWorld(path: string, data: WorldData) {
    if (!project.value) return
    await project.value.write(path, `${JSON.stringify(data, null, 2)}\n`)
    await refresh()
  }

  /**
   * Bibliotheken: Klonk-Script-Dateien (`importiere`), JS/TS- und Python-Module, Java-Klassen und C#-Dateien –
   * offene Dateien mit dem Stand im Editor (auch ungespeichert, für die Prüfung beim Tippen)
   */
  async function importableFiles(): Promise<Record<string, string>> {
    if (!project.value) return {}
    const result: Record<string, string> = {}
    for (const file of files.value.filter(f => !NOT_IMPORTABLE.has(f.kind))) result[file.path] = buffers.value[file.path]?.text ?? await project.value.read(file.path)
    return result
  }

  /** Eigene Designs des Projekts: Dateiname ohne Endung ⇒ Design (ungültige Dateien werden übersprungen) */
  async function readDesigns(): Promise<Record<string, RobotDesign>> {
    if (!project.value) return {}
    await saveAutosaved()
    const result: Record<string, RobotDesign> = {}
    for (const file of designFiles.value) {
      try {
        result[file.name.replace(/\.klonkdesign\.json$/i, '')] = parseDesign(JSON.parse(await project.value.read(file.path)))
      }
      catch {
        // kaputte Datei – im Design-Editor sichtbar
      }
    }
    return result
  }

  /** Design aus einem Programm speichern: vorhandene Datei gleichen Namens überschreiben, sonst neu im Projektordner */
  async function writeDesign(name: string, design: RobotDesign) {
    if (!project.value) return
    const existing = designFiles.value.find(f => f.name.replace(/\.klonkdesign\.json$/i, '').toLowerCase() === name.toLowerCase())
    const path = existing?.path ?? `${name}.klonkdesign.json`
    if (!isValidName(path.split('/').pop()!)) throw new Error('invalid_name')
    await project.value.write(path, `${JSON.stringify(design, null, 2)}\n`)
    // Offene Datei aktualisieren (Kleiderschrank)
    const text = `${JSON.stringify(design, null, 2)}\n`
    if (buffers.value[path]) buffers.value[path] = { text, saved: text }
    await refresh()
  }

  /** Datei schreiben, ohne sie zu öffnen (z. B. gesicherte Datenbank) – ist sie offen, den Inhalt mitziehen */
  async function writeFile(path: string, text: string) {
    if (!project.value) return
    await project.value.write(path, text)
    if (buffers.value[path]) buffers.value[path] = { text, saved: text }
  }

  function selectWorld(path: string | null) {
    worldPath.value = path
    rememberSelection()
  }

  function rememberSelection() {
    if (!project.value) return
    const p = project.value
    const remembered: Remembered = { file: currentPath.value, tabs: tabs.value, dbFile: dbPath.value, dbTabs: dbTabs.value, design: designPath.value, world: worldPath.value }
    safeStorage(() => localStorage.setItem(LAST_FILE_KEY(p), JSON.stringify(remembered)))
  }

  const breakpoints = computed({
    get: () => (currentPath.value ? breakpointsByFile.value[currentPath.value] ?? [] : []),
    set: (lines: number[]) => {
      if (currentPath.value) breakpointsByFile.value[currentPath.value] = lines
    },
  })

  return {
    project, files, folders, language, programFiles, designFiles, worldFiles, databaseFiles, sqlFiles, currentPath, tabs, content, kind, worldPath, status, unsaved, breakpoints, readOnly, sync,
    designPath, designContent, selectDesign, updateDesign,
    dbPath, dbTabs, dbKind, dbContent, updateDb,
    open, openCloud, close, select, closeTab, closeTabs, moveTab, create, rename, remove, setLanguage, createFolder, renameFolder, removeFolder, update, savePath, saveAll, confirmUnsaved, refresh, readWorld, writeWorld, importableFiles, readDesigns, writeDesign, writeFile, selectWorld,
    openBrowserProject: async (name: string, createIt = false) => {
      // Erst fragen, dann anlegen (sonst entstünde bei „Abbrechen“ trotzdem ein neues Projekt)
      if (!await confirmUnsaved()) return false
      return open(await openBrowserProject(name, createIt))
    },
  }
}

/** Im Browser gemerkte Auswahl je Projekt */
type Remembered = { file?: string | null, tabs?: string[], dbFile?: string | null, dbTabs?: string[], design?: string | null, world?: string | null }

async function readManifest(project: Project): Promise<ProgramLanguage | null> {
  try {
    const data = JSON.parse(await project.read(MANIFEST)) as { language?: unknown }
    return (PROGRAM_LANGUAGES as readonly string[]).includes(String(data.language)) ? projectLanguage(data.language as ProgramLanguage) : null
  }
  catch {
    return null
  }
}

function safeStorage<T>(fn: () => T): T | undefined {
  try {
    return fn()
  }
  catch {
    return undefined
  }
}
