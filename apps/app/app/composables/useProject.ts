import { parseDesign, parseWorld, type RobotDesign, type WorldData } from '@klonk/world'
import { KIND_EXTENSION, MANIFEST, fileKind, isValidName, openBrowserProject, rememberProject } from '~/utils/project-fs'
import type { FileKind, Project, ProjectFile } from '~/utils/project-fs'

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

const LAST_FILE_KEY = (p: Project) => `klonk:project:${p.source}:${p.name}`

/**
 * Geöffnetes Projekt (Ordner oder Browser-Projekt) für IDE und Welt-Editor:
 * Dateiliste, aktuelle Datei mit automatischem Speichern, ausgewählte Welt.
 */
export function useProject() {
  const kind = computed<FileKind | null>(() => (currentPath.value ? fileKind(currentPath.value) : null))
  const programFiles = computed(() => files.value.filter(f => f.kind !== 'world' && f.kind !== 'design' && f.kind !== 'other'))
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
    project.value = next
    currentPath.value = null
    content.value = ''
    breakpointsByFile.value = {}
    language.value = await readManifest(next)
    await refresh()
    void rememberProject(next).catch(() => {})

    const last = safeStorage(() => JSON.parse(localStorage.getItem(LAST_FILE_KEY(next)) ?? 'null'))
    const first = programFiles.value[0]?.path ?? null
    const target = last?.file && files.value.some(f => f.path === last.file) ? last.file : first
    worldPath.value = last?.world && files.value.some(f => f.path === last.world) ? last.world : worldFiles.value[0]?.path ?? null
    if (target) await select(target)
  }

  async function close() {
    await flush()
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
  async function create(baseName: string, fileKind: Exclude<FileKind, 'other'>, initial = '') {
    if (!project.value) return null
    const name = baseName.trim()
    const path = name.toLowerCase().endsWith(KIND_EXTENSION[fileKind]) ? name : `${name}${KIND_EXTENSION[fileKind]}`
    if (!path.split('/').every(isValidName)) throw new Error('invalid_name')
    if (await project.value.exists(path)) throw new Error('exists')
    await project.value.write(path, initial)
    await refresh()
    if (fileKind === 'world') {
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
    if (!project.value || !currentPath.value || text === loadedContent) return
    status.value = 'saving'
    clearTimeout(saveTimer)
    saveTimer = setTimeout(() => void flush(), 400)
  }

  async function flush() {
    clearTimeout(saveTimer)
    if (!project.value || !currentPath.value || content.value === loadedContent) {
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
    for (const file of files.value.filter(f => f.kind !== 'world' && f.kind !== 'design' && f.kind !== 'other' && f.kind !== 'blocks')) result[file.path] = await project.value.read(file.path)
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
    project, files, folders, language, programFiles, designFiles, worldFiles, currentPath, content, kind, worldPath, status, breakpoints,
    open, close, select, create, rename, remove, setLanguage, createFolder, renameFolder, removeFolder, update, flush, refresh, readWorld, writeWorld, importableFiles, readDesigns, selectWorld,
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
