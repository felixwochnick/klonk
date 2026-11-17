import type { RobotCommand } from '@klonk/klonk-script'
import { applyCommand, type LiveRunHost } from '@klonk/runtime'
import type { LiveInboxEvent, LivePlayer, LiveResponse, LiveWorldServerMessage } from '@klonk/runtime/live'
import { World, type WorldData } from '@klonk/world'
import { LiveSocket, type LiveStatus } from './socket'

/**
 * Gemeinsame Welt einer Untergruppe im Browser: angezeigte Welt (folgt dem Server), eigene Figur, Personen im Raum und
 * die Schnittstelle für den ProgramRunner (Befehle bestätigen lassen, bestätigte Änderungen an den Worker weitergeben).
 */
export class LiveWorldSession {
  world: World | null = null
  figure: string | null = null
  spectator = false
  userId = ''
  players: LivePlayer[] = []
  status: LiveStatus = 'connecting'

  /** Personen, eigene Figur, Verbindung oder die Welt (Befehl) haben sich geändert */
  onChange?: () => void
  /** Angezeigte Welt komplett ersetzt (Beitreten, Zurücksetzen, Abgleich) */
  onWorld?: (world: World) => void
  /** Jemand hat die Welt zurückgesetzt (laufende Programme passen nicht mehr dazu) */
  onReset?: (by: LivePlayer | undefined) => void

  private socket: LiveSocket
  private listeners = new Set<(event: LiveInboxEvent) => void>()
  private pending = new Map<number, (response: LiveResponse) => void>()
  private ref = 0

  constructor(readonly groupId: string) {
    this.socket = new LiveSocket({ world: groupId }, {
      json: message => this.receive(message as LiveWorldServerMessage),
      close: () => this.failPending(),
      status: (status) => {
        this.status = status
        this.onChange?.()
      },
    })
  }

  private receive(message: LiveWorldServerMessage) {
    switch (message.t) {
      case 'welcome':
        this.userId = message.you.userId
        this.figure = message.you.figure
        this.spectator = message.you.spectator
        this.players = message.players
        this.replace(message.world)
        this.onChange?.()
        break
      case 'cmd':
        try {
          applyCommand(this.world!, message.command)
        }
        catch {
          // Anzeige weicht ab (sollte nicht vorkommen) ⇒ ganze Welt neu holen
          this.socket.sendJson({ t: 'sync' })
        }
        for (const listener of this.listeners) listener({ type: 'command', command: message.command })
        if (message.ref !== undefined) this.settle(message.ref, { ok: true })
        this.onChange?.()
        break
      case 'reject':
        this.settle(message.ref, { ok: false, code: message.code, params: message.params })
        break
      case 'world':
        this.replace(message.world)
        if (message.reason === 'reset') this.onReset?.(this.players.find(p => p.userId === message.by))
        break
      case 'players':
        this.players = message.players
        this.onChange?.()
        break
      case 'you':
        this.figure = message.figure
        this.onChange?.()
        break
    }
  }

  private replace(data: WorldData) {
    this.world = new World(data)
    for (const listener of this.listeners) listener({ type: 'world', world: data })
    this.onWorld?.(this.world)
    this.onChange?.()
  }

  private settle(ref: number, response: LiveResponse) {
    const resolve = this.pending.get(ref)
    this.pending.delete(ref)
    resolve?.(response)
  }

  private failPending() {
    for (const ref of [...this.pending.keys()]) this.settle(ref, { ok: false, code: 'live_disconnected', params: {} })
  }

  /** Für ProgramRunner.run({ live }) */
  runHost(): LiveRunHost {
    return {
      execute: (command: RobotCommand) => new Promise<LiveResponse>((resolve) => {
        if (!this.socket.open) return resolve({ ok: false, code: 'live_disconnected', params: {} })
        const ref = ++this.ref
        this.pending.set(ref, resolve)
        this.socket.sendJson({ t: 'cmd', ref, command })
      }),
      subscribe: (listener) => {
        this.listeners.add(listener)
        return () => this.listeners.delete(listener)
      },
      snapshot: () => this.world!.toJSON(),
    }
  }

  /** Alle zurück auf die Startwelt (laufende Programme der anderen halten an) */
  reset() {
    this.socket.sendJson({ t: 'reset' })
  }

  close() {
    this.socket.close()
    this.failPending()
    this.listeners.clear()
  }
}
