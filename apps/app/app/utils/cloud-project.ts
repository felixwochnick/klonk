import { MANIFEST, Project } from '~/utils/project-fs'

/**
 * Klonk Cloud: Projekt auf dem Server mit lokaler Kopie im Browser (OPFS `klonk-cloud/<id>`).
 * Gelesen und geschrieben wird immer lokal (geht auch offline); Änderungen landen in einer Warteschlange und werden
 * hochgeladen, Änderungen anderer Geräte/Personen per Revision abgeholt. Ändern zwei gleichzeitig dieselbe Datei,
 * gewinnt der Server – die eigene Fassung bleibt als Konfliktkopie erhalten.
 */

type Pending = 'put' | 'delete' | 'folder' | 'delete-folder'
type SyncState = { revision: number, files: Map<string, number>, pending: Map<string, Pending> }
export type CloudSyncStatus = 'synced' | 'syncing' | 'offline' | 'error'

const STATE_FILE = '.klonk-sync.json'
const PULL_INTERVAL_MS = 15_000
const PUSH_DELAY_MS = 800

export type CloudProjectMeta = { id: string, name: string, kind: CloudProjectKind, writable: boolean }

export class CloudProject extends Project {
  /** Reaktiv: Status und Schreibrecht für die Oberfläche */
  readonly status = ref<CloudSyncStatus>('synced')
  readonly error = ref<string | null>(null)
  readonly writable: Ref<boolean>
  /** Wird nach abgeholten Änderungen aufgerufen (Dateiliste/offene Datei neu laden) */
  onRemoteChange?: (paths: string[]) => void
  onConflict?: (path: string, copy: string) => void
  /** Zusatz für Konfliktkopien, z. B. „Konflikt“ ⇒ `main (Konflikt).js` */
  conflictLabel = 'Konflikt'

  private state: SyncState = { revision: 0, files: new Map(), pending: new Map() }
  private running: Promise<void> = Promise.resolve()
  private pushTimer: ReturnType<typeof setTimeout> | undefined
  private pullTimer: ReturnType<typeof setInterval> | undefined
  private readonly wake = () => void this.sync()

  constructor(handle: FileSystemDirectoryHandle, readonly meta: CloudProjectMeta) {
    super(handle, 'cloud')
    this.writable = ref(meta.writable)
  }

  override get name() {
    return this.meta.name
  }

  get readOnly() {
    return !this.writable.value
  }

  // Schreibende Operationen: lokal ausführen und für den Upload vormerken
  override async write(path: string, content: string) {
    this.assertWritable()
    await super.write(path, content)
    this.mark(path, 'put')
  }

  override async remove(path: string) {
    this.assertWritable()
    await super.remove(path)
    this.mark(path, 'delete')
  }

  override async createFolder(path: string) {
    this.assertWritable()
    await super.createFolder(path)
    this.mark(path, 'folder')
  }

  override async removeFolder(path: string) {
    this.assertWritable()
    await super.removeFolder(path)
    for (const key of [...this.state.pending.keys()]) if (key.startsWith(`${path}/`)) this.state.pending.delete(key)
    this.mark(path, 'delete-folder')
  }

  private assertWritable() {
    if (this.readOnly) throw new Error('read_only')
  }

  private mark(path: string, op: Pending) {
    // Datei neu angelegt und gleich wieder gelöscht ⇒ nichts hochladen
    if (op === 'delete' && !this.state.files.get(path) && this.state.pending.get(path) === 'put') this.state.pending.delete(path)
    else this.state.pending.set(path, op)
    void this.saveState()
    clearTimeout(this.pushTimer)
    this.pushTimer = setTimeout(this.wake, PUSH_DELAY_MS)
  }

  /** Stand laden, einmal abgleichen und regelmäßig weiter (solange geöffnet) */
  async start() {
    try {
      const saved = JSON.parse(await super.read(STATE_FILE)) as { revision: number, files: Record<string, number>, pending: Record<string, Pending> }
      this.state = { revision: saved.revision, files: new Map(Object.entries(saved.files)), pending: new Map(Object.entries(saved.pending)) }
    }
    catch {
      // erste Öffnung auf diesem Gerät
    }
    await this.sync()
    this.pullTimer = setInterval(this.wake, PULL_INTERVAL_MS)
    window.addEventListener('online', this.wake)
    document.addEventListener('visibilitychange', this.wake)
  }

  stop() {
    clearTimeout(this.pushTimer)
    clearInterval(this.pullTimer)
    window.removeEventListener('online', this.wake)
    document.removeEventListener('visibilitychange', this.wake)
    // Ausstehendes noch versuchen
    void this.sync()
  }

  get pendingCount() {
    return this.state.pending.size
  }

  /** Hochladen, dann abholen – nie zwei Durchläufe gleichzeitig */
  sync() {
    if (document.visibilityState === 'hidden' && !this.pendingCount) return this.running
    this.running = this.running.then(() => this.run()).catch(() => {})
    return this.running
  }

  private async run() {
    this.status.value = 'syncing'
    try {
      await this.push()
      const changed = await this.pull()
      this.error.value = null
      this.status.value = this.pendingCount ? 'error' : 'synced'
      if (changed.length) this.onRemoteChange?.(changed)
    }
    catch (error) {
      const code = (error as { data?: { message?: string } }).data?.message
      this.error.value = code ?? null
      this.status.value = code ? 'error' : 'offline'
    }
    await this.saveState()
  }

  private api<T>(path: string, options: { method?: 'GET' | 'PUT', body?: object, query?: Record<string, number> } = {}) {
    return $fetch<T>(`/api/cloud/projects/${this.meta.id}${path}`, { ...options, headers: clientHostHeaders() } as object)
  }

  private async push() {
    for (const [path, op] of [...this.state.pending]) {
      const base = this.state.files.get(path) ?? 0
      let body: Record<string, unknown>
      if (op === 'put') {
        const content = await super.read(path).catch(() => null)
        // Inzwischen lokal gelöscht (z. B. Ordner) ⇒ als Löschen behandeln
        body = content === null ? { path, deleted: true, baseRevision: base } : { path, content, baseRevision: base }
        if (content === null && !base) {
          this.state.pending.delete(path)
          continue
        }
      }
      else if (op === 'delete') {
        if (!base) {
          this.state.pending.delete(path)
          continue
        }
        body = { path, deleted: true, baseRevision: base }
      }
      else body = { path, folder: true, deleted: op === 'delete-folder', baseRevision: 0 }

      type Result = { revision?: number, conflict?: CloudChange }
      const result: Result = await this.api<Result>('/files', { method: 'PUT', body })
        .catch((error: { statusCode?: number, data?: { conflict?: CloudChange } }) => {
          if (error.statusCode === 409 && error.data?.conflict) return { conflict: error.data.conflict }
          throw error
        })
      this.state.pending.delete(path)
      if (result.conflict) await this.resolve(path, op, result.conflict)
      else if (op === 'delete-folder') this.forgetFolder(path)
      else this.state.files.set(path, result.revision!)
    }
  }

  /** Konflikt: Stand des Servers übernehmen, eigene Fassung als Kopie behalten (und hochladen) */
  private async resolve(path: string, op: Pending, current: CloudChange) {
    this.state.files.set(path, current.revision)
    if (op === 'put') {
      if (current.deleted) {
        // Anderswo gelöscht, hier bearbeitet ⇒ eigene Fassung wiederherstellen
        this.state.pending.set(path, 'put')
        return
      }
      const mine = await super.read(path)
      if (mine === current.content) return
      const copy = await this.conflictName(path)
      await super.write(copy, mine)
      this.state.pending.set(copy, 'put')
      await super.write(path, current.content ?? '')
      this.onConflict?.(path, copy)
    }
    else if (op === 'delete' && !current.deleted) {
      // Hier gelöscht, anderswo geändert ⇒ Änderung behalten
      await super.write(path, current.content ?? '')
    }
  }

  private async conflictName(path: string) {
    const slash = path.lastIndexOf('/')
    const name = path.slice(slash + 1)
    const dot = name.indexOf('.') > 0 ? name.indexOf('.') : name.length
    const label = this.conflictLabel
    for (let i = 1; ; i++) {
      const candidate = `${path.slice(0, slash + 1)}${name.slice(0, dot)} (${label}${i > 1 ? ` ${i}` : ''})${name.slice(dot)}`
      if (!await this.exists(candidate)) return candidate
    }
  }

  private forgetFolder(path: string) {
    for (const key of [...this.state.files.keys()]) if (key === path || key.startsWith(`${path}/`)) this.state.files.delete(key)
  }

  /** Änderungen seit dem letzten Stand übernehmen (eigene, noch nicht hochgeladene Pfade bleiben unangetastet) */
  private async pull() {
    const changed: string[] = []
    for (;;) {
      const result = await this.api<CloudChanges>('/changes', { query: { since: this.state.revision } })
      this.writable.value = result.writable
      for (const change of result.changes) {
        if (this.state.pending.get(change.path)) continue
        try {
          if (change.deleted) {
            if (change.folder) {
              if (await this.folderExists(change.path)) await super.removeFolder(change.path)
            }
            else if (await this.exists(change.path)) await super.remove(change.path)
            this.state.files.delete(change.path)
          }
          else {
            if (change.folder) {
              if (!await this.folderExists(change.path)) await super.createFolder(change.path)
            }
            else await super.write(change.path, change.content ?? '')
            this.state.files.set(change.path, change.revision)
          }
          changed.push(change.path)
        }
        catch {
          // z. B. Ordner schon weg – beim nächsten Abgleich egal
        }
      }
      this.state.revision = result.revision
      if (!result.more) return changed
    }
  }

  private async saveState() {
    const { revision, files, pending } = this.state
    await super.write(STATE_FILE, JSON.stringify({ revision, files: Object.fromEntries(files), pending: Object.fromEntries(pending) })).catch(() => {})
  }
}

async function cacheRoot() {
  const root = await navigator.storage.getDirectory()
  return root.getDirectoryHandle('klonk-cloud', { create: true })
}

/** Cloud-Projekt öffnen: lokale Kopie anlegen bzw. weiterverwenden und abgleichen */
export async function openCloudProject(meta: CloudProjectMeta, setup?: (project: CloudProject) => void) {
  const handle = await (await cacheRoot()).getDirectoryHandle(meta.id, { create: true })
  const project = new CloudProject(handle, meta)
  setup?.(project)
  await project.start()
  return project
}

/** Lokale Kopie entfernen (z. B. nach dem Löschen in der Cloud) */
export async function forgetCloudCopy(id: string) {
  await (await cacheRoot()).removeEntry(id, { recursive: true }).catch(() => {})
}

/** Lokales Projekt (Ordner oder Browser-Projekt) mit allen Dateien und Ordnern in die Cloud hochladen */
export async function uploadToCloud(project: Project, name: string) {
  const { files, folders } = await project.scan()
  const contents = await Promise.all(files.map(async f => ({ path: f.path, content: await project.read(f.path) })))
  const manifest = await project.read(MANIFEST).catch(() => null)
  if (manifest !== null) contents.push({ path: MANIFEST, content: manifest })
  return $fetch<{ id: string, name: string }>('/api/cloud/projects', {
    method: 'POST',
    headers: clientHostHeaders(),
    body: { name, files: contents, folders },
  })
}
