import type { H3Event } from 'h3'
import { and, asc, eq, like, sql } from 'drizzle-orm'
import * as Y from 'yjs'
import * as syncProtocol from 'y-protocols/sync'
import * as awarenessProtocol from 'y-protocols/awareness'
import * as encoding from 'lib0/encoding'
import * as decoding from 'lib0/decoding'
import { WorldRoom, defaultStartWorld, liveColor } from '@klonk/runtime/live'
import { parseWorld, type WorldData } from '@klonk/world'

/**
 * Zusammenarbeit in Untergruppen (WebSocket `/_live`): je Raum ein Objekt im Speicher dieses Servers.
 *  - `project:<id>`: gemeinsames Projekt – Yjs-Dokument mit den geöffneten Dateien, Anwesenheit (Cursor) der anderen.
 *    Gespeichert wird wie sonst über die Cloud (Strg+S / Ausführen); der Raum hält nur den gemeinsamen Bearbeitungsstand.
 *  - `world:<id>`: gemeinsame Welt einer Untergruppe (WorldRoom aus @klonk/runtime/live).
 * Räume ohne Verbindung bleiben eine Weile bestehen (Neuladen der Seite, kurze Funkstille).
 */

const { cloudFiles, cloudProjects, groups } = schema
const ROOM_GRACE_MS = 10 * 60 * 1000

/** Angemeldete Person einer Verbindung, wie sie `upgrade` ermittelt */
export type LivePeerContext = {
  user: SessionUser
  room: string
  /** Gemeinsames Projekt: darf schreiben (sonst nur zusehen) */
  writable: boolean
  /** Gemeinsame Welt: ohne eigene Figur (Lehrkraft) */
  spectator: boolean
  maxCharacters: number
}

export type LiveSocket = { id: string, send: (data: Uint8Array) => void }

/** Minimales H3-Ereignis aus den Kopfzeilen der Upgrade-Anfrage (Lizenz: lokaler Testmodus braucht die Hostnamen) */
function headerEvent(request: { headers: Headers, url: string }) {
  const headers: Record<string, string> = Object.fromEntries(request.headers.entries())
  // Browser können bei WebSockets keine eigenen Kopfzeilen setzen ⇒ Hostname der Seite kommt als Parameter
  const client = new URL(request.url, 'http://localhost').searchParams.get('host')
  if (client) headers['x-klonk-host'] = client
  return { node: { req: { headers } }, context: {} } as unknown as H3Event
}

/** Upgrade prüfen: Session (wie die Middleware), Zugriff auf den Raum. Wirft eine Response bei Ablehnung. */
export async function authorizeLive(request: { headers: Headers, url: string }): Promise<LivePeerContext> {
  const deny = (status: number, message: string) => new Response(message, { status })
  const session = await getUserSession(request as never) as { user?: SessionUser, sessionId?: string }
  if (!session.user || !session.sessionId || !(await isSessionValid(session.sessionId, session.user.id))) throw deny(401, 'unauthorized')
  const user = await loadSessionUser(session.user.id)
  if (!user || user.mustChangePassword) throw deny(403, 'forbidden')

  const params = new URL(request.url, 'http://localhost').searchParams
  const projectId = params.get('project')
  const worldId = params.get('world')
  const uuid = /^[0-9a-f-]{36}$/i
  const event = headerEvent(request)

  if (projectId && uuid.test(projectId)) {
    const [row] = await withUserDb(user.id, tx => tx.execute<{ group_id: string | null, readable: boolean, writable: boolean }>(sql`
      select group_id, klonk.can_read_cloud_project(id) as readable, klonk.can_write_cloud_project(id) as writable
      from cloud_projects where id = ${projectId}`))
    // Live nur in gemeinsamen Ordnern von Gruppen (Untergruppen mit gemeinsamem Projekt, Klassenordner)
    if (!row?.readable || !row.group_id) throw deny(404, 'not_found')
    const writable = row.writable && await cloudEnabled(user, event)
    return { user, room: `project:${projectId}`, writable, spectator: !writable, maxCharacters: 0 }
  }
  if (worldId && uuid.test(worldId)) {
    const [row] = await withUserDb(user.id, tx => tx.select({
      mode: groups.collabMode,
      role: sql<string | null>`klonk.group_role(${groups.id})`,
      manage: sql<boolean>`klonk.can_manage_group(${groups.id})`,
    }).from(groups).where(eq(groups.id, worldId)))
    if (!row || row.mode !== 'world' || (!row.role && !row.manage)) throw deny(404, 'not_found')
    const license = await getEffectiveLicense(user.organizationId, event, user.id)
    return { user, room: `world:${worldId}`, writable: true, spectator: !row.role, maxCharacters: hasFeature(license, 'characters') ? 32 : 1 }
  }
  throw deny(400, 'invalid_room')
}

// ---------------------------------------------------------------------------------------------------------------------
// Räume

interface Room {
  join(socket: LiveSocket, context: LivePeerContext): Promise<void> | void
  message(socket: LiveSocket, context: LivePeerContext, data: Uint8Array): Promise<void> | void
  leave(socket: LiveSocket): void
  readonly empty: boolean
}

const rooms = new Map<string, { room: Room, timer?: ReturnType<typeof setTimeout> }>()

function roomFor(context: LivePeerContext) {
  let entry = rooms.get(context.room)
  if (!entry) {
    const [kind, id] = context.room.split(':') as ['project' | 'world', string]
    entry = { room: kind === 'project' ? new ProjectRoom(id) : new SharedWorldRoom(id) }
    rooms.set(context.room, entry)
  }
  clearTimeout(entry.timer)
  return entry.room
}

export async function liveOpen(socket: LiveSocket, context: LivePeerContext) {
  await roomFor(context).join(socket, context)
}

export async function liveMessage(socket: LiveSocket, context: LivePeerContext, data: Uint8Array) {
  await rooms.get(context.room)?.room.message(socket, context, data)
}

export function liveClose(socket: LiveSocket, context: LivePeerContext) {
  const entry = rooms.get(context.room)
  if (!entry) return
  entry.room.leave(socket)
  if (entry.room.empty) {
    clearTimeout(entry.timer)
    entry.timer = setTimeout(() => {
      if (rooms.get(context.room) === entry && entry.room.empty) rooms.delete(context.room)
    }, ROOM_GRACE_MS)
  }
}

const json = (message: unknown) => {
  const body = new TextEncoder().encode(JSON.stringify(message))
  const data = new Uint8Array(body.length + 1)
  data[0] = LIVE_KIND.json
  data.set(body, 1)
  return data
}
const parseJson = (data: Uint8Array) => {
  try {
    return JSON.parse(new TextDecoder().decode(data.subarray(1))) as Record<string, unknown>
  }
  catch {
    return null
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// Gemeinsame Welt

/** Startwelt der Untergruppe: erste Weltdatei in ihrem gemeinsamen Ordner, sonst die Vorgabe */
async function loadStartWorld(userId: string, groupId: string): Promise<WorldData> {
  const rows = await withUserDb(userId, tx => tx.select({ path: cloudFiles.path, content: cloudFiles.content })
    .from(cloudFiles).innerJoin(cloudProjects, eq(cloudProjects.id, cloudFiles.projectId))
    .where(and(eq(cloudProjects.groupId, groupId), eq(cloudFiles.deleted, false), like(cloudFiles.path, '%.klonkworld.json')))
    .orderBy(sql`array_length(string_to_array(${cloudFiles.path}, '/'), 1)`, asc(cloudFiles.path)))
  for (const row of rows) {
    try {
      return parseWorld(JSON.parse(row.content ?? ''))
    }
    catch {
      // ungültige Datei ⇒ nächste
    }
  }
  return defaultStartWorld()
}

class SharedWorldRoom implements Room {
  private room?: WorldRoom
  private loading?: Promise<WorldRoom>
  private sockets = new Map<string, LiveSocket>()
  /** Verbindungen, die schon weg waren, bevor die Startwelt geladen war */
  private gone = new Set<string>()

  constructor(private groupId: string) {}

  get empty() {
    return this.sockets.size === 0
  }

  private async ready(userId: string) {
    this.loading ??= loadStartWorld(userId, this.groupId).then(start => (this.room = new WorldRoom(start)))
    return this.loading
  }

  async join(socket: LiveSocket, context: LivePeerContext) {
    const room = await this.ready(context.user.id)
    if (this.gone.delete(socket.id)) return
    this.sockets.set(socket.id, socket)
    room.join({
      id: socket.id,
      userId: context.user.id,
      name: context.user.displayName,
      spectator: context.spectator,
      maxCharacters: context.maxCharacters,
      send: message => socket.send(json(message)),
    })
  }

  async message(socket: LiveSocket, context: LivePeerContext, data: Uint8Array) {
    if (data[0] !== LIVE_KIND.json || !this.room) return
    const message = parseJson(data)
    if (!message) return
    // Zurücksetzen lädt die Startwelt neu (die Leitung kann sie inzwischen geändert haben)
    if (message.t === 'reset') return this.room.reset(socket.id, await loadStartWorld(context.user.id, this.groupId))
    this.room.message(socket.id, message)
  }

  leave(socket: LiveSocket) {
    if (!this.sockets.delete(socket.id)) this.gone.add(socket.id)
    this.room?.leave(socket.id)
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// Gemeinsames Projekt (Yjs)

type ProjectPeer = { socket: LiveSocket, context: LivePeerContext, clients: Set<number> }

class ProjectRoom implements Room {
  private doc = new Y.Doc()
  private awareness = new awarenessProtocol.Awareness(this.doc)
  private peers = new Map<string, ProjectPeer>()
  private loading = new Map<string, Promise<void>>()

  constructor(private projectId: string) {
    this.awareness.setLocalState(null)
    this.doc.on('update', (update: Uint8Array) => {
      const encoder = encoding.createEncoder()
      encoding.writeVarUint(encoder, LIVE_KIND.sync)
      syncProtocol.writeUpdate(encoder, update)
      this.broadcast(encoding.toUint8Array(encoder))
    })
    this.awareness.on('update', ({ added, updated, removed }: { added: number[], updated: number[], removed: number[] }, origin: unknown) => {
      // Merken, welche Yjs-Clients zu welcher Verbindung gehören (beim Trennen entfernen)
      const peer = typeof origin === 'string' ? this.peers.get(origin) : undefined
      if (peer) {
        for (const id of [...added, ...updated]) peer.clients.add(id)
        for (const id of removed) peer.clients.delete(id)
      }
      const changed = [...added, ...updated, ...removed]
      const encoder = encoding.createEncoder()
      encoding.writeVarUint(encoder, LIVE_KIND.awareness)
      encoding.writeVarUint8Array(encoder, awarenessProtocol.encodeAwarenessUpdate(this.awareness, changed))
      this.broadcast(encoding.toUint8Array(encoder))
    })
  }

  get empty() {
    return this.peers.size === 0
  }

  join(socket: LiveSocket, context: LivePeerContext) {
    this.peers.set(socket.id, { socket, context, clients: new Set() })
    const { user } = context
    socket.send(json({ t: 'welcome', userId: user.id, name: user.displayName, color: liveColor(user.id), writable: context.writable } satisfies LiveProjectServerMessage))
    // Abgleich anstoßen (Schritt 1) und Anwesenheit der anderen schicken
    const encoder = encoding.createEncoder()
    encoding.writeVarUint(encoder, LIVE_KIND.sync)
    syncProtocol.writeSyncStep1(encoder, this.doc)
    socket.send(encoding.toUint8Array(encoder))
    const states = [...this.awareness.getStates().keys()]
    if (states.length) {
      const aware = encoding.createEncoder()
      encoding.writeVarUint(aware, LIVE_KIND.awareness)
      encoding.writeVarUint8Array(aware, awarenessProtocol.encodeAwarenessUpdate(this.awareness, states))
      socket.send(encoding.toUint8Array(aware))
    }
  }

  async message(socket: LiveSocket, context: LivePeerContext, data: Uint8Array) {
    const decoder = decoding.createDecoder(data)
    const kind = decoding.readVarUint(decoder)
    if (kind === LIVE_KIND.sync) {
      // Nur lesen: Schritt 1 (Stand anfragen) ja, Änderungen nein
      const type = decoding.peekVarUint(decoder)
      if (!context.writable && type !== syncProtocol.messageYjsSyncStep1) return
      const encoder = encoding.createEncoder()
      encoding.writeVarUint(encoder, LIVE_KIND.sync)
      syncProtocol.readSyncMessage(decoder, encoder, this.doc, socket.id)
      if (encoding.length(encoder) > 1) socket.send(encoding.toUint8Array(encoder))
    }
    else if (kind === LIVE_KIND.awareness) {
      awarenessProtocol.applyAwarenessUpdate(this.awareness, decoding.readVarUint8Array(decoder), socket.id)
    }
    else if (kind === LIVE_KIND.json) {
      const message = parseJson(data) as LiveProjectClientMessage | null
      if (message) await this.control(socket, context, message)
    }
  }

  private async control(socket: LiveSocket, context: LivePeerContext, message: LiveProjectClientMessage) {
    if (message.t === 'open' && typeof message.path === 'string') {
      await this.load(context, message.path, typeof message.content === 'string' ? message.content : undefined)
      socket.send(json({ t: 'opened', path: message.path } satisfies LiveProjectServerMessage))
    }
    else if (message.t === 'saved' && typeof message.path === 'string') {
      this.broadcast(json({ t: 'saved', path: message.path, by: context.user.id } satisfies LiveProjectServerMessage), socket.id)
    }
    else if (message.t === 'files' && context.writable) {
      // Umbenannte/gelöschte Dateien aus dem Dokument nehmen – sonst käme beim erneuten Anlegen der alte Stand zurück
      const removed = Array.isArray(message.removed) ? message.removed.filter((p): p is string => typeof p === 'string') : []
      if (removed.length) {
        this.doc.transact(() => {
          for (const map of [this.doc.getMap('texts'), this.doc.getMap('blocks')]) {
            for (const key of [...map.keys()]) if (removed.some(p => key === p || key.startsWith(`${p}/`))) map.delete(key)
          }
        })
      }
      this.broadcast(json({ t: 'files', by: context.user.id } satisfies LiveProjectServerMessage), socket.id)
    }
  }

  /** Datei ins gemeinsame Dokument holen (einmal): Stand aus der Cloud, für neue Dateien der des Clients */
  private load(context: LivePeerContext, path: string, fallback?: string) {
    const kind = liveFileKind(path)
    if (!kind || !isValidCloudPath(path)) return Promise.resolve()
    const map = kind === 'text' ? this.doc.getMap<Y.Text>('texts') : this.doc.getMap<Y.Map<string>>('blocks')
    if (map.has(path)) return Promise.resolve()
    let pending = this.loading.get(path)
    if (!pending) {
      pending = (async () => {
        const [row] = await withUserDb(context.user.id, tx => tx.select({ content: cloudFiles.content }).from(cloudFiles)
          .where(and(eq(cloudFiles.projectId, this.projectId), eq(cloudFiles.path, path), eq(cloudFiles.deleted, false))))
        const content = row?.content ?? (context.writable ? fallback : undefined)
        if (content === undefined || map.has(path)) return
        this.doc.transact(() => {
          if (kind === 'text') {
            const text = new Y.Text()
            text.insert(0, content)
            ;(map as Y.Map<Y.Text>).set(path, text)
          }
          else {
            const blocks = new Y.Map<string>()
            for (const [key, value] of Object.entries(splitWorkspace(content))) blocks.set(key, value)
            ;(map as Y.Map<Y.Map<string>>).set(path, blocks)
          }
        }, 'server')
      })().finally(() => this.loading.delete(path))
      this.loading.set(path, pending)
    }
    return pending
  }

  leave(socket: LiveSocket) {
    const peer = this.peers.get(socket.id)
    this.peers.delete(socket.id)
    if (peer?.clients.size) awarenessProtocol.removeAwarenessStates(this.awareness, [...peer.clients], null)
  }

  private broadcast(data: Uint8Array, except?: string) {
    for (const [id, peer] of this.peers) if (id !== except) peer.socket.send(data)
  }
}
