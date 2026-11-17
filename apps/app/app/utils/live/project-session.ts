import * as Y from 'yjs'
import * as syncProtocol from 'y-protocols/sync'
import * as awarenessProtocol from 'y-protocols/awareness'
import * as encoding from 'lib0/encoding'
import * as decoding from 'lib0/decoding'
import { LiveSocket, type LiveStatus } from './socket'

/** Andere Person im gemeinsamen Projekt (Yjs-Client) */
export type LivePeer = LiveAwarenessState & { clientId: number }

/**
 * Gemeinsames Projekt einer Untergruppe im Browser: ein Yjs-Dokument mit allen live bearbeiteten Dateien
 * (`texts`: Y.Text je Pfad, `blocks`: Y.Map je Pfad mit den obersten Blöcken), Anwesenheit (wer, welche Datei, Cursor).
 */
export class LiveProjectSession {
  readonly doc = new Y.Doc()
  readonly awareness = new awarenessProtocol.Awareness(this.doc)
  status: LiveStatus = 'connecting'
  writable = false
  me: LiveAwarenessState['user'] | null = null

  onChange?: () => void
  /** Jemand hat eine Datei gespeichert bzw. Dateien geändert ⇒ Cloud gleich abgleichen */
  onRemoteSave?: (path: string) => void
  onRemoteFiles?: () => void

  private socket: LiveSocket
  /** Eigene Anwesenheit (auch vor der Begrüßung bzw. nach dem Wiederverbinden) */
  private presence: { path: string | null, selection: LiveAwarenessState['selection'] } = { path: null, selection: null }
  private waiting = new Map<string, (() => void)[]>()
  private opened = new Set<string>()

  constructor(readonly projectId: string) {
    this.awareness.setLocalState(null)
    this.doc.on('update', (update: Uint8Array, origin: unknown) => {
      if (origin === this) return
      const encoder = encoding.createEncoder()
      encoding.writeVarUint(encoder, LIVE_KIND.sync)
      syncProtocol.writeUpdate(encoder, update)
      this.socket.send(encoding.toUint8Array(encoder))
    })
    this.awareness.on('update', ({ added, updated, removed }: { added: number[], updated: number[], removed: number[] }, origin: unknown) => {
      if (origin === this) return
      const encoder = encoding.createEncoder()
      encoding.writeVarUint(encoder, LIVE_KIND.awareness)
      encoding.writeVarUint8Array(encoder, awarenessProtocol.encodeAwarenessUpdate(this.awareness, [...added, ...updated, ...removed]))
      this.socket.send(encoding.toUint8Array(encoder))
    })
    this.awareness.on('change', () => this.onChange?.())

    this.socket = new LiveSocket({ project: projectId }, {
      open: () => {
        const encoder = encoding.createEncoder()
        encoding.writeVarUint(encoder, LIVE_KIND.sync)
        syncProtocol.writeSyncStep1(encoder, this.doc)
        this.socket.send(encoding.toUint8Array(encoder))
        // Server kann neu gestartet sein ⇒ geöffnete Dateien erneut anmelden
        for (const path of this.opened) this.socket.sendJson({ t: 'open', path } satisfies LiveProjectClientMessage)
      },
      binary: data => this.receive(data),
      json: message => this.control(message as LiveProjectServerMessage),
      close: () => {
        // Cursor der anderen verschwinden, bis die Verbindung wieder steht
        const others = [...this.awareness.getStates().keys()].filter(id => id !== this.doc.clientID)
        awarenessProtocol.removeAwarenessStates(this.awareness, others, this)
      },
      status: (status) => {
        this.status = status
        this.onChange?.()
      },
    })
  }

  private receive(data: Uint8Array) {
    const decoder = decoding.createDecoder(data)
    const kind = decoding.readVarUint(decoder)
    if (kind === LIVE_KIND.sync) {
      const encoder = encoding.createEncoder()
      encoding.writeVarUint(encoder, LIVE_KIND.sync)
      syncProtocol.readSyncMessage(decoder, encoder, this.doc, this)
      if (encoding.length(encoder) > 1) this.socket.send(encoding.toUint8Array(encoder))
    }
    else if (kind === LIVE_KIND.awareness) {
      awarenessProtocol.applyAwarenessUpdate(this.awareness, decoding.readVarUint8Array(decoder), this)
    }
  }

  private control(message: LiveProjectServerMessage) {
    if (message.t === 'welcome') {
      this.me = { id: message.userId, name: message.name, color: message.color }
      this.writable = message.writable
      this.setPresence(this.presence.path, this.presence.selection)
      this.onChange?.()
    }
    else if (message.t === 'opened') {
      const resolvers = this.waiting.get(message.path) ?? []
      this.waiting.delete(message.path)
      for (const resolve of resolvers) resolve()
    }
    else if (message.t === 'saved') this.onRemoteSave?.(message.path)
    else if (message.t === 'files') this.onRemoteFiles?.()
  }

  get online() {
    return this.socket.open
  }

  /**
   * Datei gemeinsam bearbeiten: der Server holt sie (einmal) aus der Cloud ins Dokument. `content` = eigener Stand,
   * falls die Datei dort noch fehlt (gerade erst angelegt). Ohne Verbindung (offline) bleibt es beim eigenen Puffer.
   */
  open(path: string, content: string) {
    this.opened.add(path)
    if (this.has(path)) return Promise.resolve(true)
    if (!this.socket.open) return Promise.resolve(false)
    return new Promise<boolean>((resolve) => {
      const timer = setTimeout(() => resolve(this.has(path)), 10_000)
      this.waiting.set(path, [...(this.waiting.get(path) ?? []), () => {
        clearTimeout(timer)
        resolve(this.has(path))
      }])
      this.socket.sendJson({ t: 'open', path, content } satisfies LiveProjectClientMessage)
    })
  }

  has(path: string) {
    const kind = liveFileKind(path)
    return kind === 'text' ? this.texts.has(path) : kind === 'blocks' ? this.blocks.has(path) : false
  }

  get texts() {
    return this.doc.getMap<Y.Text>('texts')
  }

  get blocks() {
    return this.doc.getMap<Y.Map<string>>('blocks')
  }

  /** Eigene Datei/Cursor für die anderen */
  setPresence(path: string | null, selection?: LiveAwarenessState['selection']) {
    this.presence = { path, selection: selection ?? null }
    if (!this.me) return
    this.awareness.setLocalState({ user: this.me, path, selection: selection ?? null } satisfies LiveAwarenessState)
  }

  /** Andere Personen (eine Person mit zwei Tabs erscheint einmal) */
  peers(): LivePeer[] {
    const seen = new Set<string>()
    const peers: LivePeer[] = []
    for (const [clientId, state] of this.awareness.getStates()) {
      const user = (state as Partial<LiveAwarenessState>).user
      if (clientId === this.doc.clientID || !user || user.id === this.me?.id || seen.has(user.id)) continue
      seen.add(user.id)
      peers.push({ ...(state as LiveAwarenessState), clientId })
    }
    return peers.sort((a, b) => a.user.name.localeCompare(b.user.name))
  }

  saved(path: string) {
    this.socket.sendJson({ t: 'saved', path } satisfies LiveProjectClientMessage)
  }

  filesChanged(removed: string[] = []) {
    for (const path of removed) {
      for (const open of [...this.opened]) if (open === path || open.startsWith(`${path}/`)) this.opened.delete(open)
    }
    this.socket.sendJson({ t: 'files', removed } satisfies LiveProjectClientMessage)
  }

  close() {
    this.awareness.setLocalState(null)
    this.socket.close()
    this.awareness.destroy()
    this.doc.destroy()
  }
}
