import { parseDesign, parseWorld, type RobotDesign, type WorldData } from '@klonk/world'
import { KIND_EXTENSION, MANIFEST, fileKind, isValidName, openBrowserProject, rememberProject } from '~/utils/project-fs'
import type { FileKind, Project, ProjectFile } from '~/utils/project-fs'
import { CloudProject, openCloudProject, type CloudProjectMeta } from '~/utils/cloud-project'

// Zustand außerhalb von Komponenten: Datei-Handles sind nicht serialisierbar (kein useState)
const project = shallowRef<Project | null>(null)
const files = ref<ProjectFile[]>([])
const folders = ref<string[]>([])
/** Sprache des Projekts aus klonk.json (`null` = gemischt, z. B. ältere Projekte oder fremde Ordner) */
const language = ref<ProgramLanguage | null>(null)
const currentPath = ref<string | null>(null)
const content = ref('')
const worldPath = ref<string | null>(null)
const status = ref<'saved' | 'saving' | 'error'>('saved')
const breakpointsByFile = ref<Record<string, number[]>>({})
let saveTimer: ReturnType<typeof setTimeout> | undefined
let loadedContent = ''

/** Dateien, die keine importierbaren Programme sind */
const NOT_IMPORTABLE = new Set<FileKind>(['world', 'design', 'other', 'blocks', 'database', 'sql'])

const LAST_FILE_KEY = (p: Project) => `klonk:project:${p.source}:${p instanceof CloudProject ? p.meta.id : p.name}`

/**
 * Geöffnetes Projekt (Ordner oder Browser-Projekt) für IDE und Welt-Editor:
 * Dateiliste, aktuelle Datei mit automatischem Speichern, ausgewählte Welt.
 */
export function useProject() {
  const { t } = useI18n()
  const toast = useToast()
  const kind = computed<FileKind | null>(() => (currentPath.value ? fileKind(currentPath.value) : null))
  const programFiles = computed(() => files.value.filter(f => f.kind !== 'world' && f.kind !== 'design' && f.kind !== 'other' && f.kind !== 'database'))
  const databaseFiles = computed(() => files.value.filter(f => f.kind === 'database'))
  const designFiles = computed(() => files.value.filter(f => f.kind === 'design'))
  const worldFiles = computed(() => files.value.filter(f => f.kind === 'world'))

  async function refresh() {
    if (!project.value) return
    const scanned = await project.value.scan()
    files.value = scanned.files
    folders.value = scanned.folders
  }

  async function open(next: Project) {
    await flush()
    if (project.value instanceof CloudProject && project.value !== next) project.value.stop()
    project.value = next
    currentPath.value = null
    content.value = ''
    breakpointsByFile.value = {}
    language.value = await readManifest(next)
    await refresh()
    if (!(next instanceof CloudProject)) void rememberProject(next).catch(() => {})

    const last = safeStorage(() => JSON.parse(localStorage.getItem(LAST_FILE_KEY(next)) ?? 'null'))
    const first = programFiles.value[0]?.path ?? null
    const target = last?.file && files.value.some(f => f.path === last.file) ? last.file : first
    worldPath.value = last?.world && files.value.some(f => f.path === last.world) ? last.world : worldFiles.value[0]?.path ?? null
    if (target) await select(target)
  }

  /** Cloud-Projekt öffnen (lokale Kopie + Abgleich); Änderungen anderer laden die Dateiliste/offene Datei neu */
  async function openCloud(meta: CloudProjectMeta) {
    const next = await openCloudProject(meta, (cloud) => {
      cloud.conflictLabel = t('cloud.conflictSuffix')
      cloud.onConflict = (path, copy) => toast.add({ title: t('cloud.conflict', { path, copy }), color: 'warning' })
      cloud.onRemoteChange = paths => void remoteChanged(cloud, paths)
    })
    await open(next)
  }

  async function remoteChanged(cloud: CloudProject, paths: string[]) {
    if (project.value !== cloud) return
    await refresh()
    if (paths.includes(MANIFEST)) language.value = await readManifest(cloud)
    // Offene Datei nur neu laden, wenn hier nichts Ungespeichertes ist
    if (currentPath.value && paths.includes(currentPath.value) && content.value === loadedContent) {
      if (!files.value.some(f => f.path === currentPath.value)) {
        currentPath.value = null
        content.value = ''
        return
      }
      loadedContent = await cloud.read(currentPath.value)
      content.value = loadedContent
    }
  }

  /** Nur lesen: gemeinsamer Ordner ohne Schreibrecht, Abgaben anderer */
  const readOnly = computed(() => project.value instanceof CloudProject && !project.value.writable.value)
  const sync = computed(() => (project.value instanceof CloudProject ? project.value.status.value : null))

  async function close() {
    await flush()
    if (project.value instanceof CloudProject) project.value.stop()
    project.value = null
    files.value = []
    folders.value = []
    language.value = null
    currentPath.value = null
    content.value = ''
    worldPath.value = null
  }

  async function select(path: string) {
    if (!project.value || path === currentPath.value) return
    await flush()
    const text = await project.value.read(path)
    currentPath.value = path
    loadedContent = text
    content.value = text
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
    else await select(path)
    return path
  }

  async function rename(from: string, to: string) {
    if (!project.value) return
    if (!to.split('/').every(isValidName)) throw new Error('invalid_name')
    if (from === currentPath.value) await flush()
    await project.value.rename(from, to)
    if (currentPath.value === from) currentPath.value = to
    if (worldPath.value === from) worldPath.value = to
    breakpointsByFile.value[to] = breakpointsByFile.value[from] ?? []
    await refresh()
    rememberSelection()
  }

  /** Projektsprache festlegen (neues Projekt) */
  async function setLanguage(value: ProgramLanguage | null) {
    if (!project.value) return
    language.value = value
    await project.value.write(MANIFEST, `${JSON.stringify({ language: value }, null, 2)}\n`)
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
    await flush()
    await project.value.renameFolder(from, to)
    const moved = (path: string | null) => (path && path.startsWith(`${from}/`) ? `${to}${path.slice(from.length)}` : path)
    currentPath.value = moved(currentPath.value)
    worldPath.value = moved(worldPath.value)
    breakpointsByFile.value = Object.fromEntries(Object.entries(breakpointsByFile.value).map(([path, lines]) => [moved(path)!, lines]))
    await refresh()
    rememberSelection()
  }

  async function removeFolder(path: string) {
    if (!project.value) return
    await project.value.removeFolder(path)
    const inside = (p: string | null) => !!p && p.startsWith(`${path}/`)
    if (inside(currentPath.value)) {
      currentPath.value = null
      content.value = ''
    }
    if (inside(worldPath.value)) worldPath.value = null
    await refresh()
    if (!currentPath.value && programFiles.value[0]) await select(programFiles.value[0].path)
    rememberSelection()
  }

  async function remove(path: string) {
    if (!project.value) return
    await project.value.remove(path)
    if (currentPath.value === path) {
      currentPath.value = null
      content.value = ''
    }
    if (worldPath.value === path) worldPath.value = null
    await refresh()
    if (!currentPath.value && programFiles.value[0]) await select(programFiles.value[0].path)
    rememberSelection()
  }

  /** Aktuellen Inhalt ändern – wird kurz danach automatisch gespeichert */
  function update(text: string) {
    content.value = text
    if (!project.value || !currentPath.value || text === loadedContent || readOnly.value) return
    status.value = 'saving'
    clearTimeout(saveTimer)
    saveTimer = setTimeout(() => void flush(), 400)
  }

  async function flush() {
    clearTimeout(saveTimer)
    if (!project.value || !currentPath.value || content.value === loadedContent || readOnly.value) {
      status.value = 'saved'
      return
    }
    try {
      await project.value.write(currentPath.value, content.value)
      loadedContent = content.value
      status.value = 'saved'
    }
    catch {
      status.value = 'error'
    }
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

  /** Bibliotheken: Klonk-Script-Dateien (`importiere`), JS/TS- und Python-Module, Java-Klassen und C#-Dateien */
  async function importableFiles(): Promise<Record<string, string>> {
    if (!project.value) return {}
    await flush()
    const result: Record<string, string> = {}
    for (const file of files.value.filter(f => !NOT_IMPORTABLE.has(f.kind))) result[file.path] = await project.value.read(file.path)
    return result
  }

  /** Eigene Designs des Projekts: Dateiname ohne Endung ⇒ Design (ungültige Dateien werden übersprungen) */
  async function readDesigns(): Promise<Record<string, RobotDesign>> {
    if (!project.value) return {}
    await flush()
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
    // Offene Datei aktualisieren (Design-Editor)
    if (currentPath.value === path) {
      loadedContent = `${JSON.stringify(design, null, 2)}\n`
      content.value = loadedContent
    }
    await refresh()
  }

  /** Datei schreiben, ohne sie zu öffnen (z. B. gesicherte Datenbank) – ist sie offen, den Inhalt mitziehen */
  async function writeFile(path: string, text: string) {
    if (!project.value) return
    await project.value.write(path, text)
    if (currentPath.value === path) {
      loadedContent = text
      content.value = text
    }
  }

  function selectWorld(path: string | null) {
    worldPath.value = path
    rememberSelection()
  }

  function rememberSelection() {
    if (!project.value) return
    const p = project.value
    safeStorage(() => localStorage.setItem(LAST_FILE_KEY(p), JSON.stringify({ file: currentPath.value, world: worldPath.value })))
  }

  const breakpoints = computed({
    get: () => (currentPath.value ? breakpointsByFile.value[currentPath.value] ?? [] : []),
    set: (lines: number[]) => {
      if (currentPath.value) breakpointsByFile.value[currentPath.value] = lines
    },
  })

  return {
    project, files, folders, language, programFiles, designFiles, worldFiles, databaseFiles, currentPath, content, kind, worldPath, status, breakpoints, readOnly, sync,
    open, openCloud, close, select, create, rename, remove, setLanguage, createFolder, renameFolder, removeFolder, update, flush, refresh, readWorld, writeWorld, importableFiles, readDesigns, writeDesign, writeFile, selectWorld,
    openBrowserProject: async (name: string, createIt = false) => open(await openBrowserProject(name, createIt)),
  }
}

async function readManifest(project: Project): Promise<ProgramLanguage | null> {
  try {
    const data = JSON.parse(await project.read(MANIFEST)) as { language?: unknown }
    return (PROGRAM_LANGUAGES as readonly string[]).includes(String(data.language)) ? data.language as ProgramLanguage : null
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
