/**
 * Projekte auf dem Dateisystem: ein Ordner mit Programmen und Welten.
 * Gleiche Schnittstelle für echte Ordner (File System Access API, Chrome/Edge) und
 * Browser-Projekte (Origin Private File System, alle modernen Browser).
 */

export type FileKind = 'blocks' | 'klonk' | 'javascript' | 'typescript' | 'python' | 'java' | 'csharp' | 'world' | 'other'

export type ProjectFile = {
  /** Pfad relativ zum Projektordner, mit `/` getrennt */
  path: string
  name: string
  kind: FileKind
}

export type ProjectSource = 'folder' | 'browser'

/** Dateiendung ⇒ Art (Welten zuerst, weil sie auf `.json` enden) */
export function fileKind(name: string): FileKind {
  const lower = name.toLowerCase()
  if (lower.endsWith('.klonkworld.json')) return 'world'
  if (lower.endsWith('.blocks')) return 'blocks'
  if (lower.endsWith('.klonk')) return 'klonk'
  if (lower.endsWith('.ts')) return 'typescript'
  if (lower.endsWith('.js')) return 'javascript'
  if (lower.endsWith('.py')) return 'python'
  if (lower.endsWith('.java')) return 'java'
  if (lower.endsWith('.cs')) return 'csharp'
  return 'other'
}

export const KIND_EXTENSION: Record<Exclude<FileKind, 'other'>, string> = {
  blocks: '.blocks',
  klonk: '.klonk',
  javascript: '.js',
  typescript: '.ts',
  python: '.py',
  java: '.java',
  csharp: '.cs',
  world: '.klonkworld.json',
}

/** Erlaubte Datei- und Ordnernamen (keine Pfadtricks) */
export function isValidName(name: string) {
  return !!name && name.length <= 120 && !/[/\\:*?"<>|]/.test(name) && name !== '.' && name !== '..' && !name.startsWith('.')
}

const IGNORED = new Set(['node_modules', '.git', '.DS_Store'])
const MAX_FILES = 500

export class Project {
  constructor(
    readonly handle: FileSystemDirectoryHandle,
    readonly source: ProjectSource,
  ) {}

  get name() {
    return this.handle.name
  }

  /** Alle Dateien (rekursiv, sortiert); versteckte und große Ordner werden übersprungen */
  async list(): Promise<ProjectFile[]> {
    const files: ProjectFile[] = []
    const walk = async (dir: FileSystemDirectoryHandle, prefix: string) => {
      for await (const [name, entry] of dir as unknown as AsyncIterable<[string, FileSystemHandle]>) {
        if (files.length >= MAX_FILES || name.startsWith('.') || IGNORED.has(name)) continue
        const path = prefix ? `${prefix}/${name}` : name
        if (entry.kind === 'directory') await walk(entry as FileSystemDirectoryHandle, path)
        else files.push({ path, name, kind: fileKind(name) })
      }
    }
    await walk(this.handle, '')
    return files.sort((a, b) => a.path.localeCompare(b.path, undefined, { numeric: true }))
  }

  async read(path: string): Promise<string> {
    const file = await (await this.fileHandle(path)).getFile()
    return file.text()
  }

  async write(path: string, content: string) {
    const handle = await this.fileHandle(path, true)
    const writable = await handle.createWritable()
    await writable.write(content)
    await writable.close()
  }

  async exists(path: string) {
    try {
      await this.fileHandle(path)
      return true
    }
    catch {
      return false
    }
  }

  async remove(path: string) {
    const { dir, name } = await this.parent(path)
    await dir.removeEntry(name)
  }

  /** Umbenennen = kopieren + löschen (funktioniert überall, auch ohne `move()`) */
  async rename(from: string, to: string) {
    if (await this.exists(to)) throw new Error('exists')
    await this.write(to, await this.read(from))
    await this.remove(from)
  }

  private async parent(path: string, create = false) {
    const parts = path.split('/').filter(Boolean)
    if (!parts.length || parts.some(p => !isValidName(p))) throw new Error('invalid_path')
    let dir = this.handle
    for (const part of parts.slice(0, -1)) dir = await dir.getDirectoryHandle(part, { create })
    return { dir, name: parts.at(-1)! }
  }

  private async fileHandle(path: string, create = false) {
    const { dir, name } = await this.parent(path, create)
    return dir.getFileHandle(name, { create })
  }
}

// -----------------------------------------------------------------------------
// Ordner auswählen, Browser-Projekte, zuletzt geöffnete Projekte

export const supportsFolders = () => import.meta.client && 'showDirectoryPicker' in window
export const supportsBrowserProjects = () => import.meta.client && !!navigator.storage?.getDirectory

export async function pickFolder(): Promise<Project | null> {
  try {
    const handle = await (window as unknown as { showDirectoryPicker: (o: object) => Promise<FileSystemDirectoryHandle> })
      .showDirectoryPicker({ id: 'klonk-project', mode: 'readwrite' })
    return new Project(handle, 'folder')
  }
  catch {
    // abgebrochen
    return null
  }
}

async function browserRoot() {
  const root = await navigator.storage.getDirectory()
  return root.getDirectoryHandle('klonk-projects', { create: true })
}

export async function listBrowserProjects(): Promise<string[]> {
  const names: string[] = []
  for await (const [name, entry] of (await browserRoot()) as unknown as AsyncIterable<[string, FileSystemHandle]>) {
    if (entry.kind === 'directory') names.push(name)
  }
  return names.sort((a, b) => a.localeCompare(b))
}

export async function openBrowserProject(name: string, create = false) {
  if (!isValidName(name)) throw new Error('invalid_name')
  const handle = await (await browserRoot()).getDirectoryHandle(name, { create })
  return new Project(handle, 'browser')
}

export async function deleteBrowserProject(name: string) {
  await (await browserRoot()).removeEntry(name, { recursive: true })
}

/** Lese-/Schreibrecht für einen gemerkten Ordner (erneut) anfragen */
export async function ensurePermission(handle: FileSystemDirectoryHandle) {
  const h = handle as FileSystemDirectoryHandle & {
    queryPermission?: (o: object) => Promise<PermissionState>
    requestPermission?: (o: object) => Promise<PermissionState>
  }
  if (!h.queryPermission) return true
  if (await h.queryPermission({ mode: 'readwrite' }) === 'granted') return true
  return (await h.requestPermission?.({ mode: 'readwrite' })) === 'granted'
}

// Zuletzt geöffnete Ordner (Handles lassen sich nur in IndexedDB speichern)
const DB = 'klonk'
const STORE = 'recent-projects'

function db(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB, 1)
    request.onupgradeneeded = () => request.result.createObjectStore(STORE)
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

export type RecentProject = { name: string, source: ProjectSource, handle: FileSystemDirectoryHandle, openedAt: number }

export async function rememberProject(project: Project) {
  const database = await db()
  const key = `${project.source}:${project.name}`
  await new Promise<void>((resolve, reject) => {
    const tx = database.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).put({ name: project.name, source: project.source, handle: project.handle, openedAt: Date.now() } satisfies RecentProject, key)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

export async function recentProjects(): Promise<RecentProject[]> {
  try {
    const database = await db()
    const items = await new Promise<RecentProject[]>((resolve, reject) => {
      const request = database.transaction(STORE).objectStore(STORE).getAll()
      request.onsuccess = () => resolve(request.result as RecentProject[])
      request.onerror = () => reject(request.error)
    })
    return items.sort((a, b) => b.openedAt - a.openedAt).slice(0, 8)
  }
  catch {
    return []
  }
}

export async function forgetProject(source: ProjectSource, name: string) {
  const database = await db()
  database.transaction(STORE, 'readwrite').objectStore(STORE).delete(`${source}:${name}`)
}
